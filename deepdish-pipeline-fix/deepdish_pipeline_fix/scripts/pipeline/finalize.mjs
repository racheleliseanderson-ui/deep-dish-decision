#!/usr/bin/env node
/** Rebuild every derived data layer after corpus/enrichment changes. */
import { spawnSync } from "node:child_process";

function run(command, args, options = {}) {
  console.log(`\n> ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: false,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(process.execPath, ["scripts/pipeline/level-records.mjs"]);
run(process.execPath, ["scripts/pipeline/build-queue.mjs"]);
run(process.execPath, ["scripts/pipeline/refresh.mjs"]);
run(process.execPath, ["scripts/pipeline/report.mjs"]);
run(process.execPath, ["scripts/pipeline/build-live-index.mjs"]);
run(process.execPath, ["scripts/pipeline/split-enrichment.mjs"]);
run(process.execPath, ["scripts/pipeline/build-slug-index.mjs"]);
run(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["vite-node", "scripts/build-atlas.ts"],
  { shell: process.platform === "win32" },
);
run(process.execPath, ["scripts/build-sitemaps.mjs"]);
run(process.execPath, ["scripts/corpus-invariants.mjs"]);

console.log("\nDeep Dish derived data is rebuilt and corpus invariants passed.");
