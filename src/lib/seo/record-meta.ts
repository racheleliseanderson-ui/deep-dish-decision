/**
 * Titles and descriptions for the ~1,500 record and packet pages.
 *
 * These are composed from fields the restaurant actually published, and they
 * have to survive the thin end of the corpus: a listing with a phone number and
 * nothing else must still produce a sentence a person would click, without
 * implying evidence that is not there. Every clause below is gated on
 * `isUnstated`, so a slot holding our own "not stated" floor line contributes
 * nothing.
 */
import { isUnstated } from "@/lib/case-depth";
import type { RestaurantRecord } from "@/lib/dataset";
import { cuisineList } from "@/lib/seo/jsonld";

const TITLE_MAX = 60;
const DESCRIPTION_MAX = 155;

const COUNT_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

function words(n: number): string {
  return COUNT_WORDS[n] ?? String(n);
}

function has(record: RestaurantRecord, key: keyof RestaurantRecord): boolean {
  return !isUnstated(record[key] as string | undefined);
}

/** Oxford-free join: "a", "a and b", "a, b and c". */
function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

function place(record: RestaurantRecord): string {
  const city = String(record.city ?? "").trim();
  if (city) return city;
  const region = String(record.region ?? "").trim();
  return region || "an unlisted city";
}

/**
 * The lead noun.
 *
 * `cuisineList` is the strict one — it exists so `servesCuisine` never claims
 * that a restaurant serves "Wine-forward". A sentence a person reads is looser
 * than a machine-readable cuisine claim, so if the strict list comes back empty
 * the raw tag is still good prose: "Fine dining in Seattle" is true, it just is
 * not a cuisine.
 */
function cuisineLead(record: RestaurantRecord): string | null {
  const strict = cuisineList(record)[0];
  if (strict) return strict;
  const raw = (record.cuisineTags ?? []).map((tag) => String(tag).trim()).filter(Boolean);
  // "Cocktail / lounge in Seattle" is a worse opening than "Fine dining in
  // Seattle" for the same restaurant, and both are in its tag list.
  return raw.find((tag) => !/\b(bar|lounge|cocktails?)\b/i.test(tag)) ?? raw[0] ?? null;
}

export function recordTitle(record: RestaurantRecord): string {
  const name = String(record.title ?? "").trim() || "Restaurant";
  const base = `${name} — ${place(record)}`;
  if (base.length + 12 <= TITLE_MAX) return `${base} · Deep Dish`;
  if (base.length <= TITLE_MAX) return base;
  return `${base.slice(0, TITLE_MAX - 1).trimEnd()}…`;
}

export function packetTitle(record: RestaurantRecord): string {
  const name = String(record.title ?? "").trim() || "Restaurant";
  const base = `${name} — booking packet`;
  if (base.length + 12 <= TITLE_MAX) return `${base} · Deep Dish`;
  if (base.length <= TITLE_MAX) return base;
  return `${base.slice(0, TITLE_MAX - 1).trimEnd()}…`;
}

/** What the restaurant itself put in writing, in the order a host needs it. */
function statedClause(record: RestaurantRecord): string {
  const held: string[] = [];
  if (has(record, "hoursSummary")) held.push("hours");
  if (has(record, "reservationDetails")) held.push("booking");
  if (has(record, "priceDetails")) held.push("price");
  if (held.length === 0) {
    if (has(record, "menuSummary")) return "Only a menu path is published, so far.";
    return "Barely anything is published beyond how to reach the place.";
  }
  if (held.length === 1) return `Only the ${held[0]} is published.`;
  return `${joinList(held).replace(/^./, (c) => c.toUpperCase())} straight off its own pages.`;
}

/** What is still open, which is the part that decides whether you phone ahead. */
function openClause(record: RestaurantRecord): string {
  if (record.hasOfficialConflict) {
    return "Two of its own pages disagree, and the conflict is on the file.";
  }
  const open = Number(record.unknownsCount ?? 0);
  if (open === 1) return "One gap it never fills; ask that before you book.";
  if (open > 1)
    return `${words(open).replace(/^./, (c) => c.toUpperCase())} gaps it never fills; ask those before you book.`;
  return "Nothing was left open at the last read.";
}

export function recordDescription(record: RestaurantRecord): string {
  const cuisine = cuisineLead(record);
  const lead = cuisine
    ? `${cuisine} in ${place(record)}.`
    : `A restaurant file from ${place(record)}.`;
  const full = `${lead} ${statedClause(record)} ${openClause(record)}`;
  if (full.length <= DESCRIPTION_MAX) return full;
  const short = `${lead} ${openClause(record)}`;
  if (short.length <= DESCRIPTION_MAX) return short;
  return `${short.slice(0, DESCRIPTION_MAX - 1).trimEnd()}…`;
}

export function packetDescription(record: RestaurantRecord): string {
  const name = String(record.title ?? "").trim() || "this restaurant";
  const base = `Print the file on ${name}: the verdict, the risk worth a phone call, and the script for making it.`;
  const full = `${base} ${openClause(record)}`;
  if (full.length <= DESCRIPTION_MAX) return full;
  if (base.length <= DESCRIPTION_MAX) return base;
  return `${base.slice(0, DESCRIPTION_MAX - 1).trimEnd()}…`;
}
