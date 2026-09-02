#!/usr/bin/env node
/**
 * slug -> region group, so a page can find one record without the corpus.
 *
 * /record/:slug, /packet/:slug and /shortlist all did
 * `const { bySlug } = await import("@/lib/dataset")`, which pulls the whole
 * 6.6 MB corpus (a 5.4 MB client chunk) to look up a record by key. On the
 * first hit that runs during SSR and costs the browser nothing — but on
 * client-side navigation, which is the normal path (browse the list, tap a
 * restaurant), the loader runs in the browser and fetches all of it.
 *
 * The per-region split already exists in src/data/by-region/. All that was
 * missing was knowing which region a slug is in without reading everything.
 * That is this file: ~40 bytes a record instead of 5.4 MB.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

// Mirrors regionGroupFileName in src/lib/corpus-meta.ts.
const fileNameFor = (group) =>
  String(group ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const records = JSON.parse(readFileSync(join(root, "src/data/dataset.json"), "utf8")).records;

const groups = [];
const groupIndex = new Map();
const slugs = {};
for (const r of records) {
  const file = fileNameFor(r.regionGroup || r.region);
  if (!groupIndex.has(file)) {
    groupIndex.set(file, groups.length);
    groups.push(file);
  }
  slugs[r.slug] = groupIndex.get(file);
}

const body = JSON.stringify({ groups, slugs });
writeFileSync(join(root, "src/data/slug-index.json"), body);
console.log(
  `slug index -> src/data/slug-index.json (${(body.length / 1024).toFixed(0)} KB, ` +
    `${Object.keys(slugs).length} records across ${groups.length} groups)`,
);
