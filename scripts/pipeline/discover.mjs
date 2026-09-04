#!/usr/bin/env node
/**
 * Controlled geographic discovery for Deep Dish Intelligence.
 *
 * Google Places is used only to surface candidate restaurants and their likely
 * official website. Every candidate is then verified against the restaurant's
 * own site through resolveTarget() before it is allowed into a seed batch.
 * No Google rating/review/atmosphere data is written to the corpus.
 *
 * Usage:
 *   node scripts/pipeline/discover.mjs
 *   node scripts/pipeline/discover.mjs --cities=3 --limit=20
 *   node scripts/pipeline/discover.mjs --city="Boston,MA" --limit=25
 *   node scripts/pipeline/discover.mjs --dry
 *
 * GOOGLE_MAPS_API_KEY may be provided in the environment, .env.local, or .env.
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
const root = process.cwd();
const ledgerPath = path.join(root, "src/data/discovery-ledger.json");
const outPath = path.join(root, "src/data/seed-listings-discovery-latest.json");
const reportPath = path.join(root, "reports/discovery-latest.json");

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnvFile(path.join(root, ".env.local"));
loadEnvFile(path.join(root, ".env"));

const apiKey = process.env.GOOGLE_MAPS_API_KEY || "";
if (!apiKey) {
  console.error("GOOGLE_MAPS_API_KEY is missing.");
  console.error(
    "Add GOOGLE_MAPS_API_KEY=... to .env.local in the repository root, then run again.",
  );
  process.exit(2);
}

const dataset = readJson(PATHS.dataset, null);
if (!dataset) throw new Error("dataset.json not found");
const queue = readJson(PATHS.queue, null);
if (!queue) throw new Error("expansion-queue.json not found - run build-queue.mjs first");
const retired = retiredIndex(readJson(PATHS.retired, { records: [] }));
const ledger = readJson(ledgerPath, { generatedAt: null, candidates: {} });

const settings = queue.settings ?? {};
const PER_CITY = Math.max(1, Number(args.limit ?? settings.restaurantsPerRun ?? 20));
const CITY_COUNT = Math.max(1, Number(args.cities ?? settings.citiesPerRun ?? 3));
const MAX_ATTEMPTS_PER_CITY = Math.max(
  PER_CITY * 4,
  Number(args.attempts ?? PER_CITY * 5),
);
const seeds = args.seeds
  ? String(args.seeds)
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean)
  : (settings.seeds ?? [
      "best restaurants",
      "neighborhood restaurant",
      "tasting menu",
      "wine bar restaurant",
      "seafood restaurant",
      "chef driven restaurant",
    ]);

function targetsFor() {
  const pending = (queue.cities ?? []).filter(
    (c) => c.status === "pending" && Number(c.gap ?? 0) > 0,
  );
  if (args.city) {
    const [city, stateCode = ""] = String(args.city)
      .split(",")
      .map((s) => s.trim());
    const found = pending.find(
      (c) =>
        c.city.toLowerCase() === city.toLowerCase() &&
        (!stateCode || c.stateCode === stateCode.toUpperCase()),
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

const haveHost = new Set(
  dataset.records.map((r) => normalizeHost(r.website)).filter(Boolean),
);
const havePhone = new Set(
  dataset.records.map((r) => normalizePhone(r.phone)).filter(Boolean),
);
const haveNameCity = new Set(
  dataset.records.map(
    (r) => `${normalizeName(r.title)}|${String(r.city ?? "").trim().toLowerCase()}`,
  ),
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
    if (
      existingCity === cityLower &&
      similarity(existingName, normalized) >= 0.94
    ) {
      return "fuzzy-name";
    }
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

function eligibleCandidate(placeId) {
  if (FORCE) return true;
  const prior = ledger.candidates?.[placeId];
  if (!prior?.lastAttemptAt) return true;
  const next =
    Date.parse(prior.lastAttemptAt) +
    cooldownDays(prior.status, prior.attempts) * 86_400_000;
  return Date.now() >= next;
}

function markCandidate(placeId, status) {
  if (!placeId) return;
  const prior = ledger.candidates?.[placeId] ?? {};
  ledger.candidates[placeId] = {
    status,
    attempts: Number(prior.attempts ?? 0) + 1,
    lastAttemptAt: new Date().toISOString(),
  };
}

const limiter = createLimiter({ minDelayMs: 250, maxRetries: 4 });
async function searchPlaces(query) {
  return limiter.run(async () => {
    let res;
    try {
      res = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask":
            "places.id,places.displayName,places.websiteUri,places.primaryType,nextPageToken",
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
    } catch (error) {
      return { ok: false, status: 0, error: String(error?.message || error) };
    }
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return {
      ok: res.ok,
      status: res.status,
      retryAfter: res.headers.get("retry-after"),
      data,
      error: res.ok ? "" : data?.error?.message || `HTTP ${res.status}`,
    };
  });
}

const startedAt = new Date().toISOString();
const batches = [];
const misses = [];
let searches = 0;
let attempted = 0;
let resolved = 0;
let duplicates = 0;

const targets = targetsFor();
for (const market of targets) {
  const need = Math.min(PER_CITY, Math.max(1, Number(market.gap ?? PER_CITY)));
  const seen = new Map();

  for (const seed of seeds) {
    if (seen.size >= MAX_ATTEMPTS_PER_CITY) break;
    const query = `${seed} in ${market.city}, ${market.stateCode}`;
    const result = await searchPlaces(query);
    searches += 1;
    if (!result?.ok) {
      misses.push({
        market: `${market.city}, ${market.stateCode}`,
        query,
        reason: result?.error || "search failed",
      });
      continue;
    }
    for (const place of result.data?.places ?? []) {
      const id = String(place.id || "").trim();
      if (!id || seen.has(id)) continue;
      seen.set(id, place);
    }
  }

  const listings = [];
  let marketAttempts = 0;
  for (const place of seen.values()) {
    if (listings.length >= need || marketAttempts >= MAX_ATTEMPTS_PER_CITY) break;
    const placeId = String(place.id || "");
    if (!eligibleCandidate(placeId)) continue;
    const name = String(place.displayName?.text || "").trim();
    const url = String(place.websiteUri || "").trim();
    if (!name || !url) {
      markCandidate(placeId, "no-website");
      continue;
    }

    marketAttempts += 1;
    attempted += 1;
    const out = await resolveTarget({ name, url }, market);
    if (!out.ok) {
      markCandidate(placeId, "unresolved");
      misses.push({
        market: `${market.city}, ${market.stateCode}`,
        name,
        reason: "official-site validation failed",
        tried: out.tried,
      });
      continue;
    }

    const dupe = duplicateReason(out.listing, market.city);
    if (dupe) {
      duplicates += 1;
      markCandidate(placeId, "duplicate");
      continue;
    }

    listings.push(out.listing);
    remember(out.listing, market.city);
    markCandidate(placeId, "resolved");
    resolved += 1;
    console.log(`  + ${market.city}: ${out.listing.title} -> ${out.listing.website}`);
  }

  console.log(
    `${market.city}, ${market.stateCode}: ${seen.size} surfaced, ${listings.length} first-party verified for a gap of ${market.gap}.`,
  );
  if (listings.length) {
    batches.push({ city: market.city, stateCode: market.stateCode, listings });
  }
}

const finishedAt = new Date().toISOString();
const report = {
  generatedAt: finishedAt,
  searches,
  attempted,
  resolved,
  duplicates,
  markets: batches.map((b) => ({
    city: b.city,
    stateCode: b.stateCode,
    verified: b.listings.length,
  })),
  misses,
};

if (DRY) {
  console.log(`\nDry run: ${resolved} first-party verified candidates found. Nothing written.`);
  process.exit(0);
}

ledger.generatedAt = finishedAt;
writeJson(ledgerPath, ledger);
writeJson(outPath, {
  note: "Candidates were surfaced through Google Places only to locate likely official websites. Every listing below was then fetched and verified against the restaurant's own site by resolveTarget.mjs; address and phone come from that first-party page. Google ratings, reviews, atmosphere fields and other third-party content are not persisted here.",
  generatedAt: finishedAt,
  batches,
});
writeJson(reportPath, report);
appendRun({
  kind: "discover-first-party",
  startedAt,
  finishedAt,
  searches,
  attempted,
  resolved,
  duplicates,
  markets: batches.map((b) => `${b.city}, ${b.stateCode}`),
  apiCalls: { googleTextSearch: searches, ownedValidation: attempted },
  outPath,
});

console.log(
  `\nDiscovery complete: ${resolved} verified new candidates across ${batches.length} markets.`,
);
console.log(`Seed batch: ${path.relative(root, outPath)}`);
console.log("Next: node scripts/pipeline/seed-and-enrich.mjs");
