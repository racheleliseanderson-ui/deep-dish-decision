#!/usr/bin/env node
/**
 * Push the corpus and the dynamic layer into Postgres.
 *
 * Reads dataset.json and src/data/live/*.json — the same files the app ships —
 * and upserts them. Idempotent: run it after every pipeline pass.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/db/seed-corpus.mjs
 *   ... --dry-run    parse and report, write nothing
 *
 * The service key bypasses row-level security, so this never runs in a browser
 * and the key must never be committed. It is read from the environment only.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const read = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));

const DRY = process.argv.includes("--dry-run");
const URL = process.env.SUPABASE_URL?.replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_KEY;

if (!DRY && (!URL || !KEY)) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_KEY, or pass --dry-run.");
  process.exit(1);
}
if (KEY && /^eyJ/.test(KEY) === false) {
  console.error("SUPABASE_SERVICE_KEY does not look like a JWT. Refusing to send it.");
  process.exit(1);
}

const dataset = read("src/data/dataset.json");

/* ── live layer, merged from the per-region files ────────────────────────── */
const liveDir = join(root, "src", "data", "live");
const live = {};
if (existsSync(liveDir)) {
  for (const f of readdirSync(liveDir)) {
    if (!f.endsWith(".json") || f === "index.json") continue;
    Object.assign(live, JSON.parse(readFileSync(join(liveDir, f), "utf8")).records ?? {});
  }
}

const EVIDENCE_FIELDS = [
  "coverageArea",
  "cuisineContext",
  "serviceSummary",
  "menuSummary",
  "occasionFit",
  "hoursSummary",
  "reservationDetails",
  "priceDetails",
  "dietaryDetails",
  "beverageDetails",
  "groupDetails",
  "atmosphereSummary",
  "practicalNotes",
  "accessibilityState",
  "parkingTransit",
  "dressCode",
  "typicalMealLength",
  "unknowns",
  "disclaimer",
  "conflict",
  "nextAction",
  "fieldVolatility",
];

const restaurants = dataset.records.map((r) => ({
  slug: r.slug,
  record_id: r.recordId ?? null,
  title: r.title,
  region: r.region,
  region_group: r.regionGroup || r.region,
  city: r.city || null,
  state_province: r.stateProvince || null,
  address: r.address || null,
  phone: r.phone || null,
  website: r.website || null,
  reservation_url: r.reservationUrl || null,
  menu_url: r.menuUrl || null,
  evidence: Object.fromEntries(EVIDENCE_FIELDS.map((f) => [f, r[f] ?? null])),
  signals: r.signals ?? {},
  taxonomies: r.taxonomies ?? {},
  cuisine_tags: r.cuisineTags ?? [],
  booking_paths: r.bookingPaths ?? r.bookingPlatforms ?? [],
  spend_bands: r.spendBands ?? [],
  daypart_tags: r.daypartTags ?? [],
  depth_filled: r.depthFilled ?? 0,
  depth_total: r.depthTotal ?? 12,
  unknowns_count: r.unknownsCount ?? 0,
  thin_field_count: r.thinFieldCount ?? 0,
  has_conflict: Boolean(r.hasOfficialConflict),
  review_status: r.reviewStatus ?? null,
  reviewed_at: r.reviewedAt || null,
  next_review_at: r.nextReviewAt || null,
  search_text: r.searchText ?? `${r.title} ${r.region} ${(r.cuisineTags ?? []).join(" ")}`,
}));

const liveRows = Object.entries(live).map(([slug, v]) => ({
  slug,
  lat: v.ll?.[0] ?? null,
  lng: v.ll?.[1] ?? null,
  ll_source: v.llSource ?? null,
  tz: v.tz ?? null,
  neighbourhood: v.hood ?? null,
  hours: v.hours ?? null,
  hours_source: v.hoursSource ?? null,
  band: v.band ?? null,
  band_source: v.bandSource ?? null,
  pp_low: v.pp?.[0] ?? null,
  pp_high: v.pp?.[1] ?? null,
  pp_source: v.ppSource ?? null,
  pp_service: v.ppService ?? null,
  rating: v.rating?.[0] ?? null,
  rating_count: v.rating?.[1] ?? null,
  risk: v.risk ?? null,
  a11y: v.a11y ?? null,
  amenities: v.am ?? null,
  parking: v.parking ?? null,
  dishes: v.dishes ?? null,
  reputation: v.rep ?? null,
  map_uri: v.mapUri ?? null,
}));

console.log(`restaurants: ${restaurants.length}`);
console.log(`live rows:   ${liveRows.length}`);
console.log(`  with an exact point: ${liveRows.filter((r) => r.ll_source === "exact").length}`);
console.log(`  with hours:          ${liveRows.filter((r) => r.hours).length}`);
console.log(`  with a per-guest fee:${liveRows.filter((r) => r.pp_low !== null).length}`);

if (DRY) {
  console.log("\n--dry-run: nothing written.");
  process.exit(0);
}

async function upsert(table, rows, chunk = 250) {
  let done = 0;
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    const res = await fetch(`${URL}/rest/v1/${table}?on_conflict=slug`, {
      method: "POST",
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(slice),
    });
    if (!res.ok) {
      throw new Error(`${table} rows ${i}-${i + slice.length}: ${res.status} ${await res.text()}`);
    }
    done += slice.length;
    process.stdout.write(`\r  ${table}: ${done}/${rows.length}`);
  }
  process.stdout.write("\n");
}

// Restaurants first — live_rows references them.
await upsert("restaurants", restaurants);
await upsert("live_rows", liveRows);
console.log("seeded.");
