/**
 * Shared pipeline utilities: gateway clients, rate limiting, normalization,
 * dedupe keys, completeness scoring, snapshots and run logging.
 *
 * Nothing here invents evidence. Every value written to disk carries the
 * source it came from and the moment it was retrieved.
 */
import fs from "node:fs";
import path from "node:path";

export const ROOT = process.cwd();
export const PATHS = {
  dataset: path.join(ROOT, "src/data/dataset.json"),
  enrichment: path.join(ROOT, "src/data/enrichment.json"),
  queue: path.join(ROOT, "src/data/expansion-queue.json"),
  refreshQueue: path.join(ROOT, "src/data/refresh-queue.json"),
  runLog: path.join(ROOT, "src/data/run-log.json"),
  snapshots: path.join(ROOT, ".pipeline-snapshots"),
};

const GATEWAY = "https://connector-gateway.lovable.dev";

export function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

/** Timestamped copy of every mutable file, so any batch can be reverted. */
export function snapshot(tag) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.join(PATHS.snapshots, `${stamp}-${tag}`);
  fs.mkdirSync(dir, { recursive: true });
  for (const key of ["dataset", "enrichment", "queue", "refreshQueue", "runLog"]) {
    if (fs.existsSync(PATHS[key])) {
      fs.copyFileSync(PATHS[key], path.join(dir, path.basename(PATHS[key])));
    }
  }
  return dir;
}

// ---------------------------------------------------------------- rate limits

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Retriable HTTP statuses: request timeout, rate limit, server errors. */
function isRetriableStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

/** Single in-flight request per provider, with backoff on 408/429/5xx and network throws. */
export function createLimiter({ minDelayMs = 220, maxRetries = 5 } = {}) {
  let chain = Promise.resolve();
  const stats = { calls: 0, retries: 0, failures: 0, deferred: 0 };

  async function attempt(fn) {
    for (let i = 0; i <= maxRetries; i += 1) {
      stats.calls += 1;
      let res;
      try {
        res = await fn();
      } catch (err) {
        if (i === maxRetries) {
          stats.failures += 1;
          throw err;
        }
        stats.retries += 1;
        const wait = Math.min(30_000, 2 ** i * 900) + Math.floor(Math.random() * 500);
        await sleep(wait);
        continue;
      }
      if (!isRetriableStatus(res.status)) return res;
      if (i === maxRetries) {
        stats.failures += 1;
        return res;
      }
      stats.retries += 1;
      const wait = Math.min(30_000, 2 ** i * 900) + Math.floor(Math.random() * 500);
      await sleep(wait);
    }
    return null;
  }

  return {
    stats,
    run(fn) {
      const task = chain.then(async () => {
        await sleep(minDelayMs);
        return attempt(fn);
      });
      chain = task.then(
        () => undefined,
        () => undefined,
      );
      return task;
    },
  };
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} — link the connector before running the pipeline.`);
  return value;
}

// ------------------------------------------------------------- google places

const PLACE_FIELDS = [
  "id",
  "displayName",
  "formattedAddress",
  "addressComponents",
  "location",
  "rating",
  "userRatingCount",
  "priceLevel",
  "nationalPhoneNumber",
  "internationalPhoneNumber",
  "websiteUri",
  "googleMapsUri",
  "regularOpeningHours",
  "businessStatus",
  "types",
  "primaryTypeDisplayName",
  "editorialSummary",
  "outdoorSeating",
  "reservable",
  "delivery",
  "takeout",
  "dineIn",
  "curbsidePickup",
  "goodForGroups",
  "goodForChildren",
  "liveMusic",
  "restroom",
  "menuForChildren",
  "servesVegetarianFood",
  "servesBeer",
  "servesWine",
  "servesCocktails",
  "servesBreakfast",
  "servesBrunch",
  "servesLunch",
  "servesDinner",
  "servesDessert",
  "paymentOptions",
  "parkingOptions",
  "accessibilityOptions",
];

/**
 * Google Places (New) client.
 *
 * Direct (preferred): GOOGLE_MAPS_API_KEY only → places.googleapis.com
 * Legacy Lovable:    LOVABLE_API_KEY + GOOGLE_MAPS_API_KEY → connector gateway
 *
 * Set GOOGLE_PLACES_DIRECT=0 to force the Lovable gateway when both keys exist.
 */
export function googleClient(limiter) {
  const mapsKey = requireEnv("GOOGLE_MAPS_API_KEY");
  const lovableKey = process.env.LOVABLE_API_KEY;
  const forceGateway = process.env.GOOGLE_PLACES_DIRECT === "0";
  const useDirect = !forceGateway || !lovableKey;

  async function post(pathname, body, fieldMask) {
    const res = await limiter.run(() => {
      if (useDirect) {
        // Places API (New) — https://places.googleapis.com/v1/...
        const directPath = pathname.includes("searchNearby")
          ? "/places:searchNearby"
          : "/places:searchText";
        return fetch(`https://places.googleapis.com/v1${directPath}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": mapsKey,
            "X-Goog-FieldMask": fieldMask,
          },
          body: JSON.stringify(body),
        });
      }
      return fetch(`${GATEWAY}/google_maps${pathname}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": mapsKey,
          "Content-Type": "application/json",
          "X-Goog-FieldMask": fieldMask,
        },
        body: JSON.stringify(body),
      });
    });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, status: res.status, error: text.slice(0, 500) };
    }
    return { ok: true, data: JSON.parse(text) };
  }

  return {
    /** Text search restricted to the field mask the schema actually needs. */
    searchText(textQuery, extra = {}) {
      return post(
        "/places/v1/places:searchText",
        { textQuery, maxResultCount: 5, includedType: "restaurant", ...extra },
        PLACE_FIELDS.map((f) => `places.${f}`).join(","),
      );
    },
    searchNearby(body) {
      return post(
        "/places/v1/places:searchNearby",
        { includedTypes: ["restaurant"], maxResultCount: 20, ...body },
        PLACE_FIELDS.map((f) => `places.${f}`).join(","),
      );
    },
  };
}

// ------------------------------------------------------------------ firecrawl

/**
 * Prefer direct Firecrawl API when FIRECRAWL_API_KEY is set.
 * Falls back to Lovable connector gateway only if LOVABLE_API_KEY is also present
 * and FIRECRAWL_DIRECT=0 (legacy path).
 */
export function firecrawlClient(limiter) {
  const fcKey = requireEnv("FIRECRAWL_API_KEY");
  const useDirect = process.env.FIRECRAWL_DIRECT !== "0";
  const lovableKey = process.env.LOVABLE_API_KEY;

  return {
    async scrape(url) {
      const res = await limiter.run(() => {
        if (useDirect || !lovableKey) {
          // Direct Firecrawl (v1 scrape — stable with fc- keys)
          return fetch("https://api.firecrawl.dev/v1/scrape", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${fcKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              url,
              formats: ["markdown", "links"],
              onlyMainContent: true,
              timeout: 25000,
            }),
          });
        }
        return fetch(`${GATEWAY}/firecrawl/v2/scrape`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${lovableKey}`,
            "X-Connection-Api-Key": fcKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url,
            formats: ["markdown", "links"],
            onlyMainContent: true,
            timeout: 25000,
          }),
        });
      });
      const text = await res.text();
      if (!res.ok) return { ok: false, status: res.status, error: text.slice(0, 400) };
      const json = JSON.parse(text);
      const doc = json.data ?? json;
      return {
        ok: true,
        markdown: doc.markdown ?? "",
        links: doc.links ?? [],
        metadata: doc.metadata ?? {},
      };
    },
  };
}


// ------------------------------------------------------------------ normalize

export const normalizePhone = (raw) => {
  if (!raw) return "";
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return digits ? `+${digits}` : "";
};

export const normalizeHost = (raw) => {
  if (!raw) return "";
  try {
    const u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    return u.host.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
};

const LEGAL = /\b(llc|inc|ltd|co|corp|restaurant|kitchen|bar|cafe|caf\u00e9)\b/g;

export const normalizeName = (raw) =>
  String(raw ?? "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[\u2018\u2019'".,!?()]/g, "")
    .replace(/\b(the|a|an)\b/g, " ")
    .replace(LEGAL, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Dice coefficient on bigrams — cheap, no dependency, good enough for names. */
export function similarity(a, b) {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const grams = (s) => {
    const out = new Map();
    for (let i = 0; i < s.length - 1; i += 1) {
      const g = s.slice(i, i + 2);
      out.set(g, (out.get(g) ?? 0) + 1);
    }
    return out;
  };
  const gx = grams(x);
  const gy = grams(y);
  let hits = 0;
  for (const [g, n] of gx) hits += Math.min(n, gy.get(g) ?? 0);
  const total = [...gx.values()].reduce((a2, b2) => a2 + b2, 0) + [...gy.values()].reduce((a2, b2) => a2 + b2, 0);
  return total ? (2 * hits) / total : 0;
}

export function metersBetween(a, b) {
  if (!a || !b) return Infinity;
  const R = 6_371_000;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// --------------------------------------------------------------- place shaping

const COMP = (components, type) =>
  components?.find((c) => c.types?.includes(type))?.longText ?? "";
const COMP_SHORT = (components, type) =>
  components?.find((c) => c.types?.includes(type))?.shortText ?? "";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const hhmm = (h, m) => `${String(h ?? 0).padStart(2, "0")}:${String(m ?? 0).padStart(2, "0")}`;

export function structuredHours(regularOpeningHours) {
  if (!regularOpeningHours?.periods?.length) return null;
  const byDay = DAYS.map((day) => ({ day, intervals: [] }));
  for (const p of regularOpeningHours.periods) {
    const idx = p.open?.day;
    if (idx === undefined || !byDay[idx]) continue;
    byDay[idx].intervals.push({
      open: hhmm(p.open.hour, p.open.minute),
      close: p.close ? hhmm(p.close.hour, p.close.minute) : "24:00",
    });
  }
  return byDay;
}

const AMENITY_KEYS = [
  "outdoorSeating",
  "reservable",
  "delivery",
  "takeout",
  "dineIn",
  "curbsidePickup",
  "goodForGroups",
  "goodForChildren",
  "liveMusic",
  "restroom",
  "menuForChildren",
  "servesVegetarianFood",
  "servesBeer",
  "servesWine",
  "servesCocktails",
  "servesBreakfast",
  "servesBrunch",
  "servesLunch",
  "servesDinner",
  "servesDessert",
];

const PRICE_LEVEL_LABEL = {
  PRICE_LEVEL_FREE: "Free",
  PRICE_LEVEL_INEXPENSIVE: "$",
  PRICE_LEVEL_MODERATE: "$$",
  PRICE_LEVEL_EXPENSIVE: "$$$",
  PRICE_LEVEL_VERY_EXPENSIVE: "$$$$",
};

/** Shape a Places result into the stored `google` evidence block. */
export function shapeGoogle(place, retrievedAt) {
  const c = place.addressComponents;
  const amenities = {};
  for (const key of AMENITY_KEYS) {
    if (typeof place[key] === "boolean") amenities[key] = place[key];
  }
  const accessibility = place.accessibilityOptions ?? {};
  const parking = place.parkingOptions ?? {};
  return {
    placeId: place.id,
    displayName: place.displayName?.text ?? "",
    businessStatus: place.businessStatus ?? "",
    formattedAddress: place.formattedAddress ?? "",
    address: {
      streetNumber: COMP(c, "street_number"),
      route: COMP(c, "route"),
      neighborhood: COMP(c, "neighborhood"),
      locality: COMP(c, "locality"),
      county: COMP(c, "administrative_area_level_2"),
      state: COMP(c, "administrative_area_level_1"),
      stateCode: COMP_SHORT(c, "administrative_area_level_1"),
      postalCode: COMP(c, "postal_code"),
      country: COMP_SHORT(c, "country"),
    },
    latLng: place.location ?? null,
    phone: place.nationalPhoneNumber ?? "",
    phoneE164: normalizePhone(place.internationalPhoneNumber ?? place.nationalPhoneNumber),
    website: place.websiteUri ?? "",
    googleMapsUri: place.googleMapsUri ?? "",
    priceLevel: place.priceLevel ?? "",
    priceBand: PRICE_LEVEL_LABEL[place.priceLevel] ?? "",
    rating: typeof place.rating === "number" ? place.rating : null,
    reviewCount: typeof place.userRatingCount === "number" ? place.userRatingCount : null,
    categories: (place.types ?? []).filter(
      (t) => !["point_of_interest", "establishment", "food"].includes(t),
    ),
    primaryCategory: place.primaryTypeDisplayName?.text ?? "",
    hours: structuredHours(place.regularOpeningHours),
    amenities,
    accessibility,
    parking,
    editorialSummary: place.editorialSummary?.text ?? "",
    retrievedAt,
  };
}

// ---------------------------------------------------------------- completeness

/** 24 checks across the fields the plan promised to fill. */
export function completeness(record, enrichment) {
  const g = enrichment?.google;
  const s = enrichment?.site;
  const checks = [
    !!g?.address?.route,
    !!g?.address?.locality,
    !!g?.address?.stateCode,
    !!g?.address?.postalCode,
    !!g?.latLng,
    !!(g?.categories?.length || record.cuisineTags?.length),
    !!g?.priceBand || !!record.priceTags?.length,
    !!g?.hours?.some?.((d) => d.intervals.length),
    !!(g?.phone || record.phone),
    !!(g?.website || record.website),
    !!(s?.reservationUrl || record.reservationUrl),
    !!(s?.menuUrl || record.menuUrl),
    g?.rating != null,
    g?.reviewCount != null,
    Object.keys(g?.amenities ?? {}).length >= 5,
    Object.keys(g?.accessibility ?? {}).length > 0,
    !!s?.dietaryLanguage?.length,
    !!s?.accessibilityLanguage?.length,
    !!s?.dressCode,
    !!s?.groupPolicy,
    !!s?.sourceUrls?.length,
    !!enrichment?.summary?.text,
    !!enrichment?.meta?.lastEnrichedAt,
    enrichment?.meta?.matchStatus === "resolved",
  ];
  const filled = checks.filter(Boolean).length;
  return { filled, total: checks.length, score: Math.round((filled / checks.length) * 100) };
}

// -------------------------------------------------------------------- run log

export function appendRun(entry) {
  const log = readJson(PATHS.runLog, { runs: [] });
  log.runs.unshift(entry);
  log.runs = log.runs.slice(0, 60);
  writeJson(PATHS.runLog, log);
  return entry;
}
