#!/usr/bin/env node
/**
 * Break enrichment.json into one file per region group.
 *
 * The whole 2.8 MB blob was a static import in src/lib/enrichment.ts, so Vite
 * bundled it into a 2.2 MB client chunk that every /record/<slug> page pulled
 * down — the enrichment for all 1,094 restaurants, to render the audit for
 * one. Nothing errored, so it never looked like a bug; it just made the
 * most-visited page in the product slow.
 *
 * Same shape as the live index: one file per region group, loaded on demand by
 * the page that needs it. A record page now fetches its own region and nothing
 * else.
 *
 * enrichment.json stays the source of truth — the pipeline writes it, this
 * reads it. Run after any pipeline pass that touches enrichment.
 */
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const outDir = join(root, "src/data/enrichment");

// Mirrors regionGroupFileName in src/lib/corpus-meta.ts. Kept in step by
// enrichment-split.test.mjs, which fails if the two ever disagree.
const fileNameFor = (group) =>
  String(group ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const enrichment = JSON.parse(readFileSync(join(root, "src/data/enrichment.json"), "utf8"));
const records = JSON.parse(readFileSync(join(root, "src/data/dataset.json"), "utf8")).records;

const groupOf = new Map(records.map((r) => [r.slug, r.regionGroup]));

const buckets = new Map();
let orphaned = 0;
for (const [slug, entry] of Object.entries(enrichment.records ?? {})) {
  const group = groupOf.get(slug);
  if (!group) {
    // An enrichment row whose record has been retired. Dropping it is correct —
    // nothing can render it — but it should be visible, not silent.
    orphaned += 1;
    continue;
  }
  const key = fileNameFor(group);
  if (!buckets.has(key)) buckets.set(key, {});
  buckets.get(key)[slug] = entry;
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

let biggest = 0;
for (const [key, group] of buckets) {
  const body = JSON.stringify({ regionGroup: key, records: group });
  writeFileSync(join(outDir, `${key}.json`), body);
  biggest = Math.max(biggest, body.length);
}

const total = readdirSync(outDir).reduce(
  (n, f) => n + readFileSync(join(outDir, f)).length,
  0,
);
const before = readFileSync(join(root, "src/data/enrichment.json")).length;

console.log(`${buckets.size} region files -> src/data/enrichment/`);
console.log(`  source        ${(before / 1e6).toFixed(2)} MB (one static import, shipped whole)`);
console.log(`  split total   ${(total / 1e6).toFixed(2)} MB across ${buckets.size} files`);
console.log(`  largest file  ${(biggest / 1e3).toFixed(0)} KB  <- the worst case a page now loads`);
if (orphaned) console.log(`  ${orphaned} enrichment rows had no record and were dropped`);
