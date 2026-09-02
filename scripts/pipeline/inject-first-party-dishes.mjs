#!/usr/bin/env node
/**
 * Normalize the first-party dish file into the generated live layer.
 *
 * `first-party-dishes.json` is intentionally shaped as `{ records: { slug: [] } }`
 * because the application imports it that way. The older live-index builder
 * predates that envelope and therefore misses those names. Keep the public data
 * contract stable and repair the generated live files after their normal build.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (path) => JSON.parse(readFileSync(join(root, path), "utf8"));
const dishFile = read("src/data/first-party-dishes.json");
const firstParty = dishFile.records ?? {};
const liveDir = join(root, "src", "data", "live");

let restaurants = 0;
let dishes = 0;

for (const file of readdirSync(liveDir)) {
  if (!file.endsWith(".json") || file === "index.json") continue;
  const path = join(liveDir, file);
  const payload = JSON.parse(readFileSync(path, "utf8"));
  const records = payload.records ?? {};
  let changed = false;

  for (const [slug, names] of Object.entries(firstParty)) {
    if (!records[slug] || !Array.isArray(names) || !names.length) continue;
    const prior = Array.isArray(records[slug].dishes) ? records[slug].dishes : [];
    const merged = [];
    const seen = new Set();

    // First-party names lead; review-derived names remain available as fallback.
    for (const name of names) {
      const value = String(name).trim();
      const key = value.toLowerCase();
      if (!value || seen.has(key)) continue;
      seen.add(key);
      merged.push({ name: value, source: "first-party" });
    }
    for (const item of prior) {
      const value = String(item?.name ?? "").trim();
      const key = value.toLowerCase();
      if (!value || seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }

    records[slug].dishes = merged.slice(0, 6);
    restaurants += 1;
    dishes += records[slug].dishes.filter((item) => item.source === "first-party").length;
    changed = true;
  }

  if (changed) writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

console.log(`live first-party dishes: ${restaurants} restaurants, ${dishes} named dishes`);
