import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { restaurants } from "../data/restaurants.ts";
import { absoluteUrl } from "./seo.ts";
import { buildSitemap, sitemapPaths, STATIC_PATHS } from "./sitemap.ts";

const committed = readFileSync(new URL("../../public/sitemap.xml", import.meta.url), "utf8");
const slugs = restaurants.map((r) => r.slug);

describe("sitemap", () => {
  it("matches the committed file — run scripts/build-sitemap.mjs after changing the working set", () => {
    assert.equal(committed.replace(/\r\n/g, "\n"), buildSitemap(slugs));
  });

  it("lists every evidence file, not just the static pages", () => {
    const paths = sitemapPaths(slugs);
    assert.equal(paths.length, STATIC_PATHS.length + restaurants.length);
    for (const r of restaurants) assert.ok(paths.includes(`/record/${r.slug}`), `missing ${r.slug}`);
  });

  it("uses absolute URLs — a relative <loc> is ignored by crawlers", () => {
    for (const loc of committed.match(/<loc>([^<]+)<\/loc>/g) ?? []) {
      assert.match(loc, /<loc>https:\/\//, `relative loc: ${loc}`);
    }
  });

  it("keeps robots.txt pointing at the absolute sitemap address", () => {
    const robots = readFileSync(new URL("../../public/robots.txt", import.meta.url), "utf8");
    assert.ok(robots.includes(`Sitemap: ${absoluteUrl("/sitemap.xml")}`), robots);
  });
});
