/**
 * Phase 1 — enrich existing records. Creates no new restaurants.
 *
 * Usage: node scripts/pipeline/enrich.mjs [--batch=10] [--slugs=a,b] [--refresh]
 *
 * Third-party evidence is written into src/data/enrichment.json, keyed by slug,
 * and never overwrites the first-party fields in dataset.json.
 */
import {
  PATHS,
  appendRun,
  completeness,
  createLimiter,
  firecrawlClient,
  googleClient,
  normalizeHost,
  normalizePhone,
  readJson,
  shapeGoogle,
  similarity,
  snapshot,
  writeJson,
} from "./lib.mjs";
import { summarize } from "./summarize.mjs";
import { extractFromSite, pickSitePages } from "./site.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);

const BATCH = Number(args.batch ?? 10);
const ONLY = args.slugs ? String(args.slugs).split(",") : null;
const REFRESH = Boolean(args.refresh);

const dataset = readJson(PATHS.dataset, null);
if (!dataset) throw new Error("dataset.json not found");
const store = readJson(PATHS.enrichment, { generatedAt: null, records: {} });

const candidates = dataset.records.filter((r) => {
  if (ONLY) return ONLY.includes(r.slug);
  const existing = store.records[r.slug];
  if (!existing) return true;
  if (REFRESH) return true;
  return existing.meta?.matchStatus === "deferred";
});

const batch = candidates.slice(0, BATCH);
if (!batch.length) {
  console.log("Nothing to enrich — every record already carries enrichment. Use --refresh to re-check.");
  process.exit(0);
}

const snapshotDir = snapshot("enrich");
const gLimiter = createLimiter({ minDelayMs: 220 });
const fLimiter = createLimiter({ minDelayMs: 600 });
const google = googleClient(gLimiter);
const firecrawl = firecrawlClient(fLimiter);
const startedAt = new Date().toISOString();
const log = [];

/** Accept a Places result only on name similarity plus location agreement. */
function chooseMatch(record, places) {
  const wantHost = normalizeHost(record.website);
  const wantPhone = normalizePhone(record.phone);
  const wantState = (record.stateProvince || "").toLowerCase();
  let best = null;
  for (const p of places ?? []) {
    const name = similarity(record.title, p.displayName?.text ?? "");
    const host = Boolean(wantHost) && normalizeHost(p.websiteUri) === wantHost;
    const phone = Boolean(wantPhone) && normalizePhone(p.nationalPhoneNumber) === wantPhone;
    const addressText = (p.formattedAddress ?? "").toLowerCase();
    const stateCode = (
      p.addressComponents?.find((c) => c.types?.includes("administrative_area_level_1"))
        ?.shortText ?? ""
    ).toLowerCase();
    const cityOk = !record.city || addressText.includes(String(record.city).toLowerCase());
    const stateOk =
      !wantState || addressText.includes(wantState) || (stateCode && wantState.startsWith(stateCode));

    let confidence = 0;
    if (host) confidence += 0.45;
    if (phone) confidence += 0.35;
    confidence += name * 0.4;
    if (cityOk) confidence += 0.1;

    const acceptable = (host || phone || name >= 0.72) && cityOk && stateOk;
    if (!acceptable) continue;
    if (!best || confidence > best.confidence) {
      best = {
        place: p,
        confidence: Math.min(1, Math.round(confidence * 100) / 100),
        nameScore: Math.round(name * 100) / 100,
      };
    }
  }
  return best;
}

for (const record of batch) {
  const retrievedAt = new Date().toISOString();
  const entry = { google: null, site: null, summary: null, meta: {} };
  const notes = [];

  const query = [record.title, record.city, record.stateProvince, "restaurant"]
    .filter(Boolean)
    .join(" ");
  const search = await google.searchText(query);

  if (!search.ok) {
    entry.meta = {
      matchStatus: search.status === 429 || search.status >= 500 ? "deferred" : "error",
      confidence: 0,
      lastEnrichedAt: retrievedAt,
      note: `Places search failed (${search.status})`,
    };
    notes.push(`places ${search.status}`);
  } else {
    const match = chooseMatch(record, search.data.places);
    if (!match) {
      entry.meta = {
        matchStatus: "unresolved",
        confidence: 0,
        lastEnrichedAt: retrievedAt,
        note: "No Places result cleared the name and location thresholds.",
      };
      notes.push("unresolved");
    } else {
      entry.google = shapeGoogle(match.place, retrievedAt);
      entry.meta = {
        matchStatus: "resolved",
        confidence: match.confidence,
        nameScore: match.nameScore,
        lastEnrichedAt: retrievedAt,
      };

      // ---- first-party site scrape
      const siteUrl = record.website || entry.google.website;
      if (siteUrl) {
        const pages = [];
        const home = await firecrawl.scrape(siteUrl);
        if (home.ok) {
          pages.push({ url: siteUrl, ...home });
          for (const extra of pickSitePages(siteUrl, home.links)) {
            const page = await firecrawl.scrape(extra);
            if (page.ok) pages.push({ url: extra, ...page });
          }
        } else {
          notes.push(`site ${home.status}`);
        }
        if (pages.length) entry.site = extractFromSite(pages, retrievedAt);
      }

      // ---- summary from retrieved fields only
      const summary = await summarize(record, entry);
      if (summary) entry.summary = summary;
      else notes.push("summary skipped");
    }
  }

  entry.meta.completeness = completeness(record, entry).score;
  store.records[record.slug] = entry;

  console.log(
    `${record.slug.padEnd(28)} ${String(entry.meta.matchStatus).padEnd(10)} completeness ${String(entry.meta.completeness).padStart(3)}%${notes.length ? `  (${notes.join(", ")})` : ""}`,
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
  kind: "enrich",
  startedAt,
  finishedAt: new Date().toISOString(),
  batchSize: batch.length,
  cities: [...new Set(batch.map((r) => `${r.city}, ${r.stateProvince}`))],
  resolved: log.filter((l) => l.matchStatus === "resolved").length,
  unresolved: log.filter((l) => l.matchStatus === "unresolved").length,
  deferred: log.filter((l) => l.matchStatus === "deferred").length,
  avgCompleteness: avg,
  corpusEnriched: Object.keys(store.records).length,
  apiCalls: { google: gLimiter.stats.calls, firecrawl: fLimiter.stats.calls },
  retries: gLimiter.stats.retries + fLimiter.stats.retries,
  failures: gLimiter.stats.failures + fLimiter.stats.failures,
  snapshot: snapshotDir,
  records: log,
});

console.log(
  `\nBatch of ${batch.length} done. Corpus enriched: ${Object.keys(store.records).length}/${dataset.records.length}. Average completeness ${avg}%.`,
);
