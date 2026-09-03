/**
 * Structured data for Deep Dish.
 *
 * The rule this file exists to enforce: emit a field only when the corpus
 * actually holds it. Every record carries a "not stated" floor sentence in any
 * slot the restaurant left empty, so a naive mapping would publish our own
 * placeholder prose as if the restaurant had said it. `isUnstated` is the gate.
 *
 * There is deliberately no `aggregateRating` and no `review`. Deep Dish refuses
 * star ratings on the page; emitting one here would be the same lie, only in a
 * format search engines quote back verbatim.
 */
import { isUnstated } from "@/lib/case-depth";
import type { RestaurantRecord } from "@/lib/dataset";
import { SITE_ORIGIN, canonicalFor } from "@/lib/site";

export const PUBLISHER_NAME = "Salty & Clever";
export const PUBLISHER_URL = "https://saltnotes.blog";
export const APP_NAME = "Deep Dish";

type Json = Record<string, unknown>;

/** Drops keys whose value is empty, so no field is ever emitted as a blank. */
function compact(input: Json): Json {
  const out: Json = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && !value.trim()) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0) {
      continue;
    }
    out[key] = value;
  }
  return out;
}

/** A stated string, or undefined. The floor sentence never survives this. */
function stated(value: string | null | undefined): string | undefined {
  if (isUnstated(value)) return undefined;
  const text = String(value).trim();
  return text || undefined;
}

/** An absolute http(s) URL, or undefined. Relative and mailto values are dropped. */
function httpUrl(value: string | null | undefined): string | undefined {
  const text = String(value ?? "").trim();
  if (!/^https?:\/\//i.test(text)) return undefined;
  try {
    return new URL(text).toString();
  } catch {
    return undefined;
  }
}

export const ORGANIZATION: Json = {
  "@type": "Organization",
  "@id": `${PUBLISHER_URL}/#organization`,
  name: PUBLISHER_NAME,
  url: PUBLISHER_URL,
  description:
    "Food, drink and hosting writing, plus the tools that come out of it: Kitchen & Bar, Occasion OS and Deep Dish.",
};

export const WEBSITE: Json = {
  "@type": "WebSite",
  "@id": `${SITE_ORIGIN}/#website`,
  name: APP_NAME,
  alternateName: "Deep Dish restaurant intelligence",
  url: `${SITE_ORIGIN}/`,
  inLanguage: "en-US",
  publisher: { "@id": `${PUBLISHER_URL}/#organization` },
};

/** WebSite + Organization, emitted once from the root on every page. */
export const SITE_GRAPH: Json = {
  "@context": "https://schema.org",
  "@graph": [WEBSITE, ORGANIZATION],
};

/**
 * A crumb trail. Home is always the first item, so callers pass only the tail.
 * Schema.org wants a position on every element and an absolute item URL.
 */
export function breadcrumbs(trail: { name: string; path: string }[]): Json | null {
  if (trail.length === 0) return null;
  const rows = [{ name: APP_NAME, path: "/" }, ...trail];
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: rows.map((row, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: row.name,
      item: canonicalFor(row.path),
    })),
  };
}

/** Canada is the only non-US region group in the corpus. */
function countryFor(stateProvince: string): string {
  return stateProvince === "British Columbia" ? "CA" : "US";
}

function postalAddress(record: RestaurantRecord): Json | undefined {
  const raw = String(record.address ?? "").trim();
  const locality = String(record.city ?? "").trim();
  const region = String(record.stateProvince ?? "").trim();
  if (!raw && !locality) return undefined;

  const address: Json = {
    "@type": "PostalAddress",
    addressLocality: locality || undefined,
    addressRegion: region || undefined,
    addressCountry: region ? countryFor(region) : undefined,
  };

  if (raw) {
    // "2576 Aurora Ave N, Seattle, WA 98109" — the street is what comes before
    // the first comma; anything else in the string is already carried by the
    // city and state fields, so it is not repeated.
    const street = raw.split(",")[0]?.trim();
    if (street && street !== locality) address["streetAddress"] = street;
    const postal = /\b(\d{5}(?:-\d{4})?|[A-Z]\d[A-Z] ?\d[A-Z]\d)\s*$/i.exec(raw);
    if (postal?.[1]) address["postalCode"] = postal[1].toUpperCase();
  }

  const filled = compact(address);
  // "@type" alone is not an address.
  return Object.keys(filled).length > 1 ? filled : undefined;
}

/**
 * Only a real band of dollar signs. The corpus also stores planning-band prose
 * ("Premium planning band", "Conflicting official price") in the same array,
 * and `priceRange` is not the place for our editorial shorthand.
 */
function priceRange(record: RestaurantRecord): string | undefined {
  const candidates = [...(record.priceTags ?? []), ...(record.spendBands ?? [])];
  return candidates.find((tag) => /^\$+$/.test(String(tag).trim()))?.trim();
}

/**
 * Tags in `cuisineTags` that describe the room, the format or the time of day
 * rather than what is cooked. `servesCuisine` means the cuisine; telling a
 * search engine that Canlis serves "Wine-forward" is not a cuisine claim, it is
 * a category error. Everything not listed here passes through.
 */
const NOT_A_CUISINE = new Set(
  [
    "fine dining",
    "tasting menu",
    "prix fixe",
    "omakase",
    "small plates",
    "raw bar",
    "oyster bar",
    "cocktail / lounge",
    "cocktail bar",
    "cocktails",
    "wine",
    "wine bar",
    "wine-forward",
    "sake bar",
    "listening bar",
    "sports bar",
    "bar",
    "beer hall",
    "supper club",
    "jazz supper club",
    "all-day cafe",
    "seasonal",
    "seasonal / market",
    "market",
    "contemporary",
    "modern",
    "casual",
    "creative",
    "eclectic",
    "global",
    "fusion",
    "farm-to-table",
    "farm to table",
    "sustainable",
    "nose-to-tail",
    "live fire",
    "wood-fired",
    "hearth",
    "robata",
    "grill",
    "breakfast",
    "breakfast / brunch",
    "comfort food",
    "street food",
    "neighborhood",
    "waterfront",
    "butcher shop",
    "live music",
    "tiki",
    "tea",
  ].map((tag) => tag.toLowerCase()),
);

/** The cuisines the corpus actually names, in the order it names them. */
export function cuisineList(record: RestaurantRecord): string[] {
  const tags = (record.cuisineTags ?? [])
    .map((tag) => String(tag).trim())
    .filter(Boolean)
    .filter((tag) => !NOT_A_CUISINE.has(tag.toLowerCase()));
  return Array.from(new Set(tags)).slice(0, 6);
}

/** example.com from https://www.example.com/menu. Null when it will not parse. */
function registrableDomain(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parts = new URL(url).hostname.toLowerCase().replace(/^www\./, "").split(".");
    return parts.length >= 2 ? parts.slice(-2).join(".") : parts.join(".");
  } catch {
    return null;
  }
}

/**
 * Ordering platforms that host a restaurant's own menu under its own control.
 * A menu on one of these is still the restaurant speaking.
 */
const FIRST_PARTY_MENU_HOSTS = new Set([
  "toasttab.com",
  "toast.site",
  "popmenu.com",
  "square.site",
  "squareup.com",
  "clover.com",
  "spoton.com",
  "chownow.com",
  "olo.com",
  "bentobox.com",
  "getbento.com",
  "ubereats.com",
  "doordash.com",
  "grubhub.com",
  "ritual.co",
  "orderexperience.net",
]);

/**
 * `hasMenu` only when the link is the restaurant's own menu.
 *
 * 63 records store something else in `menuUrl` — an Esquire piece, an LA Times
 * review, a city magazine round-up. Those are third-party writing about the
 * restaurant, and this product's whole claim is first-party evidence. Publishing
 * a newspaper review as a machine-readable menu would break that claim in the
 * one format nobody reads before trusting.
 */
function firstPartyMenu(menu: string | undefined, website: string | undefined): string | undefined {
  if (!menu) return undefined;
  const menuDomain = registrableDomain(menu);
  if (!menuDomain) return undefined;
  if (FIRST_PARTY_MENU_HOSTS.has(menuDomain)) return menu;
  const siteDomain = registrableDomain(website);
  return siteDomain && siteDomain === menuDomain ? menu : undefined;
}

/**
 * The Restaurant entity for one record page.
 *
 * Hours are never emitted. The corpus holds hours as prose ("Dinner is served
 * Tuesday through Saturday evenings beginning at 5 PM"), and `openingHours`
 * wants a machine schedule. Turning one into the other is guessing, and a
 * wrong opening time is exactly the failure this product exists to prevent.
 */
export function restaurantJsonLd(record: RestaurantRecord): Json | null {
  const pageUrl = canonicalFor(`/record/${record.slug}`);
  const website = httpUrl(record.website);
  const menu = firstPartyMenu(httpUrl(record.menuUrl), website);
  const reservations = httpUrl(record.reservationUrl);

  // `sameAs` is for pages that unambiguously identify the same restaurant. A
  // booking page qualifies; the home page is already `url`, so it is dropped.
  const sameAs = Array.from(
    new Set([menu, reservations].filter((u): u is string => Boolean(u))),
  ).filter((u) => u !== website);

  const entity = compact({
    "@type": "Restaurant",
    "@id": `${pageUrl}#restaurant`,
    name: String(record.title ?? "").trim(),
    url: website,
    mainEntityOfPage: pageUrl,
    description: stated(record.cuisineContext) ?? stated(record.serviceSummary),
    address: postalAddress(record),
    telephone: String(record.phone ?? "").trim() || undefined,
    email: String(record.email ?? "").trim() || undefined,
    servesCuisine: cuisineList(record),
    hasMenu: menu,
    acceptsReservations: reservations ?? undefined,
    priceRange: priceRange(record),
    areaServed: stated(record.coverageArea),
    sameAs: sameAs.length ? sameAs : undefined,
  });

  // A name and nothing else is a stub, not an entity. Require the name plus at
  // least one fact a reader could act on.
  if (!entity["name"]) return null;
  const substantive = ["address", "telephone", "url", "hasMenu", "acceptsReservations"].some(
    (key) => key in entity,
  );
  if (!substantive) return null;

  return { "@context": "https://schema.org", ...entity };
}
