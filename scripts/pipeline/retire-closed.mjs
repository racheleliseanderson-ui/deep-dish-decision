/**
 * Retire a permanently closed restaurant.
 *
 * Rule: remove only when a first-party page or a named operator source says
 * THIS specific restaurant is permanently closed. Then drop the slug and its
 * enrichment. Never rewrite the case file onto a successor.
 *
 * Required flags:
 *   --slug=
 *   --operator=     named person or operating company
 *   --source=       URL of the operator statement, or a report that quotes it
 *   --closed=       YYYY-MM-DD when the exact day is sourced; YYYY-MM when only the month is sourced
 *   --quote=        short operator language
 *
 * Optional:
 *   --note=         why a successor was not used (recommended)
 *   --dry
 *
 *   node scripts/pipeline/retire-closed.mjs --slug=… --operator=… --source=… --closed=… --quote=…
 */
import { PATHS, appendRun, normalizeHost, readJson, snapshot, writeJson } from "./lib.mjs";

const CLOSED_ON_RE = /^\d{4}-\d{2}(?:-\d{2})?$/;

export function validateRetirementInput(input) {
  const errors = [];
  if (!String(input.slug || "").trim()) errors.push("slug required");
  if (!String(input.operator || "").trim()) errors.push("named operator required");
  if (!/^https?:\/\/\S+\.\S+/i.test(String(input.source || ""))) {
    errors.push("source URL required");
  }
  if (!CLOSED_ON_RE.test(String(input.closedOn || ""))) {
    errors.push("closedOn YYYY-MM or YYYY-MM-DD required");
  }
  if (String(input.quote || "").trim().length < 20) {
    errors.push("operator quote required");
  }
  if (input.successorUrl) {
    errors.push("successor rewrite is not allowed; drop the slug instead");
  }
  if (/google\.com\/maps|places\.googleapis|firecrawl/i.test(String(input.source || ""))) {
    errors.push("Google Places / Firecrawl are not operator sources");
  }
  return errors;
}

export function retiredIndex(ledger) {
  const records = ledger?.records ?? [];
  return {
    slugs: new Set(records.map((r) => r.slug).filter(Boolean)),
    hosts: new Set(records.map((r) => normalizeHost(r.website)).filter(Boolean)),
    nameCity: new Set(
      records
        .map(
          (r) =>
            `${String(r.title || "")
              .toLowerCase()
              .trim()}|${String(r.city || "")
              .toLowerCase()
              .trim()}`,
        )
        .filter((k) => k !== "|"),
    ),
  };
}

export function isRetiredListing(listing, city, index) {
  if (!index) return null;
  const title = String(listing.title || "")
    .toLowerCase()
    .trim();
  const host = normalizeHost(listing.website);
  if (listing.slug && index.slugs.has(listing.slug)) return "retired-slug";
  if (host && index.hosts.has(host)) return "retired-website";
  if (title && city && index.nameCity.has(`${title}|${String(city).toLowerCase().trim()}`)) {
    return "retired-name+city";
  }
  return null;
}

function parseArgs(argv) {
  return Object.fromEntries(
    argv.map((a) => {
      const [k, v] = a.replace(/^--/, "").split("=");
      return [k, v ?? true];
    }),
  );
}

function loadLedger() {
  return readJson(PATHS.retired, {
    note: "Restaurants removed after a first-party or named operator source said this specific restaurant is permanently closed. Slug and enrichment are dropped. Never rewritten onto a successor.",
    generatedAt: null,
    records: [],
  });
}

export function applyRetirement({ input, dataset, store, seeds, queue, ledger, retrievedAt }) {
  const errors = validateRetirementInput(input);
  if (errors.length) return { ok: false, errors };

  const record = dataset.records.find((r) => r.slug === input.slug);
  if (!record) return { ok: false, errors: [`slug not in dataset: ${input.slug}`] };
  if (ledger.records.some((r) => r.slug === input.slug)) {
    return { ok: false, errors: [`already retired: ${input.slug}`] };
  }

  const entry = {
    slug: record.slug,
    title: record.title,
    city: record.city,
    stateProvince: record.stateProvince,
    website: record.website || "",
    operator: input.operator.trim(),
    source: input.source.trim(),
    closedOn: input.closedOn,
    quote: String(input.quote).trim(),
    note: String(input.note || "").trim(),
    successor: "",
    retiredAt: retrievedAt,
  };

  dataset.records = dataset.records.filter((r) => r.slug !== input.slug);
  dataset.count = dataset.records.length;
  dataset.regions = new Set(dataset.records.map((r) => r.region)).size;
  dataset.generatedAt = retrievedAt;

  if (store.records && store.records[input.slug]) {
    delete store.records[input.slug];
    store.generatedAt = retrievedAt;
  }

  if (seeds?.batches) {
    const idx = retiredIndex({ records: [entry] });
    for (const batch of seeds.batches) {
      batch.listings = batch.listings.filter(
        (listing) => !isRetiredListing(listing, batch.city, idx),
      );
    }
  }

  const stateCode = String(record.region || "")
    .split(",")
    .pop()
    ?.trim();
  const target = queue?.cities?.find((c) => c.city === record.city && c.stateCode === stateCode);
  if (target && Number(target.inserted) > 0) {
    target.inserted = Math.max(0, Number(target.inserted) - 1);
  }

  ledger.records.push(entry);
  ledger.generatedAt = retrievedAt;
  return { ok: true, entry };
}

function inputsFromArgs(args) {
  if (args.batch) {
    const batch = readJson(args.batch, null);
    const items = Array.isArray(batch) ? batch : batch?.retirements;
    if (!items?.length) throw new Error(`batch file empty: ${args.batch}`);
    return items.map((item) => ({
      slug: item.slug,
      operator: item.operator,
      source: item.source,
      closedOn: item.closedOn || item.closed,
      quote: item.quote,
      note: item.note,
      successorUrl: item.successorUrl || item.successor || "",
    }));
  }
  return [
    {
      slug: args.slug,
      operator: args.operator,
      source: args.source,
      closedOn: args.closed,
      quote: args.quote,
      note: args.note,
      successorUrl: args.successor || args.successorUrl || "",
    },
  ];
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const DRY = Boolean(args.dry);
  const inputs = inputsFromArgs(args);

  const dataset = readJson(PATHS.dataset, null);
  if (!dataset) throw new Error("dataset.json not found");
  const store = readJson(PATHS.enrichment, { records: {} });
  const seeds = readJson(PATHS.seedListings, { batches: [] });
  const queue = readJson(PATHS.queue, { cities: [] });
  const ledger = loadLedger();
  const retrievedAt = new Date().toISOString();
  const applied = [];

  for (const input of inputs) {
    const result = applyRetirement({ input, dataset, store, seeds, queue, ledger, retrievedAt });
    if (!result.ok) {
      console.error(`retire-closed failed (${input.slug || "?"}): ${result.errors.join("; ")}`);
      process.exit(1);
    }
    applied.push(result.entry);
    console.log(
      `${DRY ? "dry " : ""}retire ${result.entry.slug} — ${result.entry.title}, ${result.entry.city}; closed ${result.entry.closedOn}`,
    );
  }

  if (DRY) {
    console.log(
      `Dry run — would retire ${applied.length}. Corpus would be ${dataset.records.length}.`,
    );
    process.exit(0);
  }

  const snapshotDir = snapshot("retire-closed");
  writeJson(PATHS.dataset, dataset);
  writeJson(PATHS.enrichment, store);
  writeJson(PATHS.seedListings, seeds);
  writeJson(PATHS.queue, queue);
  writeJson(PATHS.retired, ledger);

  appendRun({
    kind: "retire-closed",
    startedAt: retrievedAt,
    finishedAt: new Date().toISOString(),
    slugs: applied.map((e) => e.slug),
    records: applied.map((e) => ({
      slug: e.slug,
      operator: e.operator,
      source: e.source,
      closedOn: e.closedOn,
    })),
    snapshot: snapshotDir,
    successor: "",
  });

  console.log(
    `Retired ${applied.length}. Successor not written. Corpus now ${dataset.records.length}.`,
  );
}

const invoked = process.argv[1] && /retire-closed\.mjs$/.test(process.argv[1]);
if (invoked) main();
