/**
 * Coverage + completeness report. Reads only what is already on disk, so it can
 * be run at any time without spending an API call. Writes src/data/coverage.json
 * for the Coverage Console route.
 */
import { PATHS, completeness, readJson, writeJson } from "./lib.mjs";
import { STATES, regionCode } from "./regions.mjs";
import path from "node:path";

const dataset = readJson(PATHS.dataset, { records: [] });
const store = readJson(PATHS.enrichment, { records: {} });
const queue = readJson(PATHS.queue, { settings: {}, cities: [] });
const runLog = readJson(PATHS.runLog, { runs: [] });

const byState = new Map();
const rows = [];

for (const record of dataset.records) {
  const entry = store.records[record.slug] ?? null;
  const score = entry ? completeness(record, entry).score : 0;
  const code = regionCode(entry?.google?.address?.stateCode || record.stateProvince);
  rows.push({
    slug: record.slug,
    title: record.title,
    stateCode: code,
    city: entry?.google?.address?.locality || record.city,
    completeness: score,
    matchStatus: entry?.meta?.matchStatus ?? "none",
    rating: entry?.google?.rating ?? null,
    reviewCount: entry?.google?.reviewCount ?? null,
    priceBand: entry?.google?.priceBand ?? "",
    lastEnrichedAt: entry?.meta?.lastEnrichedAt ?? null,
    addedAt: record.addedAt ?? null,
  });
  const bucket = byState.get(code) ?? { code, count: 0, scoreSum: 0, enriched: 0 };
  bucket.count += 1;
  if (entry) {
    bucket.enriched += 1;
    bucket.scoreSum += score;
  }
  byState.set(code, bucket);
}

const usCodes = Object.values(STATES).map((s) => s.code);
const states = usCodes
  .map((code) => {
    const b = byState.get(code);
    const meta = Object.values(STATES).find((s) => s.code === code);
    return {
      code,
      count: b?.count ?? 0,
      enriched: b?.enriched ?? 0,
      avgCompleteness: b?.enriched ? Math.round(b.scoreSum / b.enriched) : 0,
      population: meta?.population ?? 0,
      perMillion: meta?.population
        ? Math.round(((b?.count ?? 0) / (meta.population / 1_000_000)) * 100) / 100
        : 0,
    };
  })
  .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));

const outsideUs = [...byState.entries()]
  .filter(([code]) => code && !usCodes.includes(code))
  .map(([code, b]) => ({
    code,
    count: b.count,
    avgCompleteness: b.enriched ? Math.round(b.scoreSum / b.enriched) : 0,
  }))
  .sort((a, b) => b.count - a.count);

const scored = rows.filter((r) => r.completeness > 0).map((r) => r.completeness);
const bands = [
  { label: "90-100", min: 90 },
  { label: "75-89", min: 75 },
  { label: "50-74", min: 50 },
  { label: "under 50", min: 0 },
];

const coverage = {
  generatedAt: new Date().toISOString(),
  totals: {
    records: dataset.records.length,
    enriched: Object.keys(store.records).length,
    resolved: rows.filter((r) => r.matchStatus === "resolved").length,
    unresolved: rows.filter((r) => r.matchStatus === "unresolved").length,
    statesCovered: states.filter((s) => s.count > 0).length,
    statesTotal: usCodes.length,
    avgCompleteness: scored.length
      ? Math.round(scored.reduce((a, b) => a + b, 0) / scored.length)
      : 0,
    withRating: rows.filter((r) => r.rating != null).length,
    withPrice: rows.filter((r) => r.priceBand).length,
  },
  distribution: bands.map((band, i) => {
    const max = i === 0 ? 101 : bands[i - 1].min;
    return {
      label: band.label,
      count: rows.filter((r) => r.completeness >= band.min && r.completeness < max).length,
    };
  }),
  states,
  outsideUs,
  records: rows.sort((a, b) => b.completeness - a.completeness),
  recent: [...rows]
    .filter((r) => r.lastEnrichedAt)
    .sort((a, b) => String(b.lastEnrichedAt).localeCompare(String(a.lastEnrichedAt)))
    .slice(0, 12),
  queue: {
    paused: queue.settings?.paused ?? false,
    restaurantsPerRun: queue.settings?.restaurantsPerRun ?? 0,
    citiesPerRun: queue.settings?.citiesPerRun ?? 0,
    dailyCap: queue.settings?.dailyCap ?? 0,
    pending: (queue.cities ?? []).filter((c) => c.status === "pending").length,
    done: (queue.cities ?? []).filter((c) => c.status === "done").length,
    next: (queue.cities ?? []).filter((c) => c.status === "pending").slice(0, 10),
  },
  runs: (runLog.runs ?? []).slice(0, 8).map((r) => ({
    kind: r.kind,
    startedAt: r.startedAt,
    batchSize: r.batchSize ?? 0,
    inserted: r.inserted ?? 0,
    cities: r.cities ?? [],
    resolved: r.resolved ?? 0,
    unresolved: r.unresolved ?? 0,
    avgCompleteness: r.avgCompleteness ?? 0,
    apiCalls: r.apiCalls ?? {},
    retries: r.retries ?? 0,
    failures: r.failures ?? 0,
    flagged: r.flagged ?? false,
  })),
};

writeJson(path.join(process.cwd(), "src/data/coverage.json"), coverage);

console.log(
  [
    `records            ${coverage.totals.records}`,
    `enriched           ${coverage.totals.enriched}`,
    `resolved           ${coverage.totals.resolved}`,
    `unresolved         ${coverage.totals.unresolved}`,
    `avg completeness   ${coverage.totals.avgCompleteness}%`,
    `US states covered  ${coverage.totals.statesCovered}/${coverage.totals.statesTotal}`,
    `queue pending      ${coverage.queue.pending}`,
  ].join("\n"),
);
