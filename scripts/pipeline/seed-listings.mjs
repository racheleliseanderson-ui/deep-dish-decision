/**
 * Seed listing-only records for pending expansion metros without Google Places.
 *
 * Use when GOOGLE_MAPS_API_KEY is unavailable but geographic coverage must continue.
 * Source files: src/data/seed-listings*.json (named establishments + public URLs only).
 * Narrative first-party fields stay empty — same honesty contract as discover.mjs.
 *
 * Batches may set `queueCity` when the expansion queue target is broader than the
 * actual restaurant city (for example a statewide coverage target). Record geography
 * always comes from `city`; queue accounting comes from `queueCity ?? city`.
 *
 *   node scripts/pipeline/seed-listings.mjs
 *   node scripts/pipeline/seed-listings.mjs --cities=Atlanta,Washington
 *   node scripts/pipeline/seed-listings.mjs --cities="new jersey"
 *   node scripts/pipeline/seed-listings.mjs --dry
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PATHS,
  appendRun,
  normalizeHost,
  normalizePhone,
  readJson,
  snapshot,
  writeJson,
} from "./lib.mjs";
import { STATES } from "./regions.mjs";
import { isRetiredListing, retiredIndex } from "./retire-closed.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);

const DRY = Boolean(args.dry);
const onlyCities = args.cities
  ? String(args.cities)
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  : null;

const dataset = readJson(PATHS.dataset, null);
if (!dataset) throw new Error("dataset.json not found");
const queue = readJson(PATHS.queue, null);
if (!queue) throw new Error("expansion-queue.json not found");

const seedDir = fileURLToPath(new URL("../../src/data/", import.meta.url));
const seedFiles = fs
  .readdirSync(seedDir)
  .filter((name) => /^seed-listings(?:-.+)?\.json$/i.test(name))
  .sort();
const seedBatches = seedFiles.flatMap((name) => {
  const source = readJson(path.join(seedDir, name), null);
  return Array.isArray(source?.batches) ? source.batches : [];
});
if (!seedBatches.length) throw new Error("seed-listings*.json missing or empty");

// ------------------------------------------------------------------ dedupe
const byPhone = new Set();
const byHost = new Set();
const byNameCity = new Set();
const slugTaken = new Set(dataset.records.map((r) => r.slug));

for (const r of dataset.records) {
  if (r.phone) byPhone.add(normalizePhone(r.phone));
  if (r.website) byHost.add(normalizeHost(r.website));
  byNameCity.add(`${(r.title || "").toLowerCase().trim()}|${(r.city || "").toLowerCase()}`);
}

const retired = retiredIndex(readJson(PATHS.retired, { records: [] }));

function isDuplicate(listing, city) {
  const retiredReason = isRetiredListing(listing, city, retired);
  if (retiredReason) return retiredReason;
  if (listing.phone && byPhone.has(normalizePhone(listing.phone))) return "phone";
  if (listing.website && byHost.has(normalizeHost(listing.website))) return "website";
  const key = `${listing.title.toLowerCase().trim()}|${city.toLowerCase()}`;
  if (byNameCity.has(key)) return "name+city";
  return null;
}

function remember(listing, record) {
  if (record.phone) byPhone.add(normalizePhone(record.phone));
  if (record.website) byHost.add(normalizeHost(record.website));
  byNameCity.add(`${record.title.toLowerCase().trim()}|${record.city.toLowerCase()}`);
}

function slugify(title, city) {
  const base = `${title}-${city}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
  let slug = base;
  let n = 2;
  while (slugTaken.has(slug)) slug = `${base}-${n++}`;
  slugTaken.add(slug);
  return slug;
}

let nextId = Math.max(0, ...dataset.records.map((r) => Number(r.id) || 0)) + 1;
let seq = Math.max(
  0,
  ...dataset.records.map((r) => {
    const m = String(r.recordId || "").match(/^RI-EXP-(\d+)$/);
    return m ? Number(m[1]) : 0;
  }),
);

const UNSTATED = "";
const unknownList = [
  "Reservation release pattern",
  "Dietary cross-contact handling",
  "Accessibility route detail",
  "Private-dining terms",
];

function toRecord(listing, target, retrievedAt) {
  const city = target.city;
  const stateCode = target.stateCode;
  const stateName =
    Object.entries(STATES).find(([, v]) => v.code === stateCode)?.[0] ?? stateCode;
  const stateProper = stateName.replace(/\b\w/g, (m) => m.toUpperCase());
  seq += 1;
  const slug = slugify(listing.title, city);
  const phone = listing.phone ? normalizePhone(listing.phone) : "";
  const website = listing.website || "";

  return {
    id: nextId++,
    slug,
    title: listing.title,
    link: "",
    recordId: `RI-EXP-${String(seq).padStart(4, "0")}`,
    origin: "expansion-seed",
    addedAt: retrievedAt,
    address: listing.address || `${city}, ${stateCode}`,
    phone: listing.phone || "",
    email: "",
    website,
    menuUrl: "",
    reservationUrl: "",
    coverageArea: `${city}, ${stateProper}`,
    cuisineContext: UNSTATED,
    serviceSummary: UNSTATED,
    menuSummary: UNSTATED,
    occasionFit: UNSTATED,
    hoursSummary: UNSTATED,
    reservationDetails: UNSTATED,
    priceDetails: UNSTATED,
    dietaryDetails: UNSTATED,
    beverageDetails: UNSTATED,
    groupDetails: UNSTATED,
    atmosphereSummary: UNSTATED,
    practicalNotes: UNSTATED,
    accessibilityState: UNSTATED,
    parkingTransit: UNSTATED,
    dressCode: UNSTATED,
    typicalMealLength: UNSTATED,
    unknowns: unknownList.join("; "),
    unknownsCount: unknownList.length,
    unknownList,
    disclaimer:
      "Seeded from a public listing seed file and not yet reviewed against first-party sources. Confirm every detail directly with the restaurant.",
    sourceAuthority: "Public listing seed pending first-party review",
    confidence: "listing_only",
    freshnessStatus: "AWAITING_FIRST_PARTY_REVIEW",
    reviewedAt: retrievedAt.slice(0, 10),
    nextReviewAt: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10),
    reviewStatus: "listing_only",
    fieldVolatility: "Hours, pricing and policy fields are listing-derived and change without notice.",
    nextAction: "Promote to a reviewed record by confirming policy fields against first-party sources.",
    conflict: "",
    depthFilled: 0,
    depthTotal: 12,
    depthLabel: "0 / 12 core fields",
    signals: {},
    region: `${city}, ${stateCode}`,
    city,
    stateProvince: stateProper,
    regionGroup: `${stateProper}`,
    priceTags: [],
    serviceStyles: [],
    dietaryTags: [],
    accessibilityTags: [],
    reservationTags: [],
    groupFitTags: [],
    checklist: [
      "Confirm current hours directly",
      "Confirm reservation release and cancellation terms",
      "Confirm dietary handling with the kitchen",
      "Confirm accessibility route and restroom detail",
    ],
    hasPhone: Boolean(phone || listing.phone),
    hasOfficialConflict: false,
    isFullCaseFile: false,
    reviewDueSoon: false,
    thinFields: [
      "serviceSummary",
      "menuSummary",
      "reservationDetails",
      "priceDetails",
      "dietaryDetails",
      "accessibilityState",
      "groupDetails",
      "atmosphereSummary",
    ],
    thinFieldCount: 8,
    bookingPlatforms: [],
    cuisineTags: listing.cuisineTags ?? [],
    officialSource: website,
    additionalSources: "",
    sources: [website].filter(Boolean),
    retrievedAt,
    searchText: [listing.title, city, stateProper, ...(listing.cuisineTags ?? [])]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
    spendBands: [],
    daypartTags: [],
    planningLoad: "",
  };
}

function queueCityForBatch(batch) {
  return String(batch.queueCity || batch.city || "").trim();
}

// ------------------------------------------------------------------ run
const startedAt = new Date().toISOString();
const snapshotDir = DRY ? null : snapshot("seed-listings");

let inserted = 0;
let skipped = 0;
const insertedSlugs = [];
const perCity = [];

const batches = seedBatches.filter((b) => {
  if (!onlyCities) return true;
  const names = [b.city, b.queueCity]
    .filter(Boolean)
    .map((name) => String(name).trim().toLowerCase());
  return names.some((name) => onlyCities.includes(name));
});

console.log(`Seed sources: ${seedFiles.join(", ")}`);

for (const batch of batches) {
  const queueCity = queueCityForBatch(batch);
  const target = queue.cities.find(
    (c) => c.city.toLowerCase() === queueCity.toLowerCase() && c.stateCode === batch.stateCode,
  );
  if (!target) {
    console.warn(
      `  ! ${batch.city}, ${batch.stateCode} (queue target: ${queueCity}) not in expansion queue — skip`,
    );
    continue;
  }

  let cityInserted = 0;
  let cityDupes = 0;

  for (const listing of batch.listings) {
    const dupe = isDuplicate(listing, batch.city);
    if (dupe) {
      skipped += 1;
      cityDupes += 1;
      console.log(`  skip ${listing.title} (${dupe})`);
      continue;
    }
    const record = toRecord(listing, batch, startedAt);
    remember(listing, record);
    if (!DRY) dataset.records.push(record);
    insertedSlugs.push(record.slug);
    cityInserted += 1;
    inserted += 1;
  }

  perCity.push({
    city: `${batch.city}, ${batch.stateCode}`,
    queueCity,
    found: batch.listings.length,
    inserted: cityInserted,
    duplicates: cityDupes,
  });
  console.log(
    `${batch.city}, ${batch.stateCode}: ${batch.listings.length} seeds, ${cityInserted} inserted, ${cityDupes} duplicates (queue: ${queueCity})`,
  );

  if (!DRY && cityInserted) {
    target.status = "done";
    target.inserted = (target.inserted ?? 0) + cityInserted;
    target.lastRunAt = startedAt;
    target.note = target.note || "Seeded via public listing seed file (Places key unavailable).";
  }
}

if (DRY) {
  console.log(`\nDry run — would insert ${inserted}, skip ${skipped}.`);
  process.exit(0);
}

dataset.count = dataset.records.length;
dataset.regions = new Set(dataset.records.map((r) => r.region)).size;
dataset.generatedAt = new Date().toISOString();
writeJson(PATHS.dataset, dataset);
writeJson(PATHS.queue, queue);

appendRun({
  kind: "seed-listings",
  startedAt,
  finishedAt: new Date().toISOString(),
  cities: perCity,
  inserted,
  duplicatesSkipped: skipped,
  snapshot: snapshotDir,
  seedFiles,
  insertedSlugs,
});

// Refresh coverage summary if report can run without secrets
try {
  const { spawnSync } = await import("node:child_process");
  spawnSync(process.execPath, ["scripts/pipeline/report.mjs"], { stdio: "inherit" });
} catch {
  /* report is best-effort */
}

console.log(
  `\nSeeded ${inserted} listing-only records (${skipped} duplicates skipped). Corpus now ${dataset.records.length}.`,
);
console.log("Run: node scripts/pipeline/enrich.mjs --hygiene   (owned site reads — no API keys required).");
