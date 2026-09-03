import type { RestaurantRecord } from "@/lib/dataset";

export const FLOOR_PREFIX = "Not stated on the restaurant's own pages";

export const CASE_FIELDS: { key: keyof RestaurantRecord; label: string }[] = [
  { key: "serviceSummary", label: "Service" },
  { key: "hoursSummary", label: "Hours" },
  { key: "reservationDetails", label: "Reservations" },
  { key: "priceDetails", label: "Price" },
  { key: "menuSummary", label: "Menu" },
  { key: "beverageDetails", label: "Beverage" },
  { key: "dietaryDetails", label: "Dietary" },
  { key: "accessibilityState", label: "Access" },
  { key: "parkingTransit", label: "Parking / transit" },
  { key: "dressCode", label: "Dress" },
  { key: "groupDetails", label: "Group" },
  { key: "atmosphereSummary", label: "Atmosphere" },
  { key: "typicalMealLength", label: "Meal length" },
  { key: "practicalNotes", label: "Practical" },
];

export function isUnstated(value: string | null | undefined): boolean {
  const t = String(value ?? "").trim();
  if (!t) return true;
  if (t.startsWith(FLOOR_PREFIX)) return true;
  return /^(not stated|unstated)/i.test(t) || /not stated in the reviewed first-party pages/i.test(t);
}

export function fieldDisplay(value: string | null | undefined): { unstated: boolean; text: string } {
  const unstated = isUnstated(value);
  return {
    unstated,
    text: unstated ? "Not stated — held open" : String(value).trim(),
  };
}

/**
 * The stored `depthLabel` ("12 / 12 core fields") counts core slots that hold
 * text. That is a schema check, not an evidence one: level-format.mjs fills an
 * empty slot with the leveling floor sentence, so a slot can read as filled
 * while the restaurant published nothing into it. Printed as "core fields" the
 * chip reads as evidence, which is the opposite of what it measures. Printed as
 * slots, next to the stated count from CASE_FIELDS, it reads as what it is.
 */
export function schemaDepthLabel(depthLabel: string): string {
  const raw = String(depthLabel ?? "").trim();
  const parts = /^(\d+)\s*\/\s*(\d+)\b/.exec(raw);
  return parts ? `${parts[1]} / ${parts[2]} schema slots filled` : raw;
}

/** Why the slot count and the stated count disagree, for a title attribute. */
export const SCHEMA_DEPTH_TITLE =
  "Counts the core slots that hold text, including the ones holding our own \u201cnot stated\u201d line. It is a schema check. The stated count is what the restaurant actually published.";

export function depthTone(filled: number, total: number): "verified" | "watch" | "unknown" {
  const pct = total ? filled / total : 0;
  if (pct >= 1) return "verified";
  if (pct >= 0.7) return "watch";
  return "unknown";
}
