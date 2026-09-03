/**
 * Deep Dish mapping onto Salty Handoff v2.
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
 * What crosses to Occasion OS is the category of the open question, never the
 * question.
 *
 * The shared contract lists allergen / allergy / medical in PROHIBITED_FIELDS,
 * but codec.ts walks object KEYS only and never inspects string values. An
 * unresolved item is free text out of the call script, which writes sentences
 * like "One guest has a severe allergy or celiac disease...", so a guest's
 * medical disclosure sailed straight through the filter written to stop it,
 * into the URL fragment and into localStorage under salty-night-record-v1.
 *
 * Redacting words out of the sentence is not a fix: what is left still reads
 * as the diagnosis. So the sentence does not travel at all. Every outgoing
 * item is mapped to one label from the closed vocabulary below, which means
 * nothing free-typed can leave this app by this route regardless of what the
 * script says next. The full script stays on our own screen, where the person
 * whose night it is can read it and copy it.
 *
 * The label is read off the finding's own `domain` where the caller has one.
 * String matching is the fallback for a caller that only has a sentence, and
 * it is deliberately shallow: anything it does not recognise is "open
 * question", which is true and says nothing.
 */
export type UnresolvedItem =
  | string
  | { domain?: string; layer?: string; title?: string; action?: string };

/** One label per Finding domain in src/lib/intelligence.ts. */
export const UNRESOLVED_CATEGORY_BY_DOMAIN: Readonly<Record<string, string>> = {
  access: "accessibility",
  arrival: "parking and dress",
  beverage: "beverage program",
  booking: "booking pathway",
  dietary: "dietary cross-contact",
  environment: "noise and room",
  evidence: "evidence gap",
  hours: "hours",
  location: "distance",
  operations: "planning load",
  party: "party size and private room",
  residual: "open question",
  spend: "spend and deposit terms",
  timing: "hard end time",
};

export const DEFAULT_UNRESOLVED_CATEGORY = "open question";

/** Fallback only, for a caller holding a sentence and no finding. */
const TEXT_CATEGORY: ReadonlyArray<readonly [RegExp, string]> = [
  [/allerg|celiac|coeliac|cross.?contact|gluten|dietary|epi.?pen|anaphyla|intoleran/i, "dietary cross-contact"],
  [/step.?free|wheelchair|accessib|elevator|stairs?\b/i, "accessibility"],
  [/deposit|minimum spend|prepay|cancellation/i, "deposit terms"],
  [/private (?:room|dining)|semi-private|buyout/i, "private room"],
  [/end time|hard out|curfew/i, "hard end time"],
  [/park|transit|valet/i, "parking"],
  [/dress|attire/i, "dress code"],
  [/reserv|book|walk-?in|waitlist/i, "booking pathway"],
  [/hours|closing|closes|open(?:ing)?\b/i, "hours"],
  [/price|per guest|spend|cost/i, "spend"],
  [/party size|large party|table for|seating/i, "party size"],
  [/noise|loud|volume/i, "noise and room"],
];

/** The one label this item may become. Never the item's own text. */
export function unresolvedCategory(item: UnresolvedItem): string {
  if (item && typeof item === "object") {
    const byDomain = item.domain ? UNRESOLVED_CATEGORY_BY_DOMAIN[item.domain] : undefined;
    if (byDomain) return byDomain;
    const text = `${item.title ?? ""} ${item.action ?? ""}`;
    return matchCategory(text);
  }
  return matchCategory(String(item ?? ""));
}

function matchCategory(text: string): string {
  const t = text.trim();
  if (!t) return DEFAULT_UNRESOLVED_CATEGORY;
  for (const [re, label] of TEXT_CATEGORY) if (re.test(t)) return label;
  return DEFAULT_UNRESOLVED_CATEGORY;
}

/** Categories for the outgoing packet: deduped, order preserved. */
export function unresolvedCategories(items: readonly UnresolvedItem[]): string[] {
  const out: string[] = [];
  for (const item of items) {
    const label = unresolvedCategory(item);
    if (!out.includes(label)) out.push(label);
  }
  return out;
}

/**
 * The chosen room, sent to the night plan in Occasion OS.
 *
 * This used to address the Desk. The Desk was retired on 2026-09-02, and the
 * night itself lives in Occasion OS -- which already sends traffic the other
 * way when a host decides to dine out instead -- so the return leg lands there.
 */
export function outgoingRestaurantToOccasion(opts: {
  room: string;
  status?: DecisionStatus;
  unresolved?: readonly UnresolvedItem[];
}): { url: string; handoff: SaltyHandoff } {
  const unresolved = opts.unresolved?.length
    ? unresolvedCategories(opts.unresolved).slice(0, 8)
    : undefined;
  const handoff = createHandoff("restaurant", "occasion", "return-decision", {
    decision: unresolved?.length
      ? { room: opts.room, status: opts.status ?? "shortlisted", unresolved }
      : { room: opts.room, status: opts.status ?? "shortlisted" },
  });
  const baseUrl = handoffUrl(handoff, "/");
  const currentNight = readNightRecord();
  if (!currentNight) return { url: baseUrl, handoff };
  const nextNight = mergeNightFromHandoff(currentNight, handoff, "occasion");
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
