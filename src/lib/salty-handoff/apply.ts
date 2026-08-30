/**
 * Restaurant Intelligence mapping onto Salty Handoff v2.
 * Incoming packets prefill the situation console. Planning-level dietary
 * categories never become allergy guarantees. Outgoing packets return the
 * chosen room, not the shortlist.
 */

import { createHandoff, handoffUrl } from "./codec.ts";
import {
  DIET_DISCLAIMER,
  type DecisionStatus,
  type SaltyHandoff,
  type TimingWindow,
} from "./contract.ts";
import type { Constraint, Occasion, Situation } from "../intelligence.ts";

export { DIET_DISCLAIMER };

const OCCASION_NAMES = [
  "Date night",
  "Business dining",
  "Celebration",
  "Group dining",
  "Walk-in / spontaneous",
  "Tasting / immersive",
  "Wine-forward evening",
  "Visitor / one-night-in-town",
  "Access-sensitive visit",
  "Dietary-sensitive visit",
  "Solo dining",
  "Brunch / daytime",
  "Late seating / bar-led",
  "Local / low-stakes weeknight",
] as const satisfies readonly Occasion[];

export function situationIsStarted(s: Situation): boolean {
  return (
    s.occasion != null ||
    s.partySize != null ||
    s.constraints.length > 0 ||
    s.region != null ||
    s.regionGroup != null ||
    s.query.trim() !== ""
  );
}

function mapOccasion(type?: string): Occasion | null {
  if (!type) return null;
  const l = type.toLowerCase();
  const exact = OCCASION_NAMES.find((o) => o.toLowerCase() === l);
  if (exact) return exact;
  if (l.includes("date")) return "Date night";
  if (l.includes("business")) return "Business dining";
  if (l.includes("celebrat") || l.includes("birthday")) return "Celebration";
  if (l.includes("brunch")) return "Brunch / daytime";
  if (l.includes("wine")) return "Wine-forward evening";
  if (l.includes("walk")) return "Walk-in / spontaneous";
  if (l.includes("solo")) return "Solo dining";
  if (l.includes("late") || l.includes("bar-led")) return "Late seating / bar-led";
  if (l.includes("weeknight") || l.includes("low-stakes")) return "Local / low-stakes weeknight";
  if (l.includes("tasting") || l.includes("immersive")) return "Tasting / immersive";
  if (l.includes("access")) return "Access-sensitive visit";
  if (l.includes("visitor") || l.includes("one night") || l.includes("in town")) {
    return "Visitor / one-night-in-town";
  }
  if (l.includes("group") || l.includes("hosted") || l.includes("dinner") || l.includes("host")) {
    return "Group dining";
  }
  if (l.includes("dine") || l.includes("eating out")) return "Group dining";
  return null;
}

function leadDaysFromWindow(window?: TimingWindow): number | null {
  if (window === "tonight") return 0;
  if (window === "days") return 3;
  if (window === "weeks") return 14;
  return null;
}

export function situationFromHandoff(handoff: SaltyHandoff, current: Situation): Situation {
  const next: Situation = { ...current, constraints: [...current.constraints] };

  if (handoff.party?.size) next.partySize = Math.min(12, Math.max(1, handoff.party.size));

  const lead = leadDaysFromWindow(handoff.timing?.window);
  if (lead != null) next.leadDays = lead;

  const occasion = mapOccasion(handoff.occasion?.type);
  if (occasion) next.occasion = occasion;

  if (handoff.occasion?.region && !next.region) next.region = handoff.occasion.region;

  if ((next.partySize ?? 0) >= 6 && !next.constraints.includes("Large party (6+)")) {
    next.constraints = [...next.constraints, "Large party (6+)"];
  }

  const diet = (handoff.occasion?.diet ?? []).map((d) => d.toLowerCase());
  if (diet.some((d) => /alcohol|zero-?proof/.test(d)) && !next.constraints.includes("Zero-proof / no alcohol")) {
    next.constraints = [...next.constraints, "Zero-proof / no alcohol"];
  }
  // Planning-level dietary categories never flip the allergy constraint.
  if (diet.length && !next.occasion) next.occasion = "Dietary-sensitive visit";

  if (handoff.timing?.time) {
    const hour = Number(handoff.timing.time.slice(0, 2));
    if (hour < 11) next.daypart = "Brunch/breakfast language";
    else if (hour < 15) next.daypart = "Lunch language";
    else if (hour >= 21) next.daypart = "Late/bar language";
    else next.daypart = "Dinner language";
  }

  return next;
}

export function planningDietBanner(handoff: SaltyHandoff): string | null {
  const diet = handoff.occasion?.diet;
  if (!diet?.length) return null;
  return `Planning-level dietary: ${diet.join(", ")}. ${DIET_DISCLAIMER}`;
}

export function outgoingRestaurantToDesk(opts: {
  room: string;
  status?: DecisionStatus;
  unresolved?: string[];
}): { url: string; handoff: SaltyHandoff } {
  const unresolved = opts.unresolved?.slice(0, 8);
  const handoff = createHandoff("restaurant", "desk", "return-decision", {
    decision: unresolved?.length
      ? { room: opts.room, status: opts.status ?? "shortlisted", unresolved }
      : { room: opts.room, status: opts.status ?? "shortlisted" },
  });
  return { url: handoffUrl(handoff, "/"), handoff };
}

export function isEmptySituation(s: Situation): boolean {
  return (
    s.occasion == null &&
    s.partySize == null &&
    s.leadDays == null &&
    s.constraints.length === 0 &&
    s.region == null &&
    s.regionGroup == null &&
    s.query.trim() === ""
  );
}

export function hasConstraint(name: Constraint, list: Constraint[]): boolean {
  return list.includes(name);
}
