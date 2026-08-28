/**
 * Regenerates public/sitemap.xml from the working set.
 *
 *   node --experimental-strip-types scripts/build-sitemap.mjs
 *
 * Run it after adding or removing a record. `npm test` fails if the committed
 * sitemap does not match what this would write.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { restaurants } = await import(join(root, "src/data/restaurants.ts"));
const { buildSitemap } = await import(join(root, "src/lib/sitemap.ts"));

const target = join(root, "public/sitemap.xml");
writeFileSync(target, buildSitemap(restaurants.map((r) => r.slug)));
console.log(`wrote ${target} — ${restaurants.length} records + static pages`);
