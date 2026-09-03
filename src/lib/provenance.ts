/**
 * Provenance — which page a record was read off, and when.
 *
 * Aggregate-review products can tell you how a room made four hundred people
 * feel. They cannot tell you that a sentence came off a restaurant's own
 * contact page on 5 August 2026, because they never read the page as a page.
 * We did, and we wrote down the date. This module is the arithmetic behind
 * saying that out loud: which host, how many pages, how long ago, and how many
 * things the restaurant has still never put in writing.
 *
 * It computes; it does not phrase. A card in a ranked list and the header of a
 * dossier are not the same room, so each surface writes its own sentence and
 * this file stays out of it. The one exception is `standingLine`, which
 * translates a stored enum nobody outside the pipeline should have to read.
 */
import type { RestaurantRecord } from "@/lib/dataset";

const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const MONTHS_SHORT = MONTHS_LONG.map((m) => (m.length > 4 ? m.slice(0, 3) : m));

/**
 * Hosts that are somebody else's software. A record whose only source is one
 * of these was still read first-hand, but calling it "the restaurant's own
 * page" would be a lie of one word, so the surfaces say where they actually
 * landed instead.
 */
const PLATFORM_HOSTS = new Set([
  "facebook.com",
  "instagram.com",
  "m.facebook.com",
  "business.site",
  "toasttab.com",
  "resy.com",
  "opentable.com",
  "exploretock.com",
  "tock.com",
  "sevenrooms.com",
  "yelp.com",
  "doordash.com",
  "ubereats.com",
  "grubhub.com",
  "square.site",
  "clover.com",
  "google.com",
  "sites.google.com",
  "linktr.ee",
]);

export type FreshnessBand = "recent" | "settled" | "aging" | "unknown";

export type Provenance = {
  /** The page we treat as the record's front door. Always present in the corpus. */
  primaryUrl: string | null;
  /** That page's host, `www.` removed — short enough to print as link text. */
  primaryHost: string | null;
  /** True when the front door is somebody else's platform, not a site of their own. */
  primaryIsPlatform: boolean;
  /** Every distinct page read for this record, front door first. */
  pages: string[];
  pageCount: number;
  /** Pages sitting on the same host as the front door. */
  ownPageCount: number;
  /** Distinct hosts we read that are not the front door's. */
  otherHosts: string[];
  readIso: string | null;
  /** "5 August 2026" */
  readLong: string | null;
  /** "5 Aug 2026" */
  readShort: string | null;
  ageDays: number | null;
  band: FreshnessBand;
  unknownCount: number;
  unknowns: string[];
  /** `freshnessStatus`, in English. Null when the enum is one we do not know. */
  standing: string | null;
  /** The restaurant's own review flag — true when the read is past its date. */
  dueSoon: boolean;
};

export function hostLabel(url: string | null | undefined): string | null {
  const raw = String(url ?? "").trim();
  if (!raw) return null;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    return host.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

export function isPlatformHost(host: string | null | undefined): boolean {
  const h = String(host ?? "")
    .toLowerCase()
    .replace(/^www\./, "");
  if (!h) return false;
  return PLATFORM_HOSTS.has(h);
}

function toDate(iso: string | null | undefined): Date | null {
  const raw = String(iso ?? "").trim();
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Deterministic, UTC, no locale in the middle of it. */
export function readDate(
  iso: string | null | undefined,
  style: "long" | "short" = "long",
): string | null {
  const d = toDate(iso);
  if (!d) return null;
  const month = (style === "long" ? MONTHS_LONG : MONTHS_SHORT)[d.getUTCMonth()];
  if (!month) return null;
  return `${d.getUTCDate()} ${month} ${d.getUTCFullYear()}`;
}

export function daysSince(iso: string | null | undefined, now: Date = new Date()): number | null {
  const d = toDate(iso);
  if (!d) return null;
  const days = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  return days < 0 ? 0 : days;
}

/**
 * Where the thresholds come from: a restaurant can change its hours on a
 * Tuesday, so no read is ever "verified". Six weeks is roughly the point at
 * which a seasonal menu has turned over; five months is the point at which
 * price lines stop being worth quoting to anyone.
 */
export function freshnessBand(days: number | null): FreshnessBand {
  if (days == null) return "unknown";
  if (days <= 45) return "recent";
  if (days <= 150) return "settled";
  return "aging";
}

const STANDING: Record<string, string> = {
  OWNED_SITE_REVIEWED: "Read off a site the restaurant runs itself.",
  CURRENT_AS_RETRIEVED: "Every field below matched the pages on the day they were read.",
  CURRENT_WITH_OFFICIAL_CONFLICTS:
    "Two of the restaurant's own pages disagree. Both claims are kept; neither is quietly dropped.",
  SOURCE_LIMITED_OPERATOR_PLATFORM:
    "No site of their own turned up — this was read off the platform they post on.",
  AWAITING_FIRST_PARTY_REVIEW:
    "A directory listing, not a first-party read. It has not been through review yet.",
};

export function standingLine(status: string | null | undefined): string | null {
  const key = String(status ?? "").trim();
  return key ? (STANDING[key] ?? null) : null;
}

/** How many pages, said in words, for a sentence that cannot take a numeral. */
export function pageWord(count: number): string {
  const words = ["no", "one", "two", "three", "four", "five", "six"];
  return words[count] ?? String(count);
}

export function provenanceOf(
  record: Pick<
    RestaurantRecord,
    | "officialSource"
    | "website"
    | "sources"
    | "retrievedAt"
    | "unknownsCount"
    | "unknownList"
    | "freshnessStatus"
    | "reviewDueSoon"
  >,
  now: Date = new Date(),
): Provenance {
  const listed = (record.sources ?? []).map((s) => String(s).trim()).filter(Boolean);
  const primaryUrl =
    String(record.officialSource ?? "").trim() || listed[0] || String(record.website ?? "").trim();
  const primaryHost = hostLabel(primaryUrl);
  const ordered = [primaryUrl, ...listed].filter(Boolean);
  const pages = ordered.filter((url, i) => ordered.indexOf(url) === i);
  const hosts = pages.map((p) => hostLabel(p));
  const ownPageCount = primaryHost ? hosts.filter((h) => h === primaryHost).length : 0;
  const otherHosts = hosts.filter(
    (h, i): h is string => Boolean(h) && h !== primaryHost && hosts.indexOf(h) === i,
  );
  const readIso = String(record.retrievedAt ?? "").trim() || null;
  const ageDays = daysSince(readIso, now);
  const unknowns = (record.unknownList ?? []).map((u) => String(u).trim()).filter(Boolean);

  return {
    primaryUrl: primaryUrl || null,
    primaryHost,
    primaryIsPlatform: isPlatformHost(primaryHost),
    pages,
    pageCount: pages.length,
    ownPageCount,
    otherHosts,
    readIso,
    readLong: readDate(readIso, "long"),
    readShort: readDate(readIso, "short"),
    ageDays,
    band: freshnessBand(ageDays),
    unknownCount: Number(record.unknownsCount ?? unknowns.length) || unknowns.length,
    unknowns,
    standing: standingLine(record.freshnessStatus),
    dueSoon: Boolean(record.reviewDueSoon),
  };
}
