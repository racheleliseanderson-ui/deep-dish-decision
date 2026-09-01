#!/usr/bin/env node
/**
 * Fail closed if the canonical hub is replaced by a confirmation-pass demo.
 *
 * Override (deliberate migration only):
 *   ALLOW_CORPUS_MIGRATION=1 node scripts/corpus-invariants.mjs
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FLOOR = Number(process.env.CORPUS_FLOOR ?? 800);
const allow = process.env.ALLOW_CORPUS_MIGRATION === "1";

const requiredFiles = [
  "src/data/dataset.json",
  "src/data/corpus-meta.json",
  "src/data/completeness.json",
  "src/data/listing-samples.json",
  "src/data/health-inspections.json",
  "src/data/first-party-dishes.json",
  "src/data/reputation-patterns.json",
  "src/data/visual-program.json",
  "src/data/by-region/washington.json",
  "src/assets/hero-pass.jpg",
  "src/assets/fig-gold.jpg",
  "src/routes/index.tsx",
  "src/routes/record.$slug.tsx",
  "src/routes/atlas.tsx",
  "src/routes/console.tsx",
  "src/routes/guide.tsx",
  "src/routes/shortlist.tsx",
  "src/lib/intelligence.ts",
  "scripts/pipeline/report.mjs",
  "scripts/pipeline/enrich.mjs",
];

const errors = [];

for (const rel of requiredFiles) {
  if (!existsSync(resolve(root, rel))) errors.push(`missing ${rel}`);
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

const byRegionDir = resolve(root, "src/data/by-region");
if (existsSync(byRegionDir)) {
  const files = readdirSync(byRegionDir).filter((f) => f.endsWith(".json"));
  let regionSum = 0;
  for (const f of files) {
    const chunk = JSON.parse(readFileSync(resolve(byRegionDir, f), "utf8"));
    const n = Array.isArray(chunk.records) ? chunk.records.length : 0;
    regionSum += n;
    if (n === 0) errors.push(`by-region/${f} is empty`);
  }
  if (count && regionSum !== count) {
    errors.push(`by-region records ${regionSum} !== dataset count ${count}`);
  }
} else if (count >= FLOOR) {
  errors.push("src/data/by-region missing while corpus is intact");
}

const listingPath = resolve(root, "src/data/listing-samples.json");
if (existsSync(listingPath)) {
  const listing = JSON.parse(readFileSync(listingPath, "utf8"));
  const n = Object.keys(listing.records || {}).length;
  if (n > 0 && n < 50) errors.push(`listing-samples collapsed to ${n}`);
}

const dishesPath = resolve(root, "src/data/first-party-dishes.json");
let dishCoverage = 0;
if (existsSync(dishesPath)) {
  const dishes = JSON.parse(readFileSync(dishesPath, "utf8"));
  const blob = JSON.stringify(dishes.records || {});
  if (/goldbelly/i.test(blob)) errors.push("first-party-dishes includes Goldbelly shipping copy");
  dishCoverage = Object.keys(dishes.records || {}).length;
}

let listingCoverage = 0;
if (existsSync(listingPath)) {
  listingCoverage = Object.keys(JSON.parse(readFileSync(listingPath, "utf8")).records || {}).length;
}

const visPath = resolve(root, "src/data/visual-program.json");
let imageCoverage = { totalImages: 0, documentary: 0, slugsWithPhoto: 0 };
if (existsSync(visPath)) {
  const vis = JSON.parse(readFileSync(visPath, "utf8"));
  const images = vis.images || [];
  const bySrc = new Map();
  const photoSlugs = new Set();
  for (const img of images) {
    if (img.documentary && img.slug && !slugs.includes(img.slug)) {
      errors.push(`visual ${img.src} slug ${img.slug} is not in the corpus`);
    }
    if (img.documentary) {
      imageCoverage.documentary += 1;
      photoSlugs.add(img.slug);
      const set = bySrc.get(img.src) ?? new Set();
      set.add(img.slug);
      bySrc.set(img.src, set);
    }
  }
  imageCoverage.totalImages = images.length;
  imageCoverage.slugsWithPhoto = photoSlugs.size;
  for (const [src, set] of bySrc) {
    if (set.size > 1) errors.push(`cross-wired photo ${src} → ${[...set].join(",")}`);
  }
}

const repPath = resolve(root, "src/data/reputation-patterns.json");
let reputationCoverage = 0;
if (existsSync(repPath)) {
  reputationCoverage = Object.keys(JSON.parse(readFileSync(repPath, "utf8")).records || {}).length;
}

const inspPath = resolve(root, "src/data/health-inspections.json");
let inspectionCoverage = 0;
if (existsSync(inspPath)) {
  inspectionCoverage = Object.keys(JSON.parse(readFileSync(inspPath, "utf8")).records || {}).length;
}

const report = {
  generatedAt: new Date().toISOString(),
  ok: errors.length === 0,
  corpusRecordCount: count,
  geographicRegions: regions,
  floor: FLOOR,
  enrichmentCount: listingCoverage,
  listingSampleCoverage: listingCoverage,
  imageCoverage,
  reputationCoverage,
  signatureDishCoverage: dishCoverage,
  inspectionCoverage,
};

const reportDir = resolve(root, "reports");
mkdirSync(reportDir, { recursive: true });
writeFileSync(resolve(reportDir, "qa-coverage.json"), JSON.stringify(report, null, 2) + "\n");

if (errors.length) {
  const body = errors.map((e) => ` - ${e}`).join("\n");
  if (allow) {
    console.warn(`[corpus-invariants] ALLOW_CORPUS_MIGRATION=1 — would have failed:\n${body}`);
    process.exit(0);
  }
  console.error(`[corpus-invariants] FAILED\n${body}`);
  process.exit(1);
}

console.log(JSON.stringify({ ...report, slugs: slugs.length }, null, 2));

