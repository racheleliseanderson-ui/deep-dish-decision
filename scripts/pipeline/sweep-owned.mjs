#!/usr/bin/env node
/**
 * Move through the whole Deep Dish corpus without getting trapped on the same
 * low-completeness records.
 *
 * Hygiene mode intentionally prioritizes thin/failing records, which is useful
 * for repair but poor for a broad seeding pass: a record can remain thin after
 * a successful read and immediately win the next hygiene batch again. This
 * sweep instead orders every record by last owned-site enrichment, oldest first
 * (never-enriched first), and hands exactly one batch to enrich.mjs.
 *
 * The result is a rolling first-party refresh. Re-run it and the records just
 * touched fall to the back of the queue automatically.
 *
 * Usage:
 *   node scripts/pipeline/sweep-owned.mjs --batch=100
 *   node scripts/pipeline/sweep-owned.mjs --batch=25 --dry
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (path) => JSON.parse(readFileSync(join(root, path), "utf8"));
const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, "").split("=");
    return [key, value ?? true];
  }),
);

const BATCH = Math.max(1, Math.min(250, Number(args.batch ?? 100) || 100));
const DRY = Boolean(args.dry);
const dataset = read("src/data/dataset.json");
const enrichment = read("src/data/enrichment.json");

const timestamp = (value) => {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
};

const candidates = (dataset.records ?? [])
  .map((record) => {
    const entry = enrichment.records?.[record.slug] ?? null;
    return {
      slug: record.slug,
      title: record.title,
      city: record.city ?? "",
      lastEnrichedAt: entry?.meta?.lastEnrichedAt ?? null,
      lastMs: timestamp(entry?.meta?.lastEnrichedAt),
      completeness: Number(entry?.meta?.completeness ?? 0),
      matchStatus: entry?.meta?.matchStatus ?? "never-enriched",
    };
  })
  .sort(
    (a, b) =>
      a.lastMs - b.lastMs ||
      a.completeness - b.completeness ||
      a.slug.localeCompare(b.slug),
  );

const selected = candidates.slice(0, BATCH);
const never = selected.filter((row) => row.lastMs === 0).length;
const oldest = selected[0]?.lastEnrichedAt ?? "never";
const newest = selected.at(-1)?.lastEnrichedAt ?? "never";

console.log(`Owned-site sweep: ${selected.length}/${candidates.length} records`);
console.log(`  never enriched in batch: ${never}`);
console.log(`  age window: ${oldest} -> ${newest}`);
for (const row of selected.slice(0, 12)) {
  console.log(
    `  ${row.slug.padEnd(38)} ${String(row.completeness).padStart(3)}%  ${row.matchStatus}  ${row.lastEnrichedAt ?? "never"}`,
  );
}
if (selected.length > 12) console.log(`  ... ${selected.length - 12} more`);

if (DRY) {
  console.log("\n--dry: no owned sites read and no files changed.");
  process.exit(0);
}

if (!selected.length) {
  console.log("Nothing to sweep.");
  process.exit(0);
}

function run(scriptArgs) {
  const result = spawnSync(process.execPath, scriptArgs, {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run([
  "scripts/pipeline/enrich.mjs",
  `--slugs=${selected.map((row) => row.slug).join(",")}`,
]);

// Turn newly captured first-party evidence into the files the app and database
// actually consume. These are all deterministic and offline after enrichment.
run(["scripts/pipeline/extract-first-party-dishes.mjs"]);
run(["scripts/pipeline/build-live-index.mjs"]);
run(["scripts/pipeline/inject-first-party-dishes.mjs"]);
run(["scripts/pipeline/split-enrichment.mjs"]);
run(["scripts/pipeline/report.mjs"]);

console.log(`\nOwned-site sweep complete: ${selected.length} records refreshed.`);
