/**
 * Owned enrichment — first-party website reads only.
 *
 * No Google Places. No Firecrawl. No Lovable connector gateway.
 *
 * Usage:
 *   node scripts/pipeline/enrich.mjs [--batch=10] [--slugs=a,b] [--refresh]
 *   node scripts/pipeline/enrich.mjs --hygiene [--batch=25]
 *
 * Evidence is written into src/data/enrichment.json under the `site` block only,
 * keyed by slug, and never overwrites first-party fields in dataset.json.
 *
 * Existing `google` blocks from prior GPI runs are left for audit history only.
 */
import {
  PATHS,
  appendRun,
  completeness,
  readJson,
  snapshot,
  writeJson,
} from "./lib.mjs";
import { fetchSitePages } from "./own-fetch.mjs";
import { buildRefreshQueue } from "./refresh.mjs";
import { extractFromSite, pickSitePages } from "./site.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIN_DELAY_MS = 400;

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);

const HYGIENE = Boolean(args.hygiene);
const BATCH = Number(args.batch ?? (HYGIENE ? 25 : 10));
const ONLY = args.slugs ? String(args.slugs).split(",").map((s) => s.trim()).filter(Boolean) : null;
const REFRESH = Boolean(args.refresh) || HYGIENE;

const dataset = readJson(PATHS.dataset, null);
if (!dataset) throw new Error("dataset.json not found");
const store = readJson(PATHS.enrichment, { generatedAt: null, records: {} });
const bySlug = new Map(dataset.records.map((r) => [r.slug, r]));

let batch = [];
let hygieneMeta = null;

if (HYGIENE) {
  const queue = buildRefreshQueue({ dataset, store });
  writeJson(PATHS.refreshQueue, queue);
  hygieneMeta = {
    hygieneDue: queue.totals.hygiene,
    selected: queue.hygiene.slice(0, BATCH),
    reasons: Object.fromEntries(
      queue.items
        .filter((i) => queue.hygiene.slice(0, BATCH).includes(i.slug))
        .map((i) => [i.slug, i.reasons]),
    ),
  };
  batch = hygieneMeta.selected.map((s) => bySlug.get(s)).filter(Boolean);
  console.log(
    `Hygiene mode (owned site reads) — ${queue.totals.hygiene} due, taking ${batch.length}: ${batch.map((r) => r.slug).join(", ")}`,
  );
} else if (ONLY) {
  batch = ONLY.map((s) => bySlug.get(s)).filter(Boolean);
  console.log(`Slug mode — ${batch.length}: ${batch.map((r) => r.slug).join(", ")}`);
} else {
  const candidates = dataset.records.filter((r) => {
    const existing = store.records[r.slug];
    if (!existing) return true;
    if (REFRESH) return true;
    return !existing.site;
  });
  batch = candidates.slice(0, BATCH);
  console.log(
    `Batch mode — ${candidates.length} candidates, taking ${batch.length}: ${batch.map((r) => r.slug).join(", ")}`,
  );
}

if (!batch.length) {
  console.log("Nothing to enrich.");
  process.exit(0);
}

const startedAt = new Date().toISOString();
const snapshotDir = snapshot(HYGIENE ? "hygiene-owned" : "enrich-owned");
const log = [];
let pacedCalls = 0;

for (const record of batch) {
  const notes = [];
  const retrievedAt = new Date().toISOString();
  const prior = store.records[record.slug] ?? {};

  const entry = {
    ...(prior.google ? { google: prior.google } : {}),
    ...(prior.summary ? { summary: prior.summary } : {}),
    meta: {
      matchStatus: prior.meta?.matchStatus ?? "site-only",
      confidence: prior.meta?.confidence ?? null,
      nameScore: prior.meta?.nameScore ?? null,
      lastEnrichedAt: retrievedAt,
      enrichmentMode: "owned-site",
    },
  };

  const siteUrl = typeof record.website === "string" ? record.website.trim() : "";
  if (!siteUrl || !/^https?:\/\//i.test(siteUrl)) {
    notes.push("no website");
    entry.meta.matchStatus = "no-website";
  } else {
    if (pacedCalls > 0) await sleep(MIN_DELAY_MS);
    pacedCalls += 1;

    const { pages, homeError } = await fetchSitePages(siteUrl, pickSitePages);
    if (homeError) {
      notes.push(`site ${homeError}`);
      entry.meta.matchStatus = "site-failure";
    }
    if (pages.length) {
      entry.site = extractFromSite(pages, retrievedAt);
      entry.meta.matchStatus = entry.meta.matchStatus === "site-failure" ? "partial" : "resolved";
      notes.push(`pages ${pages.length}`);
    } else if (!homeError) {
      notes.push("no pages extracted");
      entry.meta.matchStatus = "empty";
    }
  }

  entry.meta.completeness = completeness(record, entry).score;
  store.records[record.slug] = entry;

  console.log(
    `${record.slug.padEnd(28)} ${String(entry.meta.matchStatus).padEnd(12)} completeness ${String(entry.meta.completeness).padStart(3)}%${notes.length ? `  (${notes.join(", ")})` : ""}`,
  );
  log.push({
    slug: record.slug,
    matchStatus: entry.meta.matchStatus,
    completeness: entry.meta.completeness,
    notes,
  });
}

store.generatedAt = new Date().toISOString();
writeJson(PATHS.enrichment, store);

const scores = Object.values(store.records)
  .map((e) => e.meta?.completeness ?? 0)
  .filter((n) => n > 0);
const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

appendRun({
  kind: HYGIENE ? "hygiene-owned" : "enrich-owned",
  startedAt,
  finishedAt: new Date().toISOString(),
  batchSize: batch.length,
  cities: [...new Set(batch.map((r) => r.coverageArea || `${r.city || ""}, ${r.stateProvince || ""}`))],
  resolved: log.filter((l) => l.matchStatus === "resolved" || l.matchStatus === "partial").length,
  unresolved: log.filter((l) => l.matchStatus === "site-failure" || l.matchStatus === "no-website").length,
  deferred: log.filter((l) => l.matchStatus === "empty").length,
  avgCompleteness: avg,
  corpusEnriched: Object.keys(store.records).length,
  apiCalls: { google: 0, firecrawl: 0, ownedFetch: pacedCalls },
  retries: 0,
  failures: log.filter((l) => String(l.matchStatus).includes("failure") || l.matchStatus === "no-website").length,
  snapshot: snapshotDir,
  records: log,
  hygiene: hygieneMeta,
});

console.log(
  `\nOwned enrichment batch of ${batch.length} done. Corpus with enrichment entries: ${Object.keys(store.records).length}/${dataset.records.length}. Average completeness ${avg}%.`,
);
console.log("No Google Places. No Firecrawl. Site reads only.\n");
