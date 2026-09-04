#!/usr/bin/env node
/**
 * Controlled geographic discovery for Deep Dish Intelligence.
 *
 * Default provider: OpenStreetMap (no API key required).
 * - Nominatim is used only to resolve a city/state to a bounding box.
 * - Overpass surfaces amenity=restaurant candidates with website tags.
 * - Every candidate must then pass resolveTarget() against the restaurant's
 *   own website before it can enter a seed batch.
 *
 * Optional provider: Google Places Text Search when explicitly requested with
 * --provider=google and GOOGLE_MAPS_API_KEY is configured.
 *
 * Third-party ratings/reviews/atmosphere are never written to the corpus.
 */
import fs from "node:fs";
import path from "node:path";
import {
  PATHS,
  appendRun,
  createLimiter,
  normalizeHost,
  normalizeName,
  normalizePhone,
  readJson,
  similarity,
  writeJson,
} from "./lib.mjs";
import { resolveTarget } from "./resolve-targets.mjs";
import { isRetiredListing, retiredIndex } from "./retire-closed.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);

const DRY = Boolean(args.dry);
const FORCE = Boolean(args.force);
const PROVIDER = String(args.provider || "osm").toLowerCase();
if (!new Set(["osm", "google"]).has(PROVIDER)) {
  throw new Error(`Unknown discovery provider: ${PROVIDER}. Use osm or google.`);
}

const root = process.cwd();
const ledgerPath = path.join(root, "src/data/discovery-ledger.json");
const geoCachePath = path.join(root, "src/data/discovery-geo-cache.json");
const outPath = path.join(root, "src/data/seed-listings-discovery-latest.json");
const reportPath = path.join(root, "reports/discovery-latest.json");
const USER_AGENT = "DeepDishIntelligence/1.0 (local maintenance; https://deepdish.saltnotes.blog/)";

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnvFile(path.join(root, ".env.local.pipeline"));
loadEnvFile(path.join(root, ".env.local"));
loadEnvFile(path.join(root, ".env"));

const apiKey = process.env.GOOGLE_MAPS_API_KEY || "";
if (PROVIDER === "google" && !apiKey) {
  console.error("GOOGLE_MAPS_API_KEY is required only when --provider=google is requested.");
  process.exit(2);
}

const dataset = readJson(PATHS.dataset, null);
if (!dataset) throw new Error("dataset.json not found");
const queue = readJson(PATHS.queue, null);
if (!queue) throw new Error("expansion-queue.json not found - run build-queue.mjs first");
const retired = retiredIndex(readJson(PATHS.retired, { records: [] }));
const ledger = readJson(ledgerPath, { generatedAt: null, candidates: {} });
const geoCache = readJson(geoCachePath, { generatedAt: null, markets: {} });

const settings = queue.settings ?? {};
const PER_CITY = Math.max(1, Number(args.limit ?? settings.restaurantsPerRun ?? 20));
const CITY_COUNT = Math.max(1, Number(args.cities ?? settings.citiesPerRun ?? 3));
const MAX_ATTEMPTS_PER_CITY = Math.max(PER_CITY * 4, Number(args.attempts ?? PER_CITY * 5));
const googleSeeds = args.seeds
  ? String(args.seeds).split("|").map((s) => s.trim()).filter(Boolean)
  : (settings.seeds ?? [
      "best restaurants",
      "neighborhood restaurant",
      "tasting menu",
      "wine bar restaurant",
      "seafood restaurant",
      "chef driven restaurant",
    ]);

function targetsFor() {
  const pending = (queue.cities ?? []).filter((c) => c.status === "pending" && Number(c.gap ?? 0) > 0);
  if (args.city) {
    const [city, stateCode = ""] = String(args.city).split(",").map((s) => s.trim());
    const found = pending.find(
      (c) => c.city.toLowerCase() === city.toLowerCase() && (!stateCode || c.stateCode === stateCode.toUpperCase()),
    );
    if (!found) throw new Error(`Pending city not found in expansion queue: ${args.city}`);
    return [found];
  }
  return pending
    .slice()
    .sort(
      (a, b) =>
        Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) ||
        a.priority - b.priority ||
        b.gap - a.gap,
    )
    .slice(0, CITY_COUNT);
}

const haveHost = new Set(dataset.records.map((r) => normalizeHost(r.website)).filter(Boolean));
const havePhone = new Set(dataset.records.map((r) => normalizePhone(r.phone)).filter(Boolean));
const haveNameCity = new Set(
  dataset.records.map((r) => `${normalizeName(r.title)}|${String(r.city ?? "").trim().toLowerCase()}`),
);

function duplicateReason(listing, city) {
  const retiredReason = isRetiredListing(listing, city, retired);
  if (retiredReason) return retiredReason;
  const host = normalizeHost(listing.website);
  if (host && haveHost.has(host)) return `website:${host}`;
  const phone = normalizePhone(listing.phone);
  if (phone && havePhone.has(phone)) return "phone";
  const normalized = normalizeName(listing.title);
  const cityLower = city.toLowerCase();
  if (haveNameCity.has(`${normalized}|${cityLower}`)) return "name+city";
  for (const key of haveNameCity) {
    const split = key.lastIndexOf("|");
    const existingName = key.slice(0, split);
    const existingCity = key.slice(split + 1);
    if (existingCity === cityLower && similarity(existingName, normalized) >= 0.94) return "fuzzy-name";
  }
  return null;
}

function remember(listing, city) {
  const host = normalizeHost(listing.website);
  const phone = normalizePhone(listing.phone);
  if (host) haveHost.add(host);
  if (phone) havePhone.add(phone);
  haveNameCity.add(`${normalizeName(listing.title)}|${city.toLowerCase()}`);
}

function cooldownDays(status, attempts = 1) {
  if (status === "resolved" || status === "duplicate") return 3650;
  if (status === "no-website") return 30;
  if (status === "unresolved") return Math.min(90, 14 * Math.max(1, attempts));
  if (status === "api-error") return 1;
  return 7;
}

function eligibleCandidate(id) {
  if (FORCE) return true;
  const prior = ledger.candidates?.[id];
  if (!prior?.lastAttemptAt) return true;
  const next = Date.parse(prior.lastAttemptAt) + cooldownDays(prior.status, prior.attempts) * 86_400_000;
  return Date.now() >= next;
}

function markCandidate(id, status) {
  if (!id) return;
  const prior = ledger.candidates?.[id] ?? {};
  ledger.candidates[id] = {
    status,
    attempts: Number(prior.attempts ?? 0) + 1,
    lastAttemptAt: new Date().toISOString(),
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function firstWebsite(tags = {}) {
  const raw = String(tags.website || tags["contact:website"] || tags["contact:url"] || "").trim();
  if (!raw) return "";
  const first = raw.split(";").map((s) => s.trim()).find(Boolean) || "";
  if (!first) return "";
  if (/^https?:\/\//i.test(first)) return first;
  if (/^[\w.-]+\.[a-z]{2,}/i.test(first)) return `https://${first}`;
  return "";
}

let lastNominatimAt = 0;
async function geocodeMarket(market) {
  const key = `${market.city}|${market.stateCode}`.toLowerCase();
  const cached = geoCache.markets?.[key];
  if (cached?.bbox?.length === 4) return cached;

  const wait = Math.max(0, 15_000 - (Date.now() - lastNominatimAt));
  if (wait) await sleep(wait);

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("city", market.city);
  url.searchParams.set("state", market.stateCode);
  url.searchParams.set("country", "United States");
  url.searchParams.set("countrycodes", "us");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "0");
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
  lastNominatimAt = Date.now();
  if (!res.ok) throw new Error(`Nominatim ${res.status} for ${market.city}, ${market.stateCode}`);
  const rows = await res.json();
  const hit = rows?.[0];
  if (!hit?.boundingbox || hit.boundingbox.length !== 4) {
    throw new Error(`No OpenStreetMap bounding box for ${market.city}, ${market.stateCode}`);
  }
  const [south, north, west, east] = hit.boundingbox.map(Number);
  const entry = { bbox: [south, west, north, east], resolvedAt: new Date().toISOString() };
  geoCache.markets ||= {};
  geoCache.markets[key] = entry;
  return entry;
}

let lastOverpassAt = 0;
async function searchOsmMarket(market) {
  const { bbox } = await geocodeMarket(market);
  const wait = Math.max(0, 1_250 - (Date.now() - lastOverpassAt));
  if (wait) await sleep(wait);
  const [south, west, north, east] = bbox;
  const query = `[out:json][timeout:45];\n(nwr["amenity"="restaurant"]["name"](${south},${west},${north},${east}););\nout tags center 500;`;
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
    body: new URLSearchParams({ data: query }),
  });
  lastOverpassAt = Date.now();
  if (!res.ok) throw new Error(`Overpass ${res.status} for ${market.city}, ${market.stateCode}`);
  const data = await res.json();
  return (data.elements ?? []).map((el) => ({
    id: `osm:${el.type}:${el.id}`,
    name: String(el.tags?.name || "").trim(),
    url: firstWebsite(el.tags),
  }));
}

const googleLimiter = createLimiter({ minDelayMs: 250, maxRetries: 4 });
async function googleTextSearch(query) {
  return googleLimiter.run(async () => {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.id,places.displayName,places.websiteUri,places.primaryType",
      },
      body: JSON.stringify({
        textQuery: query,
        includedType: "restaurant",
        languageCode: "en",
        regionCode: "US",
        pageSize: 20,
        rankPreference: "RELEVANCE",
      }),
    });
    if (!res.ok) throw new Error(`Google Places ${res.status}: ${await res.text()}`);
    return res.json();
  });
}

async function searchGoogleMarket(market) {
  const seen = new Map();
  for (const seed of googleSeeds) {
    const data = await googleTextSearch(`${seed} in ${market.city}, ${market.stateCode}`);
    for (const place of data.places ?? []) {
      const id = `google:${String(place.id || "").trim()}`;
      if (!id || id === "google:" || seen.has(id)) continue;
      seen.set(id, {
        id,
        name: String(place.displayName?.text || "").trim(),
        url: String(place.websiteUri || "").trim(),
      });
    }
  }
  return [...seen.values()];
}

const startedAt = new Date().toISOString();
const batches = [];
const misses = [];
let discoveryQueries = 0;
let attempted = 0;
let resolved = 0;
let duplicates = 0;

const targets = targetsFor();
for (const market of targets) {
  const need = Math.min(PER_CITY, Math.max(1, Number(market.gap ?? PER_CITY)));
  let candidates = [];
  try {
    candidates = PROVIDER === "google" ? await searchGoogleMarket(market) : await searchOsmMarket(market);
    discoveryQueries += PROVIDER === "google" ? googleSeeds.length : 1;
  } catch (error) {
    misses.push({
      market: `${market.city}, ${market.stateCode}`,
      reason: String(error?.message || error),
      stage: "discovery",
    });
    console.error(`  ! ${market.city}: ${String(error?.message || error)}`);
    continue;
  }

  const listings = [];
  let marketAttempts = 0;
  for (const candidate of candidates) {
    if (listings.length >= need || marketAttempts >= MAX_ATTEMPTS_PER_CITY) break;
    const candidateId = candidate.id;
    if (!eligibleCandidate(candidateId)) continue;
    if (!candidate.name || !candidate.url) {
      markCandidate(candidateId, "no-website");
      continue;
    }

    marketAttempts += 1;
    attempted += 1;
    const out = await resolveTarget({ name: candidate.name, url: candidate.url }, market);
    if (!out.ok) {
      markCandidate(candidateId, "unresolved");
      misses.push({
        market: `${market.city}, ${market.stateCode}`,
        name: candidate.name,
        reason: "official-site validation failed",
        tried: out.tried,
      });
      continue;
    }

    const dupe = duplicateReason(out.listing, market.city);
    if (dupe) {
      duplicates += 1;
      markCandidate(candidateId, "duplicate");
      continue;
    }

    listings.push(out.listing);
    remember(out.listing, market.city);
    markCandidate(candidateId, "resolved");
    resolved += 1;
    console.log(`  + ${market.city}: ${out.listing.title} -> ${out.listing.website}`);
  }

  console.log(
    `${market.city}, ${market.stateCode}: ${candidates.length} surfaced, ${listings.length} first-party verified for a gap of ${market.gap}.`,
  );
  if (listings.length) batches.push({ city: market.city, stateCode: market.stateCode, listings });
}

const finishedAt = new Date().toISOString();
const report = {
  generatedAt: finishedAt,
  provider: PROVIDER,
  discoveryQueries,
  attempted,
  resolved,
  duplicates,
  attribution: PROVIDER === "osm" ? "Candidate discovery: © OpenStreetMap contributors, ODbL." : "Candidate discovery: Google Places.",
  markets: batches.map((b) => ({ city: b.city, stateCode: b.stateCode, verified: b.listings.length })),
  misses,
};

if (DRY) {
  console.log(`\nDry run: ${resolved} first-party verified candidates found. Nothing written.`);
  process.exit(0);
}

ledger.generatedAt = finishedAt;
geoCache.generatedAt = finishedAt;
writeJson(ledgerPath, ledger);
if (PROVIDER === "osm") writeJson(geoCachePath, geoCache);
writeJson(outPath, {
  note:
    PROVIDER === "osm"
      ? "OpenStreetMap was used only to surface candidate names and likely official websites. Every listing below was then fetched and verified against the restaurant's own site by resolveTarget.mjs; persisted restaurant evidence comes from that first-party page. Candidate discovery: © OpenStreetMap contributors, ODbL."
      : "Google Places was used only to surface candidate names and likely official websites. Every listing below was then fetched and verified against the restaurant's own site by resolveTarget.mjs; Google ratings, reviews and atmosphere data are not persisted.",
  generatedAt: finishedAt,
  provider: PROVIDER,
  batches,
});
writeJson(reportPath, report);
appendRun({
  kind: "discover-first-party",
  startedAt,
  finishedAt,
  provider: PROVIDER,
  searches: discoveryQueries,
  attempted,
  resolved,
  duplicates,
  markets: batches.map((b) => `${b.city}, ${b.stateCode}`),
  apiCalls: PROVIDER === "osm"
    ? { nominatimCityGeocode: targets.length, overpassRestaurantSearch: discoveryQueries, ownedValidation: attempted }
    : { googleTextSearch: discoveryQueries, ownedValidation: attempted },
  outPath,
});

console.log(`\nDiscovery complete: ${resolved} verified new candidates across ${batches.length} markets.`);
console.log(`Provider: ${PROVIDER === "osm" ? "OpenStreetMap (no key)" : "Google Places"}`);
console.log(`Seed batch: ${path.relative(root, outPath)}`);
console.log("Next: node scripts/pipeline/seed-and-enrich.mjs");
