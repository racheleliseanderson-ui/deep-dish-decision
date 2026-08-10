/**
 * Phase 2 — controlled expansion. Pulls the next pending cities off
 * src/data/expansion-queue.json, discovers restaurants through Google Places,
 * de-duplicates against the existing corpus, inserts sparse first-party-empty
 * records into dataset.json, then hands the new slugs to enrich.mjs.
 *
 * Usage:
 *   node scripts/pipeline/discover.mjs                      # honours queue settings
 *   node scripts/pipeline/discover.mjs --cities=2 --limit=15
 *   node scripts/pipeline/discover.mjs --city="Austin,TX"   # pin one target
 *   node scripts/pipeline/discover.mjs --dry                # no writes
 *
 * Quotas, pausing and pinning all live in the queue file so the pipeline can be
 * steered without editing code.
 */
import { spawnSync } from "node:child_process";
import {
  PATHS,
  appendRun,
  createLimiter,
  googleClient,
  normalizeHost,
  normalizePhone,
  normalizeName,
  readJson,
  shapeGoogle,
  similarity,
  snapshot,
  writeJson,
} from "./lib.mjs";
import { STATES, regionCode } from "./regions.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);

const dataset = readJson(PATHS.dataset, null);
if (!dataset) throw new Error("dataset.json not found");
const queue = readJson(PATHS.queue, null);
if (!queue) throw new Error("expansion-queue.json not found — run build-queue.mjs first");

const settings = queue.settings ?? {};
const DRY = Boolean(args.dry);
const PER_CITY = Number(args.limit ?? settings.restaurantsPerRun ?? 25);
const CITY_COUNT = Number(args.cities ?? settings.citiesPerRun ?? 1);
const DAILY_CAP = Number(settings.dailyCap ?? 200);

if (settings.paused && !args.force) {
  console.log("Expansion is paused in expansion-queue.json (settings.paused). Use --force to override.");
  process.exit(0);
}

// ------------------------------------------------------------- daily cap check
const runLog = readJson(PATHS.runLog, { runs: [] });
const today = new Date().toISOString().slice(0, 10);
const insertedToday = (runLog.runs ?? [])
  .filter((r) => r.kind === "discover" && String(r.startedAt).slice(0, 10) === today)
  .reduce((a, r) => a + (r.inserted ?? 0), 0);
const remainingToday = Math.max(0, DAILY_CAP - insertedToday);
if (!remainingToday) {
  console.log(`Daily cap reached: ${insertedToday}/${DAILY_CAP} inserted today. Stopping.`);
  process.exit(0);
}

// ------------------------------------------------------------- target selection
function targetsFor() {
  if (args.city) {
    const [city, code] = String(args.city).split(",").map((s) => s.trim());
    const found = queue.cities.find(
      (c) => c.city.toLowerCase() === String(city).toLowerCase() && (!code || c.stateCode === code),
    );
    if (!found) throw new Error(`City "${args.city}" is not in the queue`);
    return [found];
  }
  const pending = queue.cities.filter((c) => c.status === "pending");
  const pinned = pending.filter((c) => c.pinned);
  const rest = pending.sort((a, b) => a.priority - b.priority);
  return [...pinned, ...rest.filter((c) => !c.pinned)].slice(0, CITY_COUNT);
}

const targets = targetsFor();
if (!targets.length) {
  console.log("Queue has no pending cities. Run build-queue.mjs or reset statuses.");
  process.exit(0);
}

// ------------------------------------------------------------------ dedupe keys
const byPlaceId = new Set();
const byPhone = new Set();
const byHost = new Set();
const byNameCity = new Set();
const store = readJson(PATHS.enrichment, { records: {} });

for (const r of dataset.records) {
  if (r.phone) byPhone.add(normalizePhone(r.phone));
  if (r.website) byHost.add(normalizeHost(r.website));
  byNameCity.add(`${normalizeName(r.title)}|${String(r.city ?? "").toLowerCase()}`);
  const pid = store.records[r.slug]?.google?.placeId;
  if (pid) byPlaceId.add(pid);
}

function isDuplicate(place) {
  if (place.id && byPlaceId.has(place.id)) return "placeId";
  const phone = normalizePhone(place.nationalPhoneNumber);
  if (phone && byPhone.has(phone)) return "phone";
  const host = normalizeHost(place.websiteUri);
  if (host && byHost.has(host)) return "website";
  const city = (
    place.addressComponents?.find((c) => c.types?.includes("locality"))?.longText ?? ""
  ).toLowerCase();
  const name = normalizeName(place.displayName?.text);
  if (byNameCity.has(`${name}|${city}`)) return "name+city";
  for (const key of byNameCity) {
    const [existingName, existingCity] = key.split("|");
    if (existingCity === city && similarity(existingName, name) >= 0.92) return "fuzzy name";
  }
  return null;
}

function remember(place, record) {
  if (place.id) byPlaceId.add(place.id);
  if (record.phone) byPhone.add(normalizePhone(record.phone));
  if (record.website) byHost.add(normalizeHost(record.website));
  byNameCity.add(`${normalizeName(record.title)}|${String(record.city ?? "").toLowerCase()}`);
}

// ------------------------------------------------------------------ record shape
const slugTaken = new Set(dataset.records.map((r) => r.slug));
let nextId = Math.max(...dataset.records.map((r) => Number(r.id) || 0)) + 1;
const expansionSeq = dataset.records.filter((r) => r.origin === "expansion").length;
let seq = expansionSeq;

function slugify(text, city) {
  const base = String(text)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\da-z]+/g, "-")
    .replace(/(^-|-$)/g, "");
  let slug = base || "restaurant";
  if (slugTaken.has(slug)) slug = `${slug}-${String(city).toLowerCase().replace(/[^\da-z]+/g, "-")}`;
  let n = 2;
  while (slugTaken.has(slug)) slug = `${base}-${n++}`;
  slugTaken.add(slug);
  return slug;
}

const UNSTATED = "";

/**
 * A discovered record carries only what a third party actually published. Every
 * narrative first-party field stays empty so the UI keeps reporting it as
 * unstated rather than implying an editorial review that has not happened.
 */
function toRecord(place, target, retrievedAt) {
  const g = shapeGoogle(place, retrievedAt);
  const city = g.address?.locality || target.city;
  const stateCode = g.address?.stateCode || target.stateCode;
  const stateName =
    Object.entries(STATES).find(([, v]) => v.code === stateCode)?.[0] ?? target.stateCode;
  const stateProper = stateName.replace(/\b\w/g, (m) => m.toUpperCase());
  seq += 1;
  const slug = slugify(place.displayName?.text ?? "restaurant", city);
  const unknownList = [
    "Reservation release pattern",
    "Dietary cross-contact handling",
    "Accessibility route detail",
    "Private-dining terms",
  ];

  return {
    id: nextId++,
    slug,
    title: place.displayName?.text ?? "Untitled",
    link: "",
    recordId: `RI-EXP-${String(seq).padStart(4, "0")}`,
    origin: "expansion",
    addedAt: retrievedAt,
    address: g.address?.formatted ?? "",
    phone: g.phone ?? "",
    email: "",
    website: g.website ?? "",
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
      "Discovered through third-party listings and not yet reviewed against first-party sources. Confirm every detail directly with the restaurant.",
    sourceAuthority: "Third-party listing (Google Places) pending first-party review",
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
    priceTags: g.priceBand ? [g.priceBand] : [],
    serviceStyles: [],
    dietaryTags: [],
    accessibilityTags: Object.entries(g.accessibility ?? {})
      .filter(([, v]) => v)
      .map(([k]) => k),
    reservationTags: g.amenities?.reservable ? ["Accepts reservations"] : [],
    groupFitTags: [],
    checklist: [
      "Confirm current hours directly",
      "Confirm reservation release and cancellation terms",
      "Confirm dietary handling with the kitchen",
      "Confirm accessibility route and restroom detail",
    ],
    hasPhone: Boolean(g.phone),
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
    cuisineTags: g.cuisineTags ?? [],
    officialSource: g.website ?? "",
    additionalSources: "",
    sources: [g.website].filter(Boolean),
    retrievedAt,
    searchText: [place.displayName?.text, city, stateProper, ...(g.cuisineTags ?? [])]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
    spendBands: g.priceBand ? [g.priceBand] : [],
    daypartTags: [],
    planningLoad: "",
  };
}

// ------------------------------------------------------------------------- run
const gLimiter = createLimiter({ minDelayMs: 220 });
const google = googleClient(gLimiter);
const seeds = settings.seeds ?? ["best restaurants", "fine dining", "neighborhood restaurant"];
const startedAt = new Date().toISOString();
const snapshotDir = DRY ? null : snapshot("discover");

let inserted = 0;
let skipped = 0;
let searches = 0;
let failures = 0;
const insertedSlugs = [];
const perCity = [];

for (const target of targets) {
  if (inserted >= remainingToday) break;
  const room = Math.min(PER_CITY, remainingToday - inserted);
  const seen = new Map();
  let cityFailures = 0;

  for (const seed of seeds) {
    if (seen.size >= room * 3) break;
    const query = `${seed} in ${target.city}, ${target.stateCode}`;
    const res = await google.searchText(query, { maxResultCount: 20 });
    searches += 1;
    if (!res.ok) {
      cityFailures += 1;
      failures += 1;
      console.log(`  ! search failed (${res.status ?? "error"}) for "${query}"`);
      continue;
    }
    for (const place of res.data?.places ?? []) {
      if (place.id && !seen.has(place.id)) seen.set(place.id, place);
    }
  }

  const ranked = [...seen.values()]
    .filter((p) => (p.userRatingCount ?? 0) >= 40)
    .sort((a, b) => (b.userRatingCount ?? 0) - (a.userRatingCount ?? 0));

  let cityInserted = 0;
  const cityDupes = [];
  for (const place of ranked) {
    if (cityInserted >= room) break;
    const dupe = isDuplicate(place);
    if (dupe) {
      skipped += 1;
      cityDupes.push(`${place.displayName?.text} (${dupe})`);
      continue;
    }
    const record = toRecord(place, target, new Date().toISOString());
    remember(place, record);
    dataset.records.push(record);
    insertedSlugs.push(record.slug);
    cityInserted += 1;
    inserted += 1;
  }

  perCity.push({ city: `${target.city}, ${target.stateCode}`, found: ranked.length, inserted: cityInserted, duplicates: cityDupes.length });
  console.log(
    `${target.city}, ${target.stateCode}: ${ranked.length} candidates, ${cityInserted} inserted, ${cityDupes.length} duplicates skipped${cityFailures ? `, ${cityFailures} failed searches` : ""}`,
  );

  const entry = queue.cities.find((c) => c.city === target.city && c.stateCode === target.stateCode);
  if (entry && !DRY) {
    entry.status = cityInserted ? "done" : "empty";
    entry.inserted = (entry.inserted ?? 0) + cityInserted;
    entry.lastRunAt = startedAt;
  }
}

if (DRY) {
  console.log(`\nDry run — nothing written. Would insert ${inserted}, skip ${skipped} duplicates.`);
  process.exit(0);
}

dataset.count = dataset.records.length;
dataset.regions = new Set(dataset.records.map((r) => r.region)).size;
dataset.generatedAt = new Date().toISOString();
writeJson(PATHS.dataset, dataset);
writeJson(PATHS.queue, queue);

appendRun({
  kind: "discover",
  startedAt,
  finishedAt: new Date().toISOString(),
  batchSize: PER_CITY,
  cities: perCity,
  inserted,
  duplicatesSkipped: skipped,
  apiCalls: { placesSearchText: searches },
  retries: gLimiter.retries ?? 0,
  failures,
  snapshot: snapshotDir,
  insertedSlugs,
});

console.log(
  `\nInserted ${inserted} records (${skipped} duplicates skipped). Corpus now ${dataset.records.length}. Today: ${insertedToday + inserted}/${DAILY_CAP}.`,
);

// -------------------------------------------------- automatic enrichment pass
if (insertedSlugs.length && !args["no-enrich"]) {
  console.log(`\nEnriching ${insertedSlugs.length} new records…`);
  const result = spawnSync(
    process.execPath,
    ["scripts/pipeline/enrich.mjs", `--slugs=${insertedSlugs.join(",")}`, `--batch=${insertedSlugs.length}`],
    { stdio: "inherit" },
  );
  if (result.status !== 0) console.log("Enrichment pass exited non-zero — rerun enrich.mjs for the new slugs.");
}
