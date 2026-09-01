#!/usr/bin/env node
/**
 * Builds src/data/live/<region-group>.json — the "dynamic layer".
 *
 * Everything here is derived from data already in the repo:
 *   - enrichment.json   → exact coordinates, neighborhood, structured hours,
 *                         price band, accessibility, amenities, rating
 *   - city-centroids    → city-level coordinates where no exact point exists
 *   - dataset.json      → first-party price prose, spend bands, city/state
 *   - reputation-patterns.json / first-party-dishes.json → named dishes
 *
 * Nothing is invented. Every field carries the provenance of where it came
 * from so the UI can say "exact" vs "city-level" vs "not stated".
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseHoursProse } from "./parse-hours.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const read = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));

const dataset = read("src/data/dataset.json");
const enrichment = read("src/data/enrichment.json").records ?? {};
const centroids = read("scripts/data/city-centroids.json");
const patterns = read("src/data/reputation-patterns.json").records ?? {};
let firstPartyDishes = {};
try {
  firstPartyDishes = read("src/data/first-party-dishes.json");
} catch {
  /* optional */
}

/* ── timezone by state / province ───────────────────────────────────────── */
const TZ = {
  Alabama: "America/Chicago",
  Alaska: "America/Anchorage",
  Arizona: "America/Phoenix",
  Arkansas: "America/Chicago",
  California: "America/Los_Angeles",
  Colorado: "America/Denver",
  Connecticut: "America/New_York",
  Delaware: "America/New_York",
  "District Of Columbia": "America/New_York",
  Florida: "America/New_York",
  Georgia: "America/New_York",
  Hawaii: "Pacific/Honolulu",
  Idaho: "America/Boise",
  Illinois: "America/Chicago",
  Indiana: "America/Indiana/Indianapolis",
  Iowa: "America/Chicago",
  Kansas: "America/Chicago",
  Kentucky: "America/New_York",
  Louisiana: "America/Chicago",
  Maine: "America/New_York",
  Maryland: "America/New_York",
  Massachusetts: "America/New_York",
  Michigan: "America/Detroit",
  Minnesota: "America/Chicago",
  Mississippi: "America/Chicago",
  Missouri: "America/Chicago",
  Montana: "America/Denver",
  Nebraska: "America/Chicago",
  Nevada: "America/Los_Angeles",
  "New Hampshire": "America/New_York",
  "New Jersey": "America/New_York",
  "New Mexico": "America/Denver",
  "New York": "America/New_York",
  "North Carolina": "America/New_York",
  "North Dakota": "America/Chicago",
  Ohio: "America/New_York",
  Oklahoma: "America/Chicago",
  Oregon: "America/Los_Angeles",
  Pennsylvania: "America/New_York",
  "Rhode Island": "America/New_York",
  "South Carolina": "America/New_York",
  "South Dakota": "America/Chicago",
  Tennessee: "America/Chicago",
  Texas: "America/Chicago",
  Utah: "America/Denver",
  Vermont: "America/New_York",
  Virginia: "America/New_York",
  Washington: "America/Los_Angeles",
  "West Virginia": "America/New_York",
  Wisconsin: "America/Chicago",
  Wyoming: "America/Denver",
  "British Columbia": "America/Vancouver",
};

/**
 * Cities whose state-level timezone is wrong.
 *
 * Several states straddle a boundary: the Idaho panhandle keeps Pacific time,
 * east Tennessee keeps Eastern, far-west Texas and west South Dakota keep
 * Mountain. Mapping by state alone puts "open now" an hour out in both
 * directions for those rooms.
 */
/** City keys vary by apostrophe and case ("Coeur d\u2019Alene" vs "Coeur d'Alene"). */
const tzKey = (city, state) =>
  `${String(city ?? "").trim()}|${String(state ?? "").trim()}`
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc\u0060\u00b4]/g, "'");

const TZ_CITY_RAW = {
  // Idaho panhandle — Pacific, not Mountain
  "Coeur D'Alene|Idaho": "America/Los_Angeles",
  "Coeur d'Alene|Idaho": "America/Los_Angeles",
  "Sandpoint|Idaho": "America/Los_Angeles",
  "Moscow|Idaho": "America/Los_Angeles",
  "Lewiston|Idaho": "America/Los_Angeles",
  // East Tennessee — Eastern, not Central
  "Chattanooga|Tennessee": "America/New_York",
  "Knoxville|Tennessee": "America/New_York",
  "Johnson City|Tennessee": "America/New_York",
  "Kingsport|Tennessee": "America/New_York",
  "Gatlinburg|Tennessee": "America/New_York",
  "Sevierville|Tennessee": "America/New_York",
  "Pigeon Forge|Tennessee": "America/New_York",
  // Far-west Texas — Mountain, not Central
  "El Paso|Texas": "America/Denver",
  // West South Dakota — Mountain, not Central
  "Rapid City|South Dakota": "America/Denver",
  "Deadwood|South Dakota": "America/Denver",
  "Spearfish|South Dakota": "America/Denver",
  // Western edges of Central states
  "Scottsbluff|Nebraska": "America/Denver",
  "Dickinson|North Dakota": "America/Denver",
  // Florida panhandle — Central, not Eastern
  "Pensacola|Florida": "America/Chicago",
  "Panama City|Florida": "America/Chicago",
  "Destin|Florida": "America/Chicago",
  // West Kentucky — Central, not Eastern
  "Paducah|Kentucky": "America/Chicago",
  "Bowling Green|Kentucky": "America/Chicago",
  // North-west / south-west Indiana — Central, not Eastern
  "Gary|Indiana": "America/Chicago",
  "Evansville|Indiana": "America/Chicago",
  // Oregon's Idaho border — Mountain, not Pacific
  "Ontario|Oregon": "America/Boise",
};

const TZ_CITY = Object.fromEntries(
  Object.entries(TZ_CITY_RAW).map(([k, v]) => {
    const [city, state] = k.split("|");
    return [tzKey(city, state), v];
  }),
);

/* ── per-person spend ranges, in USD ────────────────────────────────────── */
const BAND_RANGE = { $: [12, 25], $$: [25, 50], $$$: [50, 90], $$$$: [90, 200] };
const SPEND_BAND_RANGE = {
  "Moderate planning band": [25, 60],
  "Premium planning band": [80, 180],
  $: [12, 25],
  $$: [25, 50],
  $$$: [50, 90],
  $$$$: [90, 200],
};
const SPEND_BAND_SYMBOL = {
  "Moderate planning band": "$$",
  "Premium planning band": "$$$$",
  $: "$",
  $$: "$$",
  $$$: "$$$",
  $$$$: "$$$$",
};
const GOOGLE_BAND = {
  PRICE_LEVEL_INEXPENSIVE: "$",
  PRICE_LEVEL_MODERATE: "$$",
  PRICE_LEVEL_EXPENSIVE: "$$$",
  PRICE_LEVEL_VERY_EXPENSIVE: "$$$$",
};

/* City centroids: the curated table, plus a centroid averaged from any exact
   points we already hold for that city. Derived beats curated. */
const cityPoints = new Map();
for (const r of dataset.records) {
  const g = enrichment[r.slug]?.google?.latLng;
  if (!g?.latitude || !g?.longitude) continue;
  const key = `${(r.city ?? "").trim()}|${(r.stateProvince ?? "").trim()}`;
  const list = cityPoints.get(key) ?? [];
  list.push([g.latitude, g.longitude]);
  cityPoints.set(key, list);
}
for (const [key, pts] of cityPoints) {
  const lat = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const lng = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  centroids[key] = [+lat.toFixed(5), +lng.toFixed(5)];
}

const DAY_INDEX = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

/** Turn "17:00" into minutes-from-midnight. */
const mins = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm ?? "").trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

function packHours(hours) {
  if (!Array.isArray(hours) || !hours.length) return null;
  const week = [[], [], [], [], [], [], []];
  let any = false;
  for (const day of hours) {
    const i = DAY_INDEX[day?.day];
    if (i === undefined) continue;
    for (const iv of day.intervals ?? []) {
      const o = mins(iv.open),
        c = mins(iv.close);
      if (o === null || c === null) continue;
      week[i].push([o, c]);
      any = true;
    }
  }
  return any ? week : null;
}

/** Read a per-guest figure out of first-party price prose. */
function perPersonFromProse(text) {
  if (!text) return null;
  const t = String(text);
  const perGuest =
    /\$\s?(\d{2,4})(?:\.\d\d)?\s*(?:per\s+(?:guest|person)|pp\b|\/\s*(?:guest|person))/i.exec(t);
  const service = /(\d{1,2})\s?%\s*(?:service|gratuity|admin)/i.exec(t);
  // Only an explicit "per guest / per person / pp" statement counts.
  //
  // The previous fallback took the first dollar figure in any sentence
  // containing "menu" or "per" — words present in nearly every priceDetails
  // string — and published corkage fees, appetiser ranges and third-party
  // price bands as "About $N per guest, published by the restaurant". Seven of
  // the eight figures it produced were wrong. A missing price is honest; a
  // corkage fee dressed as a dinner price is not.
  const base = perGuest ? Number(perGuest[1]) : null;
  if (base === null || base < 8 || base > 1200) return null;
  const pct = service ? Number(service[1]) : 0;
  const withService = pct ? Math.round(base * (1 + pct / 100)) : base;
  return { range: [withService, withService], stated: base, servicePct: pct || null };
}

/**
 * Money you can lose without eating.
 *
 * Deposits and cancellation fees appear in `reservationDetails` prose. They are
 * emphatically NOT the price of dinner — a $150 per-guest cancellation fee is
 * not a $150 dinner — so they are captured separately and never feed spend.
 */
function bookingRisk(text) {
  if (!text) return null;
  const t = String(text).replace(/&rsquo;/g, "'");

  /* Judge the clause the money sits in, not the whole field. These strings
     routinely carry two unrelated terms — an ordinary table cancellation and a
     private-event contract — and reading an amount from one with a window from
     the other states neither. */
  const clauses = t
    .split(/·|\.\s+|;\s+/)
    .map((c) => c.trim())
    .filter(Boolean);

  // Money attached to an event, buyout, tour or signed agreement is not what
  // it costs to hold a table.
  const EVENT =
    /\b(tour|buy[\s-]?out|buyout|event|private dining|group|catering|signed agreement|contract|minimum)\b/i;

  const num = (v) => Number(String(v).replace(/,/g, ""));
  const out = {};
  let chosen = null;

  for (const c of clauses) {
    if (EVENT.test(c)) continue;
    const cancel =
      /\$\s?([\d,]+(?:\.\d\d)?)[^.]{0,60}?(?:cancellation|cancel|no[\s-]?show)|(?:cancellation|cancel|no[\s-]?show)[^.]{0,60}?\$\s?([\d,]+(?:\.\d\d)?)/i.exec(
        c,
      );
    const deposit =
      /\$\s?([\d,]+(?:\.\d\d)?)[^.]{0,40}?deposit|deposit[^.]{0,40}?\$\s?([\d,]+(?:\.\d\d)?)/i.exec(
        c,
      );
    const hit = cancel ?? deposit;
    if (!hit) continue;
    const value = num(hit[1] ?? hit[2]);
    if (!(value > 0 && value < 100000)) continue;
    if (cancel) out.cancelFee = value;
    else out.deposit = value;
    chosen = c;
    break;
  }

  if (!chosen) {
    // No figure, but a clause may still state the commitment shape.
    const plain = clauses.find(
      (c) => !EVENT.test(c) && /non[\s-]?refundable|prepaid|prepay/i.test(c),
    );
    if (!plain) return null;
    out.prepaid = true;
    chosen = plain;
  }

  if (/per[\s-]?(?:person|guest|head)/i.test(chosen)) out.perGuest = true;
  const window = /within\s+(\d{1,3})\s*(hour|day)/i.exec(chosen);
  if (window) {
    out.windowHours = window[2].toLowerCase().startsWith("day")
      ? Number(window[1]) * 24
      : Number(window[1]);
  }
  return out;
}

function dishesFor(slug) {
  const out = [];
  const fp = firstPartyDishes[slug];
  if (Array.isArray(fp)) for (const d of fp) out.push({ name: d, source: "first-party" });
  const rep = patterns[slug];
  if (rep && Array.isArray(rep.dishesRecommended)) {
    for (const d of rep.dishesRecommended) {
      const name = typeof d === "string" ? d : d?.name;
      if (!name) continue;
      if (out.some((x) => x.name.toLowerCase() === String(name).toLowerCase())) continue;
      out.push({ name: String(name), source: "reviews" });
    }
  }
  return out.slice(0, 6);
}

/* ── build ──────────────────────────────────────────────────────────────── */
const byGroup = new Map();
const stats = {
  total: 0,
  exact: 0,
  city: 0,
  none: 0,
  hours: 0,
  hoursGoogle: 0,
  hoursProse: 0,
  band: 0,
  pp: 0,
  dishes: 0,
  hood: 0,
  risk: 0,
};

for (const r of dataset.records) {
  stats.total++;
  const g = enrichment[r.slug]?.google ?? null;
  const row = {};

  /* coordinates */
  if (g?.latLng?.latitude != null && g?.latLng?.longitude != null) {
    row.ll = [+g.latLng.latitude.toFixed(5), +g.latLng.longitude.toFixed(5)];
    row.llSource = "exact";
    stats.exact++;
  } else {
    const key = `${(r.city ?? "").trim()}|${(r.stateProvince ?? "").trim()}`;
    const c = centroids[key];
    if (c) {
      row.ll = c;
      row.llSource = "city";
      stats.city++;
    } else {
      stats.none++;
    }
  }

  row.tz = TZ_CITY[tzKey(r.city, r.stateProvince)] ?? TZ[r.stateProvince] ?? null;
  if (!row.tz) stats.noTz++;

  /* neighborhood */
  const hood = g?.address?.neighborhood ?? null;
  if (hood) {
    row.hood = hood;
    stats.hood++;
  }

  /* hours — the directory schedule where one exists, otherwise read out of the
     restaurant's own published prose. First-party beats directory when both
     exist only in provenance, not in precedence: Google's is structured and
     dated, so it wins the slot and the prose is recorded as corroboration. */
  const hours = packHours(g?.hours);
  if (hours) {
    row.hours = hours;
    row.hoursSource = "google";
    stats.hours++;
    stats.hoursGoogle++;
  } else {
    const prose = parseHoursProse(r.hoursSummary);
    if (prose) {
      row.hours = prose.week;
      row.hoursSource = "first-party-prose";
      stats.hours++;
      stats.hoursProse++;
    }
  }

  /* price band */
  const gBand = g?.priceBand ?? GOOGLE_BAND[g?.priceLevel] ?? null;
  const spendBand = (r.spendBands ?? []).find((b) => SPEND_BAND_RANGE[b]);
  if (gBand) {
    row.band = gBand;
    row.bandSource = "directory";
    stats.band++;
  } else if (spendBand) {
    row.band = SPEND_BAND_SYMBOL[spendBand];
    row.bandSource = "planning-band";
    stats.band++;
  }

  /* per-person */
  const prose = perPersonFromProse(r.priceDetails);
  if (prose) {
    row.pp = prose.range;
    row.ppSource = "published";
    if (prose.servicePct) row.ppService = prose.servicePct;
    if (prose.stated) row.ppStated = prose.stated;
    stats.pp++;
  } else if (gBand && BAND_RANGE[gBand]) {
    row.pp = BAND_RANGE[gBand];
    row.ppSource = "band";
    stats.pp++;
  } else if (spendBand && SPEND_BAND_RANGE[spendBand]) {
    row.pp = SPEND_BAND_RANGE[spendBand];
    row.ppSource = "planning-band";
    stats.pp++;
  }

  /* what you can lose without eating */
  const risk = bookingRisk(r.reservationDetails);
  if (risk) {
    row.risk = risk;
    stats.risk++;
  }

  /* rating (context only — never ranks) */
  if (g?.rating != null) row.rating = [g.rating, g.reviewCount ?? 0];

  /* accessibility — real evidence, replaces "not stated" guesswork */
  const a = g?.accessibility;
  if (a && Object.values(a).some((v) => v === true)) {
    row.a11y = {
      entrance: a.wheelchairAccessibleEntrance ?? null,
      restroom: a.wheelchairAccessibleRestroom ?? null,
      seating: a.wheelchairAccessibleSeating ?? null,
      parking: a.wheelchairAccessibleParking ?? null,
    };
  }

  /* amenities worth deciding on */
  const am = g?.amenities;
  if (am) {
    row.am = {};
    for (const k of [
      "outdoorSeating",
      "reservable",
      "goodForGroups",
      "goodForChildren",
      "servesVegetarianFood",
      "servesCocktails",
      "servesWine",
      "servesBeer",
      "servesBrunch",
      "servesLunch",
      "servesDinner",
      "liveMusic",
      "takeout",
      "dineIn",
      "restroom",
      "menuForChildren",
      "servesDessert",
    ]) {
      if (am[k] === true || am[k] === false) row.am[k] = am[k];
    }
    if (!Object.keys(row.am).length) delete row.am;
  }

  if (g?.parking) row.parking = g.parking;
  if (g?.googleMapsUri) row.mapUri = g.googleMapsUri;
  if (g?.primaryCategory) row.category = g.primaryCategory;

  /* dishes */
  const dishes = dishesFor(r.slug);
  if (dishes.length) {
    row.dishes = dishes;
    stats.dishes++;
  }

  /* reputation tradeoffs */
  const rep = patterns[r.slug];
  if (rep) {
    row.rep = {
      praise: (rep.recurringPraise ?? []).slice(0, 3),
      complaints: (rep.recurringComplaints ?? []).slice(0, 3),
      consistency: rep.consistencySignal ?? null,
      value: rep.portionValuePattern ?? null,
      service: rep.servicePattern ?? null,
      sample: rep.sampleSize ?? null,
      recency: rep.recency ?? null,
    };
  }

  const group = r.regionGroup || r.region || "Unstated";
  if (!byGroup.has(group)) byGroup.set(group, {});
  byGroup.get(group)[r.slug] = row;
}

/* ── write ──────────────────────────────────────────────────────────────── */
const outDir = join(root, "src", "data", "live");
mkdirSync(outDir, { recursive: true });

const fileName = (g) =>
  g
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const generatedAt = new Date().toISOString();
const index = {};

for (const [group, records] of byGroup) {
  const f = fileName(group);
  index[group] = f;
  writeFileSync(
    join(outDir, `${f}.json`),
    JSON.stringify({ regionGroup: group, generatedAt, records }),
  );
}
writeFileSync(
  join(outDir, "index.json"),
  JSON.stringify({ generatedAt, groups: index, stats }, null, 2),
);

console.log("live index built");
console.table(stats);
console.log(`${Object.keys(index).length} region files → src/data/live/`);
