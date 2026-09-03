#!/usr/bin/env node
/**
 * Mark exact current restaurant records as source-limited when an operator-managed
 * platform identity exists but no clearly owned restaurant domain is confirmed.
 *
 * Platform content is not scraped or promoted into owned-site policy evidence.
 */
import path from "node:path";
import { PATHS, appendRun, completeness, readJson, snapshot, writeJson } from "./lib.mjs";
import { applySourceLimitedRecord, sourceLimitedMeta } from "./source-limited.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, "").split("=");
    return [key, value ?? true];
  }),
);

const manifestPath = path.resolve(
  process.cwd(),
  String(args.manifest || "src/data/source-limited-2026-08-20.json"),
);
const manifest = readJson(manifestPath, null);
if (!manifest?.records?.length)
  throw new Error(`source-limited manifest missing/empty: ${manifestPath}`);

const dataset = readJson(PATHS.dataset, null);
if (!dataset?.records) throw new Error("dataset.json not found");
const store = readJson(PATHS.enrichment, { generatedAt: null, records: {} });
const bySlug = new Map(dataset.records.map((record) => [record.slug, record]));
const startedAt = new Date().toISOString();
const snapshotDir = snapshot("source-limited");
const results = [];

for (const task of manifest.records) {
  const record = bySlug.get(task.slug);
  if (!record) {
    results.push({ slug: task.slug, status: "missing" });
    continue;
  }

  const reviewedAt = new Date().toISOString();
  applySourceLimitedRecord(record, task, reviewedAt);
  const prior = store.records[record.slug] ?? {};
  const entry = {
    ...(prior.google ? { google: prior.google } : {}),
    ...(prior.summary ? { summary: prior.summary } : {}),
    ...(prior.site ? { site: prior.site } : {}),
    meta: sourceLimitedMeta(prior.meta, reviewedAt),
  };
  // If stale site evidence exists from a former/invalid website route, do not use
  // it to claim the current operator platform was scraped. Keep it only if its
  // source URLs are still an owned-domain route; source-limited records here have
  // no confirmed owned domain, so discard the site block from effective evidence.
  delete entry.site;
  entry.meta.completeness = completeness(record, entry).score;
  store.records[record.slug] = entry;

  results.push({
    slug: record.slug,
    status: "source-limited",
    officialSource: record.officialSource,
    completeness: entry.meta.completeness,
  });
}

dataset.count = dataset.records.length;
dataset.generatedAt = new Date().toISOString();
store.generatedAt = new Date().toISOString();
writeJson(PATHS.dataset, dataset);
writeJson(PATHS.enrichment, store);

appendRun({
  kind: "source-review",
  startedAt,
  finishedAt: new Date().toISOString(),
  batchSize: results.length,
  sourceLimited: results.filter((r) => r.status === "source-limited").length,
  missing: results.filter((r) => r.status === "missing").length,
  snapshot: snapshotDir,
  records: results.map((r) => ({
    slug: r.slug,
    matchStatus: r.status,
    completeness: r.completeness ?? 0,
    notes:
      r.status === "source-limited" ? ["operator platform; no owned domain"] : ["slug not found"],
  })),
});

const resultPath = path.resolve(
  process.cwd(),
  String(args.result || "src/data/source-limited-result.json"),
);
writeJson(resultPath, {
  generatedAt: new Date().toISOString(),
  manifest: path.relative(process.cwd(), manifestPath),
  total: results.length,
  sourceLimited: results.filter((r) => r.status === "source-limited").length,
  missing: results.filter((r) => r.status === "missing").length,
  records: results,
});

console.log(JSON.stringify(readJson(resultPath, {}), null, 2));
