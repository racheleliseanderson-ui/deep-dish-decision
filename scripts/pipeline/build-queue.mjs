/**
 * Builds src/data/expansion-queue.json: prioritized metros first, then a
 * per-state floor so coverage cannot stay coastal. Re-running preserves the
 * status and quota settings of cities already in the queue.
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
];

const existing = readJson(PATHS.queue, null);
const prior = new Map((existing?.cities ?? []).map((c) => [`${c.city}|${c.stateCode}`, c]));

const cities = METROS.map(([city, stateCode, population], i) => {
  const key = `${city}|${stateCode}`;
  const before = prior.get(key);
  return {
    city,
    stateCode,
    population,
    priority: i + 1,
    tier: i < 50 ? "top-50-metro" : "state-floor",
    status: before?.status ?? "pending",
    pinned: before?.pinned ?? false,
    inserted: before?.inserted ?? 0,
    lastRunAt: before?.lastRunAt ?? null,
    note: before?.note ?? "",
  };
});

// Every US state + DC must appear at least once before any statewide fill.
const covered = new Set(cities.map((c) => c.stateCode));
const missing = Object.entries(STATES)
  .filter(([, v]) => !covered.has(v.code))
  .sort((a, b) => b[1].population - a[1].population);

let priority = cities.length;
for (const [name, meta] of missing) {
  priority += 1;
  const key = `${name}|${meta.code}`;
  const before = prior.get(key);
  cities.push({
    city: name,
    stateCode: meta.code,
    population: meta.population,
    priority,
    tier: "state-floor",
    status: before?.status ?? "pending",
    pinned: before?.pinned ?? false,
    inserted: before?.inserted ?? 0,
    lastRunAt: before?.lastRunAt ?? null,
    note: "Statewide seed — no metro in the top list covers this state.",
  });
}

for (const [city, stateCode, population] of STATEWIDE_FILL) {
  const key = `${city}|${stateCode}`;
  if (cities.some((c) => `${c.city}|${c.stateCode}` === key)) continue;
  const before = prior.get(key);
  priority += 1;
  cities.push({
    city,
    stateCode,
    population,
    priority,
    tier: "statewide-fill",
    status: before?.status ?? "pending",
    pinned: before?.pinned ?? false,
    inserted: before?.inserted ?? 0,
    lastRunAt: before?.lastRunAt ?? null,
    note: before?.note ?? "Statewide fill of a mid-size city after the state floor.",
  });
}

writeJson(PATHS.queue, {
  generatedAt: new Date().toISOString(),
  settings: existing?.settings ?? {
    paused: false,
    // Controlled starting quota. Raise only after reviewing a run's quality.
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
  },
  order: [
    "Top 50 US metros by population",
    "Remaining metros over 500k",
    "State floor: every state + DC seeded before statewide fill",
    "Statewide fill of mid-size cities",
  ],
  cities,
});

console.log(
  `Queue built: ${cities.length} targets across ${new Set(cities.map((c) => c.stateCode)).size} states.`,
);
