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
import {
  mergeNightFromHandoff,
  nightRecordUrl,
  readNightRecord,
  writeNightRecord,
} from "../salty-night-record.ts";

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

/**
 * Guest medical detail must not cross the app boundary.
 *
 * The shared contract lists allergen / allergy / medical in PROHIBITED_FIELDS,
 * but codec.ts walks object KEYS only — it never inspects string values. An
 * unresolved item is free text (it comes from the call script, which writes
 * sentences like "One guest has a severe allergy or celiac disease..."), so
 * the disclosure sails straight through the filter written to stop it, into
 * the URL fragment and into localStorage under salty-night-record-v1.
 *
 * Matching items are replaced whole rather than redacted in place: scrubbing
 * one word out of the sentence still leaves the diagnosis legible from what
 * remains. Non-medical items (hours, deposit, private room, hard end time)
 * pass through untouched.
 */
const MEDICAL_KEYWORDS = [
  "allergy",
  "allergies",
  "allergic",
  "allergen",
  "celiac",
  "coeliac",
  "cross-contact",
  "anaphyla",
  "epipen",
  "medical",
  "intolerance",
] as const;

export const MEDICAL_PLACEHOLDER =
  "Confirm the declared dietary requirement directly with the kitchen.";

function mentionsMedical(text: string): boolean {
  const lower = String(text ?? "")
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, "-");
  // Collapsed form catches "cross contact" and "epi-pen" as well.
  const collapsed = lower.replace(/[-\s]+/g, "");
  return MEDICAL_KEYWORDS.some(
    (word) => lower.includes(word) || collapsed.includes(word.replace(/-/g, "")),
  );
}

/** Replace any medical clause with a neutral instruction, keeping the rest. */
export function sanitiseUnresolved(items: readonly string[]): string[] {
  const out: string[] = [];
  for (const item of items) {
    const safe = mentionsMedical(item) ? MEDICAL_PLACEHOLDER : item;
    if (!out.includes(safe)) out.push(safe);
  }
  return out;
}

export function outgoingRestaurantToDesk(opts: {
  room: string;
  status?: DecisionStatus;
  unresolved?: string[];
}): { url: string; handoff: SaltyHandoff } {
  const unresolved = opts.unresolved?.length
    ? sanitiseUnresolved(opts.unresolved).slice(0, 8)
    : undefined;
  const handoff = createHandoff("restaurant", "desk", "return-decision", {
    decision: unresolved?.length
      ? { room: opts.room, status: opts.status ?? "shortlisted", unresolved }
      : { room: opts.room, status: opts.status ?? "shortlisted" },
  });
  const baseUrl = handoffUrl(handoff, "/");
  const currentNight = readNightRecord();
  if (!currentNight) return { url: baseUrl, handoff };
  const nextNight = mergeNightFromHandoff(currentNight, handoff, "desk");
  writeNightRecord(nextNight);
  return { url: nightRecordUrl(baseUrl, nextNight), handoff };
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
