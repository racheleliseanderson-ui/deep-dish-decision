/**
 * Scenario chips: situation-tied chips + record condition chips.
 * Pure first-party; never invents signals.
 */

import type { RestaurantRecord } from "@/lib/dataset";
import type { Scored, Situation } from "@/lib/intelligence";

export type ChipTone = "neutral" | "accent" | "critical" | "watch" | "unknown" | "verified";

export type ScenarioChip = {
  id: string;
  label: string;
  tone: ChipTone;
};

/** Chips that mirror the active situation (occasion, constraints, spend, party). */
export function scenarioChips(s: Situation): ScenarioChip[] {
  const out: ScenarioChip[] = [];
  if (s.occasion) out.push({ id: `occ-${s.occasion}`, label: s.occasion, tone: "accent" });
  if (s.partySize !== null) out.push({ id: `party-${s.partySize}`, label: `Party ${s.partySize}`, tone: "neutral" });
  if (s.spendBand) out.push({ id: `spend-${s.spendBand}`, label: s.spendBand, tone: "neutral" });
  if (s.daypart) out.push({ id: `day-${s.daypart}`, label: s.daypart, tone: "neutral" });
  for (const c of s.constraints) {
    out.push({ id: `con-${c}`, label: c, tone: "critical" });
  }
  if (s.preferWalkIn) out.push({ id: "walkin", label: "Walk-in preferred", tone: "watch" });
  if (s.wineForward) out.push({ id: "wine", label: "Wine-forward", tone: "accent" });
  if (s.maxCommitment) out.push({ id: `commit-${s.maxCommitment}`, label: `Max ${s.maxCommitment}`, tone: "neutral" });
  return out;
}

/** Chips from the record itself (condition, not situation). */
export function conditionChips(r: RestaurantRecord, sc?: Scored): ScenarioChip[] {
  const out: ScenarioChip[] = [];
  if (sc?.blocked) out.push({ id: "blocked", label: "Blocked on stated constraint", tone: "critical" });
  if (r.hasOfficialConflict) out.push({ id: "conflict", label: "Official conflict", tone: "critical" });
  if (r.reviewStatus === "overdue") out.push({ id: "overdue", label: "Review overdue", tone: "critical" });
  else if (r.reviewDueSoon) out.push({ id: "due", label: `Review due ${r.nextReviewAt}`, tone: "watch" });
  else out.push({ id: "current", label: "Review current", tone: "verified" });
  if (r.thinFieldCount) out.push({ id: "thin", label: `${r.thinFieldCount} thin field${r.thinFieldCount === 1 ? "" : "s"}`, tone: "unknown" });
  if (r.unknownsCount) out.push({ id: "unk", label: `${r.unknownsCount} unknown${r.unknownsCount === 1 ? "" : "s"}`, tone: "unknown" });
  if (r.planningLoad) out.push({ id: "load", label: `${r.planningLoad} load`, tone: "neutral" });
  if (r.depthLabel) out.push({ id: "depth", label: r.depthLabel, tone: "neutral" });
  return out;
}
