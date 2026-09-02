/**
 * One definition of what this site's URLs are.
 *
 * The head used to declare a single hardcoded `rel=canonical`, so every route
 * in the application told search engines it was a duplicate of the home page.
 * A canonical tag is a strong signal and Google honours it, which is how a site
 * with real content on several routes ends up with one indexable page.
 *
 * Derived from the path instead. Search strings are dropped: the queries this
 * app puts in the URL are views of a page rather than pages of their own, and
 * keeping them would split one page's standing across near-duplicate URLs.
 * Trailing slashes are stripped so `/x` and `/x/` cannot both be claimed.
 */

export const SITE_ORIGIN = "https://deepdish.saltnotes.blog";

export function canonicalFor(pathname: string): string {
  const path = (pathname || "/").split("?")[0]?.split("#")[0] ?? "/";
  const trimmed = path.length > 1 ? path.replace(/\/+$/, "") : "/";
  return `${SITE_ORIGIN}${trimmed}`;
}
