/**
 * What a stored `menuUrl` actually points at.
 *
 * The corpus holds a menu link for 1,031 of 1,527 rooms. 56 of those links are
 * not on the restaurant's own domain, and 27 of them are not menus at all: an
 * LA Times review of Rossoblu, five Esquire round-ups, two Robb Report pieces,
 * a Washington Post guide, a Cleveland Magazine readers' poll. The JSON-LD
 * layer already refused to publish those as `hasMenu`. The record pages did
 * not, and went on offering a newspaper review to a human being under the word
 * "Menu" — the same broken first-party claim, in the place people actually read.
 *
 * One classifier, used by the pages, by the structured data and by the pipeline
 * that writes the field, so the three cannot drift apart again.
 */

import hosts from "@/data/menu-hosts.json";

/** example.com from https://www.example.com/menu. Null when it will not parse. */
export function registrableDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parts = new URL(url).hostname.toLowerCase().replace(/^www\./, "").split(".");
    return parts.length >= 2 ? parts.slice(-2).join(".") : parts.join(".");
  } catch {
    return null;
  }
}

/** The full host, for naming where a link goes. */
export function linkHost(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * The two host lists live in src/data/menu-hosts.json, not here, because
 * scripts/pipeline/menu-url.mjs enforces the same rule when the field is
 * written and a second copy of a list is a drift bug with a long fuse.
 *
 * `firstPartyMenuHosts` are ordering and menu platforms a restaurant controls
 * its own page on: a menu hosted there is still the restaurant speaking, which
 * is why they are the only off-domain hosts allowed to fill the menu slot.
 * Scraped menu directories are deliberately absent — menus.fyi, qmenu.us and
 * their kind republish a menu nobody at the restaurant approved, and staleness
 * there is invisible.
 *
 * `publisherHosts` are not a gate. The gate is the rule above, and an unlisted
 * publisher still fails it. That list exists only so a link the corpus already
 * holds can be filed as what it is.
 */
export const FIRST_PARTY_MENU_HOSTS: ReadonlySet<string> = new Set(hosts.firstPartyMenuHosts);
export const PUBLISHER_HOSTS: ReadonlySet<string> = new Set(hosts.publisherHosts);

export type MenuLinkKind =
  /** On the restaurant's own domain. */
  | "own"
  /** On an ordering platform the restaurant controls its page on. */
  | "platform"
  /** A publisher writing about the restaurant. Never a menu. */
  | "press"
  /** Somewhere else entirely. Shown, but named, never claimed. */
  | "offsite";

export type MenuLinkRead = {
  url: string;
  kind: MenuLinkKind;
  host: string;
  /** True only when the link may fill the menu slot. */
  isMenu: boolean;
  /** What to call it on screen. */
  label: string;
};

function httpUrl(value: string | null | undefined): string | null {
  const text = String(value ?? "").trim();
  if (!/^https?:\/\//i.test(text)) return null;
  try {
    return new URL(text).toString();
  } catch {
    return null;
  }
}

/**
 * Read a stored menu link against the restaurant's own website.
 *
 * Returns null when there is nothing to read. Never throws, never guesses:
 * anything it cannot place is `offsite`, which the interface names rather than
 * dresses up.
 */
export function readMenuLink(
  menuUrl: string | null | undefined,
  website: string | null | undefined,
): MenuLinkRead | null {
  const url = httpUrl(menuUrl);
  if (!url) return null;
  const host = linkHost(url) ?? "";
  const menuDomain = registrableDomain(url);
  if (!menuDomain) return null;

  const siteDomain = registrableDomain(httpUrl(website));
  if (siteDomain && siteDomain === menuDomain) {
    return { url, kind: "own", host, isMenu: true, label: "Menu" };
  }
  if (FIRST_PARTY_MENU_HOSTS.has(menuDomain)) {
    return { url, kind: "platform", host, isMenu: true, label: "Menu" };
  }
  if (PUBLISHER_HOSTS.has(menuDomain)) {
    return { url, kind: "press", host, isMenu: false, label: `Press coverage · ${host}` };
  }
  return { url, kind: "offsite", host, isMenu: false, label: `Menu, off-site · ${host}` };
}

/** The link, only when it may be presented as the restaurant's own menu. */
export function firstPartyMenuUrl(
  menuUrl: string | null | undefined,
  website: string | null | undefined,
): string | undefined {
  const read = readMenuLink(menuUrl, website);
  return read && (read.kind === "own" || read.kind === "platform") ? read.url : undefined;
}
