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

export function depthTone(filled: number, total: number): "verified" | "watch" | "unknown" {
  const pct = total ? filled / total : 0;
  if (pct >= 1) return "verified";
  if (pct >= 0.7) return "watch";
  return "unknown";
}
