#!/usr/bin/env node
/**
 * Build the Deep Dish sitemaps.
 *
 * The corpus is ~1,500 records and grows on a schedule, so the record pages —
 * by far the most of what this site publishes — cannot be maintained by hand.
 * They were not in the sitemap at all, which left every restaurant file
 * discoverable only by crawling the Atlas.
 *
 * Output is a sitemap index rather than one flat file. 1,500 URLs would fit in
 * a single sitemap (the protocol allows 50,000 and 50 MB), but the corpus is on
 * a growth path and an index costs nothing today and avoids a rewrite later.
 *
 * Booking packets are deliberately absent: a packet is a print rendering of the
 * record it belongs to, and asking search engines to index both halves of the
 * same evidence is how a site competes with itself.
 *
 * Runs as part of `prebuild` and `predev`; the output is committed so a plain
 * `vite build` still ships a current sitemap.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(root, "public");
const ORIGIN = "https://deepdish.saltnotes.blog";

/** Well under the 50,000 protocol limit, so a file stays openable by a human. */
const PER_FILE = 5000;

const STATIC_ROUTES = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/guide", changefreq: "monthly", priority: "0.9" },
  { path: "/atlas", changefreq: "weekly", priority: "0.8" },
  { path: "/console", changefreq: "weekly", priority: "0.5" },
  { path: "/shortlist", changefreq: "monthly", priority: "0.4" },
];

const today = new Date().toISOString().slice(0, 10);

function isoDate(value) {
  const text = String(value ?? "")
    .trim()
    .slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : today;
}

/** XML text escaping. Slugs are ASCII today; ampersands are not worth a gamble. */
function xml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function urlset(entries) {
  const body = entries
    .map((entry) => {
      const parts = [`    <loc>${xml(ORIGIN + entry.path)}</loc>`];
      if (entry.lastmod) parts.push(`    <lastmod>${entry.lastmod}</lastmod>`);
      if (entry.changefreq) parts.push(`    <changefreq>${entry.changefreq}</changefreq>`);
      if (entry.priority) parts.push(`    <priority>${entry.priority}</priority>`);
      return `  <url>\n${parts.join("\n")}\n  </url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

function sitemapIndex(files) {
  const body = files
    .map(
      (file) =>
        `  <sitemap>\n    <loc>${xml(`${ORIGIN}/${file.name}`)}</loc>\n    <lastmod>${file.lastmod}</lastmod>\n  </sitemap>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>\n`;
}

const dataset = JSON.parse(readFileSync(join(root, "src/data/dataset.json"), "utf8"));
const records = Array.isArray(dataset.records) ? dataset.records : [];

const seen = new Set();
const recordEntries = [];
for (const record of records) {
  const slug = String(record?.slug ?? "").trim();
  if (!slug || seen.has(slug)) continue;
  seen.add(slug);
  recordEntries.push({
    path: `/record/${encodeURIComponent(slug)}`,
    lastmod: isoDate(record.reviewedAt),
    changefreq: "monthly",
    priority: "0.7",
  });
}
recordEntries.sort((a, b) => a.path.localeCompare(b.path));

mkdirSync(publicDir, { recursive: true });

const written = [];

writeFileSync(
  join(publicDir, "sitemap-static.xml"),
  urlset(STATIC_ROUTES.map((route) => ({ ...route, lastmod: today }))),
);
written.push({ name: "sitemap-static.xml", lastmod: today });

for (let i = 0; i < recordEntries.length; i += PER_FILE) {
  const chunk = recordEntries.slice(i, i + PER_FILE);
  const name = `sitemap-records-${Math.floor(i / PER_FILE) + 1}.xml`;
  writeFileSync(join(publicDir, name), urlset(chunk));
  const newest = chunk.reduce((acc, row) => (row.lastmod > acc ? row.lastmod : acc), "0000-00-00");
  written.push({ name, lastmod: newest === "0000-00-00" ? today : newest });
}

writeFileSync(join(publicDir, "sitemap.xml"), sitemapIndex(written));

console.log(
  `sitemaps: ${written.length} file(s), ${STATIC_ROUTES.length} static + ${recordEntries.length} record URLs`,
);
