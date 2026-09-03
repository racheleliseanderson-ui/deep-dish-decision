// UNREFERENCED as of 2026-09-02 — see DEAD-CODE.md
/**
 * Scenario and condition chips derived only from the active Situation and
 * first-party record fields. Never invents dishes, prices, or ratings.
 */

import { schemaDepthLabel } from "@/lib/case-depth";
import type { RestaurantRecord } from "@/lib/dataset";
import type { Situation } from "@/lib/intelligence";

export type ChipTone = "neutral" | "accent" | "critical" | "watch" | "unknown" | "verified";

export type ScenarioChip = {
  id: string;
  label: string;
  tone: ChipTone;
};

/** Chips that describe the active situation itself. */
export function scenarioChips(s: Situation): ScenarioChip[] {
  const out: ScenarioChip[] = [];
  if (s.occasion) out.push({ id: `occ-${s.occasion}`, label: s.occasion, tone: "accent" });
  if (s.partySize != null)
    out.push({ id: "party", label: `Party of ${s.partySize}`, tone: "neutral" });
  if (s.leadDays != null) {
    out.push({
      id: "lead",
      label: s.leadDays === 0 ? "Tonight / walk-in" : `${s.leadDays}d lead`,
      tone: s.leadDays === 0 ? "watch" : "neutral",
    });
  }
  if (s.spendBand) out.push({ id: "spend", label: s.spendBand, tone: "neutral" });
  if (s.daypart) out.push({ id: "day", label: s.daypart, tone: "neutral" });
  for (const c of s.constraints) {
    out.push({ id: `c-${c}`, label: c, tone: "critical" });
  }
  if (s.wineForward) out.push({ id: "wine", label: "Wine-forward", tone: "accent" });
  if (s.preferWalkIn) out.push({ id: "walk", label: "Prefer walk-in", tone: "watch" });
  return out;
}

/** Chips that surface the record's condition relative to the situation. */
export function conditionChips(
  r: RestaurantRecord,
  s: Situation,
  blocked: boolean,
): ScenarioChip[] {
  const out: ScenarioChip[] = [];
  if (blocked) out.push({ id: "blocked", label: "Held closed on constraint", tone: "critical" });
  if (r.hasOfficialConflict)
    out.push({ id: "conflict", label: "Official conflict", tone: "critical" });
  if (r.reviewStatus === "overdue")
    out.push({ id: "overdue", label: "Review overdue", tone: "critical" });
  else if (r.reviewDueSoon)
    out.push({ id: "due", label: `Review due ${r.nextReviewAt}`, tone: "watch" });
  if (r.thinFieldCount > 0)
    out.push({
      id: "thin",
      label: `${r.thinFieldCount} thin field${r.thinFieldCount === 1 ? "" : "s"}`,
      tone: "unknown",
    });
  if (r.unknownsCount > 0)
    out.push({
      id: "unk",
      label: `${r.unknownsCount} unknown${r.unknownsCount === 1 ? "" : "s"}`,
      tone: "unknown",
    });
  if (r.planningLoad) out.push({ id: "load", label: `${r.planningLoad} load`, tone: "neutral" });
  if (r.depthLabel)
    out.push({ id: "depth", label: schemaDepthLabel(r.depthLabel), tone: "neutral" });
  // Dietary / access hold only when the situation asks for it and the record is thin
  if (
    s.constraints.some((c) => /allergy|celiac|dietary/i.test(c)) &&
    /not stated|unstated|unknown/i.test(r.dietaryDetails ?? "")
  )
    out.push({ id: "diet-hold", label: "Dietary evidence thin", tone: "watch" });
  if (
    s.constraints.some((c) => /mobility|step-free|access/i.test(c)) &&
    /not stated|unstated|unknown/i.test(r.accessibilityState ?? "")
  )
    out.push({ id: "access-hold", label: "Access evidence thin", tone: "watch" });
  if (
    s.constraints.some((c) => /private/i.test(c)) &&
    !/private|semi-private/i.test(`${r.groupDetails ?? ""} ${r.atmosphereSummary ?? ""}`)
  )
    out.push({ id: "priv-hold", label: "Private room unstated", tone: "watch" });
  return out;
}
