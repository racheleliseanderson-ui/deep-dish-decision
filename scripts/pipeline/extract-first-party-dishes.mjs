#!/usr/bin/env node
/**
 * Incrementally promote clearly named dishes from owned-site evidence into the
 * small first-party dish index used by the live layer and database search.
 *
 * This is deliberately conservative. Existing verified dish names are kept;
 * new names are added only when the restaurant's own dataset prose or captured
 * owned-site language names the item. Ambiguous cuisine/experience language is
 * rejected rather than guessed.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (path) => JSON.parse(readFileSync(join(root, path), "utf8"));
const write = (path, value) =>
  writeFileSync(join(root, path), `${JSON.stringify(value, null, 2)}\n`, "utf8");

const dataset = read("src/data/dataset.json");
const enrichment = read("src/data/enrichment.json").records ?? {};
let existing = { records: {} };
try {
  existing = read("src/data/first-party-dishes.json");
} catch {
  /* first build */
}

function quoteTexts(site, ...keys) {
  const out = [];
  for (const key of keys) {
    for (const item of site?.[key] ?? []) {
      if (typeof item === "string") out.push(item);
      else if (item && typeof item === "object") out.push(String(item.quote ?? ""));
    }
  }
  return out.filter((value) => value.trim());
}

const CAPTURE_PATTERNS = [
  /(?:signature dish(?:es)?(?: is| are)?|known for|famous for|house specialty(?: is)?)\s+([^.;:]{3,80})/gi,
  /signature dishes include\s+([^.;]{8,110})/gi,
];

const EXACT_PATTERNS = [
  /\bfried chicken\b/gi,
  /\bchicken and waffles\b/gi,
  /\bburnt ends\b/gi,
  /\bturtle soup\b/gi,
  /\bbread pudding souffl[eé]\b/gi,
  /\bhand-made pasta\b/gi,
  /\bhandmade pasta\b/gi,
  /\bhouse-made pasta\b/gi,
  /\bhouse-made breads and pastas\b/gi,
  /\bbrick-oven pizza\b/gi,
  /\bgriyo\b/gi,
  /\btwice[- ]cooked pork\b/gi,
  /\bz-man sandwich\b/gi,
  /\bhush puppies\b/gi,
];

const SKIP =
  /goldbelly|nationwide|located in|all our locations|storytelling|dining experience|tasting menu|five-course|six-course|wine program|private dining|hospitalit|globally inspired|crafted cocktails|sunday brunch|made-from-scratch fare|cuisine rooted|seasonal menu|sourced from|farms|foragers|winemakers|preservation|not stated/i;

function clean(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .replace(/^like\s+/i, "")
    .replace(/^[\s,;:.-]+|[\s,;:.-]+$/g, "")
    .trim();
}

function findDishes(record, site) {
  const blob = [
    record.cuisineContext ?? "",
    record.menuSummary ?? "",
    record.beverageDetails ?? "",
    ...quoteTexts(site, "cuisineLanguage", "jsonLdLanguage"),
  ].join(" ");

  const found = [];
  for (const pattern of CAPTURE_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of blob.matchAll(pattern)) {
      const value = clean(match[1]);
      if (value.length >= 4 && value.length <= 80 && !SKIP.test(value)) found.push(value);
    }
  }
  for (const pattern of EXACT_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of blob.matchAll(pattern)) {
      const value = clean(match[0]);
      if (!SKIP.test(value)) found.push(value);
    }
  }

  const seen = new Set();
  return found
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 6);
}

const records = { ...(existing.records ?? {}) };
let addedRestaurants = 0;
let addedDishes = 0;

for (const record of dataset.records ?? []) {
  const site = enrichment[record.slug]?.site ?? {};
  const extracted = findDishes(record, site);
  if (!extracted.length) continue;

  const prior = Array.isArray(records[record.slug]) ? records[record.slug] : [];
  const seen = new Set(prior.map((value) => String(value).toLowerCase()));
  const merged = [...prior];
  for (const dish of extracted) {
    if (seen.has(dish.toLowerCase())) continue;
    seen.add(dish.toLowerCase());
    merged.push(dish);
    addedDishes += 1;
  }
  if (!prior.length && merged.length) addedRestaurants += 1;
  records[record.slug] = merged.slice(0, 6);
}

write("src/data/first-party-dishes.json", {
  generatedAt: new Date().toISOString(),
  note: "Named only where the restaurant's own pages or owned-site quotes mention the item. Existing verified names are preserved; ambiguous cuisine language is never promoted as a dish.",
  records,
});

console.log(
  `first-party dishes: ${Object.keys(records).length} restaurants; +${addedRestaurants} restaurants, +${addedDishes} dish names this pass`,
);
