#!/usr/bin/env node
/**
 * Fail closed if the 836-record hub is replaced by a confirmation-pass demo,
 * or if the Lovable Vercel production stack is swapped for an incompatible overlay.
 *
 * Override (deliberate migration only):
 *   ALLOW_CORPUS_MIGRATION=1 node scripts/corpus-invariants.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FLOOR = Number(process.env.CORPUS_FLOOR ?? 800);
const allow = process.env.ALLOW_CORPUS_MIGRATION === "1";

const requiredFiles = [
  "src/data/dataset.json",
  "src/assets/hero-pass.jpg",
  "src/assets/fig-gold.jpg",
  "src/routes/index.tsx",
  "src/routes/record.$slug.tsx",
  "src/routes/atlas.tsx",
  "src/routes/console.tsx",
  "src/routes/guide.tsx",
  "src/routes/shortlist.tsx",
  "src/lib/intelligence.ts",
  "src/start.ts",
  "src/server.ts",
  "vite.config.ts",
  "scripts/pipeline/report.mjs",
  "scripts/pipeline/enrich.mjs",
];

const forbiddenFiles = [
  "server/middleware/grok-pwa.ts",
  "src/data/restaurants.ts",
];

const errors = [];

for (const rel of requiredFiles) {
  if (!existsSync(resolve(root, rel))) errors.push(`missing ${rel}`);
}

for (const rel of forbiddenFiles) {
  if (existsSync(resolve(root, rel))) {
    if (rel === "src/data/restaurants.ts") continue; // handled with floor below
    errors.push(`${rel} must not ship on canonical main`);
  }
}

const vitePath = resolve(root, "vite.config.ts");
if (existsSync(vitePath)) {
  const viteCfg = readFileSync(vitePath, "utf8");
  if (!viteCfg.includes("@lovable.dev/vite-tanstack-config")) {
    errors.push("vite.config.ts is not the Lovable production stack");
  }
  if (viteCfg.includes("grokPwaPlugin")) {
    errors.push("vite.config.ts includes grokPwaPlugin — that overlay 500s on Vercel");
  }
}

const pkgPath = resolve(root, "package.json");
if (existsSync(pkgPath)) {
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  const build = String(pkg.scripts?.build ?? "");
  if (build !== "vite build") {
    errors.push(`package.json build script must be "vite build" (got ${JSON.stringify(build)})`);
  }
  if (!pkg.devDependencies?.["@lovable.dev/vite-tanstack-config"]) {
    errors.push("missing @lovable.dev/vite-tanstack-config — Vercel framework tanstack-start-lovable requires it");
  }
}

const demoRestaurants = resolve(root, "src/data/restaurants.ts");
const datasetPath = resolve(root, "src/data/dataset.json");

let count = 0;
let regions = 0;
/** @type {string[]} */
let slugs = [];

if (existsSync(datasetPath)) {
  const data = JSON.parse(readFileSync(datasetPath, "utf8"));
  count = Number(data.count ?? data.records?.length ?? 0);
  const recs = Array.isArray(data.records) ? data.records : [];
  if (recs.length !== count) errors.push(`dataset.count ${count} !== records.length ${recs.length}`);
  regions = Number(data.regions ?? 0);
  slugs = recs.map((r) => r.slug).filter(Boolean);
  const uniq = new Set(slugs);
  if (uniq.size !== slugs.length) errors.push("duplicate slugs in dataset");
  if (count < FLOOR) {
    errors.push(`record count ${count} fell below floor ${FLOOR}`);
  }
  if (regions < 50) {
    errors.push(`geographic coverage collapsed to ${regions} regions`);
  }
  const fields = ["slug", "title", "region", "cuisineContext", "menuSummary", "priceDetails"];
  for (const r of recs.slice(0, 25)) {
    for (const f of fields) {
      if (typeof r[f] !== "string") errors.push(`schema: ${r.slug ?? "?"} missing ${f}`);
    }
  }
} else {
  errors.push("canonical dataset.json disappeared");
}

if (existsSync(demoRestaurants) && count < FLOOR) {
  errors.push("src/data/restaurants.ts present while corpus is below floor — refusing demo substitution");
}

if (errors.length) {
  const body = errors.map((e) => ` - ${e}`).join("\n");
  if (allow) {
    console.warn(`[corpus-invariants] ALLOW_CORPUS_MIGRATION=1 — would have failed:\n${body}`);
    process.exit(0);
  }
  console.error(`[corpus-invariants] FAILED\n${body}`);
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      count,
      regions,
      slugs: slugs.length,
      floor: FLOOR,
      stack: "lovable",
    },
    null,
    2,
  ),
);
