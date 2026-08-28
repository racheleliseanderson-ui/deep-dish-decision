/**
 * Canonical URLs and indexing rules.
 *
 * Every public page states its own canonical. A single site-wide canonical
 * pointing at "/" is worse than none at all: it tells a crawler that the
 * method page, the ranking page and all thirty evidence files are duplicates
 * of the home page, and they drop out of the index.
 *
 * The working pages — a confirmation pass, a saved packet — carry a person's
 * reservation details and belong to whoever made them. They are never
 * indexed.
 */
export const SITE_URL = "https://deepdish.saltnotes.blog";

/** Absolute URL for a site-root-relative path. */
export function absoluteUrl(path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return clean === "/" ? `${SITE_URL}/` : `${SITE_URL}${clean}`;
}

/** `links` entry declaring this page's canonical address. */
export function canonical(path: string) {
  return { rel: "canonical", href: absoluteUrl(path) } as const;
}

/**
 * `meta` entry for a page that must not be indexed. `follow` is kept so the
 * links out of the page still pass to the public pages they point at.
 */
export const NOINDEX = { name: "robots", content: "noindex, follow" } as const;
