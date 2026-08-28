/**
 * The sitemap is derived from the working set, not maintained by hand.
 *
 * The thirty evidence files are the pages with real search intent behind them
 * — someone looking for a specific room's cancellation window or step-free
 * route — and they were the pages the hand-written sitemap left out. A
 * generated list cannot drift from the data; `sitemap.test.ts` fails the build
 * if the committed file falls behind.
 */
import { absoluteUrl } from "./seo.ts";

/** Pages that exist independently of anything stored on a visitor's device. */
export const STATIC_PATHS = ["/", "/night", "/guide", "/nights", "/compare"] as const;

export function sitemapPaths(slugs: readonly string[]): string[] {
  return [...STATIC_PATHS, ...[...slugs].sort().map((slug) => `/record/${slug}`)];
}

export function buildSitemap(slugs: readonly string[]): string {
  const urls = sitemapPaths(slugs)
    .map((path) => `  <url><loc>${absoluteUrl(path)}</loc></url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
