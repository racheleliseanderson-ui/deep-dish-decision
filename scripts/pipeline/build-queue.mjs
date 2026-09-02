/**
 * Builds src/data/expansion-queue.json: prioritized metros first, then a
 * per-state floor so coverage cannot stay coastal.
 *
 * A city is no longer considered complete merely because one seed batch ran.
 * The queue measures the actual corpus inventory in that market and keeps the
 * market open until a population-scaled density floor is reached.
 */
import { PATHS, readJson, writeJson } from "./lib.mjs";
import { STATES } from "./regions.mjs";

/** Top US metros by 2023 population, in expansion order. */
const METROS = [
  ["New York", "NY", 19498249], ["Los Angeles", "CA", 12799100], ["Chicago", "IL", 9262825],
  ["Dallas", "TX", 8100037], ["Houston", "TX", 7510253], ["Atlanta", "GA", 6307261],
  ["Washington", "DC", 6304975], ["Philadelphia", "PA", 6246160], ["Miami", "FL", 6183199],
  ["Phoenix", "AZ", 5070110], ["Boston", "MA", 4919179], ["Riverside", "CA", 4688053],
  ["San Francisco", "CA", 4566961], ["Detroit", "MI", 4342304], ["Seattle", "WA", 4044837],
  ["Minneapolis", "MN", 3712020], ["Tampa", "FL", 3342963], ["San Diego", "CA", 3269973],
  ["Denver", "CO", 3005131], ["Baltimore", "MD", 2834316], ["Orlando", "FL", 2817933],
  ["Charlotte", "NC", 2805115], ["San Antonio", "TX", 2703999], ["Portland", "OR", 2508050],
  ["Austin", "TX", 2473275], ["Pittsburgh", "PA", 2422725], ["Sacramento", "CA", 2420608],
  ["Las Vegas", "NV", 2336573], ["Cincinnati", "OH", 2271479], ["Kansas City", "MO", 2221343],
  ["Columbus", "OH", 2180271], ["Indianapolis", "IN", 2138468], ["Cleveland", "OH", 2158932],
  ["Nashville", "TN", 2102573], ["San Jose", "CA", 1945767], ["Virginia Beach", "VA", 1787169],
  ["Jacksonville", "FL", 1713240], ["Providence", "RI", 1677803], ["Milwaukee", "WI", 1560424],
  ["Raleigh", "NC", 1509231], ["Oklahoma City", "OK", 1477926], ["Louisville", "KY", 1365557],
  ["Richmond", "VA", 1349732], ["Memphis", "TN", 1335674], ["Salt Lake City", "UT", 1267864],
  ["New Orleans", "LA", 1261726], ["Buffalo", "NY", 1155604], ["Hartford", "CT", 1150826],
  ["Birmingham", "AL", 1184290], ["Grand Rapids", "MI", 1162950], ["Rochester", "NY", 1052087],
  ["Tucson", "AZ", 1063162], ["Fresno", "CA", 1180020], ["Tulsa", "OK", 1044757],
  ["Omaha", "NE", 983969], ["Albuquerque", "NM", 922000], ["Bakersfield", "CA", 913820],
  ["Knoxville", "TN", 946790], ["Albany", "NY", 906311], ["Boise", "ID", 824657],
  ["Columbia", "SC", 858302], ["Little Rock", "AR", 754876], ["Des Moines", "IA", 754354],
  ["Spokane", "WA", 600292], ["Madison", "WI", 693746], ["Wichita", "KS", 650000],
  ["Jackson", "MS", 591978], ["Portland", "ME", 556893], ["Charleston", "WV", 253000],
  ["Manchester", "NH", 422937], ["Wilmington", "DE", 730000], ["Burlington", "VT", 226000],
  ["Sioux Falls", "SD", 300000], ["Fargo", "ND", 260000], ["Billings", "MT", 195000],
  ["Cheyenne", "WY", 100512], ["Anchorage", "AK", 396317], ["Honolulu", "HI", 1016508],
];

const STATEWIDE_FILL = [
  ["Fort Worth", "TX", 978234],
  ["Savannah", "GA", 147780],
  ["Colorado Springs", "CO", 488694],
  ["Oakland", "CA", 440646],
  ["Fort Lauderdale", "FL", 182760],
  ["Asheville", "NC", 94589],
  ["St. Louis", "MO", 281754],
  ["Worcester", "MA", 206518],
  ["Baton Rouge", "LA", 222185],
  ["El Paso", "TX", 678815],
  ["Lexington", "KY", 322570],
  ["Ann Arbor", "MI", 123851],
  ["Norfolk", "VA", 238005],
  ["Lincoln", "NE", 291082],
  ["Charleston", "SC", 150227],
  ["Huntsville", "AL", 221933],
  ["Fort Wayne", "IN", 269994],
  ["New Haven", "CT", 135081],
  ["Santa Fe", "NM", 89088],
  ["Lawrence", "KS", 95394],
  ["Athens", "GA", 127315],
  ["Cedar Rapids", "IA", 137710],
  ["Rapid City", "SD", 78000],
  ["Mobile", "AL", 187041],
  ["Fort Collins", "CO", 169810],
  ["Springfield", "MO", 169176],
  ["Greenville", "SC", 72095],
  ["Rochester", "MN", 121395],
  ["Durham", "NC", 283506],
  ["Topeka", "KS", 126587],
  ["Lafayette", "LA", 121374],
  ["Bozeman", "MT", 54539],
  ["Missoula", "MT", 75516],
  ["Tacoma", "WA", 219346],
  ["Flagstaff", "AZ", 76831],
  ["Frederick", "MD", 79588],
  ["Greensboro", "NC", 299035],
  ["Toledo", "OH", 266301],
  ["Corpus Christi", "TX", 316239],
  ["Reno", "NV", 264738],
  ["Chattanooga", "TN", 181099],
  ["Wilmington", "NC", 117643],
  ["Dayton", "OH", 137644],
  ["Allentown", "PA", 125845],
  ["Winston-Salem", "NC", 249545],
];

const existing = readJson(PATHS.queue, null);
const dataset = readJson(PATHS.dataset, { records: [] });
const prior = new Map((existing?.cities ?? []).map((c) => [`${c.city}|${c.stateCode}`, c]));

const properStateName = (code) => {
  const hit = Object.entries(STATES).find(([, meta]) => meta.code === code);
  return hit ? hit[0].replace(/\b\w/g, (m) => m.toUpperCase()) : code;
};

function countMarket(city, stateCode) {
  const cityKey = city.toLowerCase();
  const stateName = properStateName(stateCode).toLowerCase();
  return (dataset.records ?? []).filter((record) => {
    if (String(record.city ?? "").trim().toLowerCase() !== cityKey) return false;
    const state = String(record.stateProvince ?? "").trim().toLowerCase();
    const region = String(record.region ?? "").trim().toUpperCase();
    return state === stateCode.toLowerCase() || state === stateName || region.endsWith(`, ${stateCode}`);
  }).length;
}

function densityTarget(population, priority) {
  if (priority <= 10 || population >= 5_000_000) return 60;
  if (priority <= 25 || population >= 2_500_000) return 50;
  if (priority <= 50 || population >= 1_000_000) return 40;
  if (population >= 500_000) return 30;
  if (population >= 250_000) return 25;
  return 20;
}

function queueRecord({ city, stateCode, population, priority, tier, before, note = "" }) {
  const currentCount = countMarket(city, stateCode);
  const targetCount = densityTarget(population, priority);
  const gap = Math.max(0, targetCount - currentCount);
  const blocked = before?.status === "blocked";
  return {
    city,
    stateCode,
    population,
    priority,
    tier,
    status: blocked ? "blocked" : gap === 0 ? "done" : "pending",
    densityStatus: gap === 0 ? "at-floor" : "under-floor",
    targetCount,
    currentCount,
    gap,
    pinned: before?.pinned ?? false,
    inserted: before?.inserted ?? 0,
    lastRunAt: before?.lastRunAt ?? null,
    note: before?.note ?? note,
  };
}

const cities = METROS.map(([city, stateCode, population], i) => {
  const priority = i + 1;
  const key = `${city}|${stateCode}`;
  return queueRecord({
    city,
    stateCode,
    population,
    priority,
    tier: i < 50 ? "top-50-metro" : "state-floor",
    before: prior.get(key),
  });
});

// Every US state + DC must appear at least once before any statewide fill.
const covered = new Set(cities.map((c) => c.stateCode));
const missing = Object.entries(STATES)
  .filter(([, v]) => !covered.has(v.code))
  .sort((a, b) => b[1].population - a[1].population);

let priority = cities.length;
for (const [name, meta] of missing) {
  priority += 1;
  const city = name;
  const key = `${city}|${meta.code}`;
  cities.push(
    queueRecord({
      city,
      stateCode: meta.code,
      population: meta.population,
      priority,
      tier: "state-floor",
      before: prior.get(key),
      note: "Statewide seed — no metro in the top list covers this state.",
    }),
  );
}

for (const [city, stateCode, population] of STATEWIDE_FILL) {
  const key = `${city}|${stateCode}`;
  if (cities.some((c) => `${c.city}|${c.stateCode}` === key)) continue;
  priority += 1;
  cities.push(
    queueRecord({
      city,
      stateCode,
      population,
      priority,
      tier: "statewide-fill",
      before: prior.get(key),
      note: "Statewide fill of a mid-size city after the state floor.",
    }),
  );
}

const settings = existing?.settings ?? {
  paused: false,
  restaurantsPerRun: 25,
  citiesPerRun: 1,
  dailyCap: 200,
  maxCitiesPerDay: 3,
  minCompletenessToKeep: 55,
  seeds: [
    "best restaurants",
    "fine dining",
    "neighborhood restaurant",
    "tasting menu",
    "seafood restaurant",
    "wine bar restaurant",
  ],
};
settings.densityFloors = {
  top10: 60,
  top25: 50,
  top50: 40,
  over500k: 30,
  over250k: 25,
  smaller: 20,
};

writeJson(PATHS.queue, {
  generatedAt: new Date().toISOString(),
  settings,
  order: [
    "Top 50 US metros by population — keep open until density floor is met",
    "Remaining metros over 500k",
    "State floor: every state + DC seeded before statewide fill",
    "Statewide fill of mid-size cities",
  ],
  summary: {
    targetMarkets: cities.length,
    underFloor: cities.filter((c) => c.gap > 0).length,
    totalGap: cities.reduce((sum, c) => sum + c.gap, 0),
  },
  cities,
});

console.log(
  `Queue built: ${cities.length} targets across ${new Set(cities.map((c) => c.stateCode)).size} states; ` +
    `${cities.filter((c) => c.gap > 0).length} markets under density floor; ` +
    `${cities.reduce((sum, c) => sum + c.gap, 0)} restaurants needed to close all floors.`,
);
