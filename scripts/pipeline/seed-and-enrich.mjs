/**
 * Seed verified listing batches, then immediately enrich only the records
 * inserted by that seed run using owned-site first-party reads.
 *
 * Usage:
 *   node scripts/pipeline/seed-and-enrich.mjs
 *   node scripts/pipeline/seed-and-enrich.mjs --cities=Richmond,Memphis
 *   node scripts/pipeline/seed-and-enrich.mjs --dry
 */
import { spawnSync } from "node:child_process";
import { PATHS, readJson } from "./lib.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);

const startedAt = Date.now();
const seedArgs = ["scripts/pipeline/seed-listings.mjs"];
if (args.cities) seedArgs.push(`--cities=${args.cities}`);
if (args.dry) seedArgs.push("--dry");

function run(scriptArgs) {
  const result = spawnSync(process.execPath, scriptArgs, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(seedArgs);
if (args.dry) process.exit(0);

const log = readJson(PATHS.runLog, { runs: [] });
const seedRun = log.runs.find(
  (entry) =>
    entry?.kind === "seed-listings" && Date.parse(entry.startedAt || "") >= startedAt - 1000,
);
const insertedSlugs = Array.isArray(seedRun?.insertedSlugs) ? seedRun.insertedSlugs : [];

if (!insertedSlugs.length) {
  console.log("No new records were inserted; owned-site enrichment has nothing new to process.");
  process.exit(0);
}

console.log(`\nOwned-site enriching ${insertedSlugs.length} newly inserted records...`);
run(["scripts/pipeline/enrich.mjs", `--slugs=${insertedSlugs.join(",")}`]);
run(["scripts/pipeline/report.mjs"]);

console.log(`\nSeed + owned enrichment complete for ${insertedSlugs.length} records.`);
