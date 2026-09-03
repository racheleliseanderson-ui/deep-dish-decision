/**
 * Consumer snapshot — a diner-facing read of first-party fields.
 *
 * Extracts the decision-relevant point. Does not dump database fields,
 * does not treat restaurant-owned claims as proof the food is good,
 * and never mixes in public-review sentiment.
 */
import { isUnstated } from "@/lib/case-depth";
import type { RestaurantRecord } from "@/lib/dataset";
import dishesRaw from "@/data/first-party-dishes.json";

export const FIRST_PARTY = "firstPartyEvidence" as const;

export type SnapshotItem = {
  label: string;
  value: string;
  open: boolean;
};

export type ConsumerSnapshot = {
  whyGo: string;
  items: SnapshotItem[];
  provenance: typeof FIRST_PARTY;
};

const OPEN = "The restaurant has never put this in writing.";
const namedFile = dishesRaw as { records: Record<string, string[]> };

export function statedText(value: string | null | undefined): string | null {
  if (isUnstated(value)) return null;
  const t = String(value).trim();
  return t || null;
}

/** First sentence, clipped to a readable consumer length. */
export function firstPoint(value: string | null | undefined, max = 168): string | null {
  const t = statedText(value);
  if (!t) return null;
  const sentence = t.match(/^(.+?[.!?])(?:\s|$)/);
  let s = (sentence?.[1] ?? t).trim();
  if (s.length > max) {
    s =
      s
        .slice(0, max - 1)
        .replace(/\s+\S*$/, "")
        .replace(/[,;:–-]\s*$/, "") + "…";
  }
  return s;
}

export function whyGoLine(record: RestaurantRecord): string {
  return (
    firstPoint(record.cuisineContext, 180) ??
    firstPoint(record.atmosphereSummary, 180) ??
    firstPoint(record.occasionFit, 160) ??
    "Culinary identity is not stated on the restaurant's own pages."
  );
}

function foodAndMenu(record: RestaurantRecord): SnapshotItem {
  const identity = firstPoint(record.cuisineContext, 140);
  const menu = firstPoint(record.menuSummary, 120);
  const named = (namedFile.records[record.slug] ?? [])
    .filter((s) => s.trim().length >= 3)
    .slice(0, 2);
  if (!identity && !menu && !named.length) return { label: "Food & menu", value: OPEN, open: true };
  const namedLine = named.length ? `Pages name: ${named.join("; ")}.` : "";
  if (identity && menu && !overlaps(identity, menu)) {
    return {
      label: "Food & menu",
      value: [identity, menu, namedLine].filter(Boolean).join(" "),
      open: false,
    };
  }
  return {
    label: "Food & menu",
    value: [identity ?? menu, namedLine].filter(Boolean).join(" ") || OPEN,
    open: false,
  };
}

function spend(record: RestaurantRecord): SnapshotItem {
  const raw = statedText(record.priceDetails);
  if (!raw) return { label: "Spend / value", value: OPEN, open: true };
  const dollars = [...raw.matchAll(/\$([0-9][0-9,]*(?:\.[0-9]{2})?)/g)].map((m) =>
    Number((m[1] ?? "0").replace(/,/g, "")),
  );
  const service = raw.match(/(\d{1,2}(?:\.\d+)?)\s*%\s*(?:service|auto[\s-]?grat|gratuity)/i);
  const corkage = raw.match(/\$([0-9][0-9,]*)\s*corkage/i);
  const parts: string[] = [];
  if (dollars.length === 1 && service) {
    const base = dollars[0]!;
    const pct = Number(service[1]);
    const withService = Math.round(base * (1 + pct / 100));
    parts.push(
      `Published from $${base} per guest before drinks; about $${withService} once the ${pct}% service charge is included.`,
    );
  } else if (dollars.length >= 1) {
    const min = Math.min(...dollars);
    const max = Math.max(...dollars);
    parts.push(
      min === max
        ? `Published figure on the restaurant's pages: $${min}.`
        : `Published figures on the restaurant's pages run $${min}–$${max}.`,
    );
    if (service) parts.push(`${service[1]}% service charge is stated.`);
  } else {
    parts.push(firstPoint(raw, 168) ?? raw);
  }
  if (corkage) parts.push(`Corkage stated at $${corkage[1]}.`);
  parts.push("Confirm live before you commit — price is volatile.");
  return { label: "Spend / value", value: parts.join(" "), open: false };
}

function experience(record: RestaurantRecord): SnapshotItem {
  const atmo = firstPoint(record.atmosphereSummary, 150);
  const tags: string[] = [];
  const form = (record.formalityBand ?? "").toLowerCase();
  const noise = (record.noiseBand ?? "").toLowerCase();
  const pacing = (record.pacingBand ?? record.signals?.pacing ?? "").toLowerCase();
  if (/fine|formal|jacket/.test(form)) tags.push("formal");
  else if (/casual/.test(form)) tags.push("casual");
  else if (/upscale|polished/.test(form)) tags.push("upscale");
  if (/quiet|low/.test(noise)) tags.push("conversation-friendly");
  else if (/loud|energetic|lively|high/.test(noise)) tags.push("high energy");
  if (/slow|leisure|long/.test(pacing)) tags.push("slower pacing");
  else if (/quick|brisk/.test(pacing)) tags.push("brisk pacing");
  if (!atmo && !tags.length) return { label: "Experience", value: OPEN, open: true };
  const tagLine = tags.length ? `Room read: ${tags.join(", ")}.` : "";
  return {
    label: "Experience",
    value: [atmo, tagLine].filter(Boolean).join(" "),
    open: false,
  };
}

function bestFit(record: RestaurantRecord): SnapshotItem {
  const raw = statedText(record.occasionFit);
  if (!raw) return { label: "Best fit", value: OPEN, open: true };
  const bits = raw
    .split(/[;•|/]|(?:, (?=[A-Z]))/)
    .map((s) => s.trim().replace(/\.$/, ""))
    .filter(Boolean)
    .slice(0, 3);
  const line = bits.length ? bits.join("; ") + "." : firstPoint(raw, 140);
  return { label: "Best fit", value: line ?? OPEN, open: !line };
}

function convenience(record: RestaurantRecord): SnapshotItem {
  const booking = firstPoint(record.reservationDetails, 110);
  const meal = firstPoint(record.typicalMealLength, 80);
  const arrive = firstPoint(record.parkingTransit, 80);
  const parts = [booking, meal, arrive].filter(Boolean);
  if (!parts.length) return { label: "Convenience", value: OPEN, open: true };
  return { label: "Convenience", value: parts.join(" "), open: false };
}

function dietary(record: RestaurantRecord): SnapshotItem {
  const raw = statedText(record.dietaryDetails);
  if (!raw) {
    return {
      label: "Dietary",
      value: "Dietary handling is not stated on the restaurant's own pages.",
      open: true,
    };
  }
  const allergy = /celiac|cross-?contact|allerg/i.test(raw);
  const option = /vegetarian|vegan|gluten-?free|dairy-?free/i.test(raw);
  if (allergy) {
    return {
      label: "Dietary",
      value:
        (firstPoint(raw, 180) ?? raw) +
        " A menu marker is not a guarantee of allergy safety — confirm the live kitchen rule.",
      open: false,
    };
  }
  if (option) {
    return {
      label: "Dietary",
      value:
        "Vegetarian, vegan, or gluten-free options are published. That is not a statement that the kitchen can handle a severe allergy or celiac visit.",
      open: false,
    };
  }
  return { label: "Dietary", value: firstPoint(raw, 180) ?? raw, open: false };
}

function overlaps(a: string, b: string): boolean {
  const na = a.toLowerCase().slice(0, 48);
  return b.toLowerCase().includes(na.slice(0, 24));
}

export function buildConsumerSnapshot(record: RestaurantRecord): ConsumerSnapshot {
  return {
    whyGo: whyGoLine(record),
    provenance: FIRST_PARTY,
    items: [
      foodAndMenu(record),
      spend(record),
      experience(record),
      bestFit(record),
      convenience(record),
      dietary(record),
    ],
  };
}
