/**
 * Scenario playbooks — 17 starter situations in 3 chapters.
 * Applying a playbook only sets Situation fields; ranking stays first-party + fail-closed.
 */

import type { Constraint, Occasion, Situation } from "@/lib/intelligence";
import { emptySituation } from "@/lib/intelligence";

export type PlaybookChapter = "night" | "format" | "constraint";

export type Playbook = {
  id: string;
  chapter: PlaybookChapter;
  title: string;
  lede: string;
  apply: Partial<Situation>;
};

export const PLAYBOOKS: Playbook[] = [
  // night
  { id: "date", chapter: "night", title: "Date night", lede: "Calm room, two covers, moderate commitment.", apply: { occasion: "Date night" as Occasion, partySize: 2, maxCommitment: "Moderate" } },
  { id: "business", chapter: "night", title: "Business dining", lede: "Quiet enough to talk, reliable booking path.", apply: { occasion: "Business dining" as Occasion, partySize: 4, maxCommitment: "Moderate" } },
  { id: "celebration", chapter: "night", title: "Celebration", lede: "Occasion fit and pacing that can carry a toast.", apply: { occasion: "Celebration" as Occasion, partySize: 6 } },
  { id: "solo", chapter: "night", title: "Solo dining", lede: "Counter or bar welcome, no forced group format.", apply: { occasion: "Solo dining" as Occasion, partySize: 1 } },
  { id: "brunch", chapter: "night", title: "Brunch / daytime", lede: "Daypart tags and lighter commitment.", apply: { occasion: "Brunch / daytime" as Occasion, daypart: "Brunch" } },
  { id: "late", chapter: "night", title: "Late seating / bar-led", lede: "Bar energy, later daypart.", apply: { occasion: "Late seating / bar-led" as Occasion, daypart: "Late" } },
  { id: "visitor", chapter: "night", title: "Visitor / one-night-in-town", lede: "High signal, low second chances.", apply: { occasion: "Visitor / one-night-in-town" as Occasion } },
  // format
  { id: "tasting", chapter: "format", title: "Tasting / immersive", lede: "Structured pacing, high commitment accepted.", apply: { occasion: "Tasting / immersive" as Occasion, maxCommitment: "Immersive" } },
  { id: "wine", chapter: "format", title: "Wine-forward evening", lede: "Beverage program and wine tags elevated.", apply: { occasion: "Wine-forward evening" as Occasion, wineForward: true } },
  { id: "group", chapter: "format", title: "Group dining (6+)", lede: "Large party signals and private options.", apply: { occasion: "Group dining" as Occasion, partySize: 8, constraints: ["Large party (6+)"] as Constraint[] } },
  { id: "walkin", chapter: "format", title: "Walk-in / spontaneous", lede: "Prefer walk-in path, low lead time.", apply: { occasion: "Walk-in / spontaneous" as Occasion, preferWalkIn: true, leadDays: 0 } },
  { id: "weeknight", chapter: "format", title: "Local / low-stakes weeknight", lede: "Light commitment, familiar geography.", apply: { occasion: "Local / low-stakes weeknight" as Occasion, maxCommitment: "Light" } },
  // constraint
  { id: "allergy", chapter: "constraint", title: "Severe allergy / celiac", lede: "Fail-closed when the record cannot support.", apply: { occasion: "Dietary-sensitive visit" as Occasion, constraints: ["Severe allergy / celiac"] as Constraint[] } },
  { id: "access", chapter: "constraint", title: "Mobility / step-free", lede: "Access-sensitive; unknown access holds open.", apply: { occasion: "Access-sensitive visit" as Occasion, constraints: ["Mobility / step-free needs"] as Constraint[] } },
  { id: "noise", chapter: "constraint", title: "Hearing / noise sensitivity", lede: "Calm energy preferred.", apply: { constraints: ["Hearing / noise sensitivity"] as Constraint[] } },
  { id: "budget", chapter: "constraint", title: "Hard budget cap", lede: "Spend band and price details become primary.", apply: { constraints: ["Hard budget cap"] as Constraint[] } },
  { id: "private", chapter: "constraint", title: "Private / semi-private required", lede: "Fail-closed when private space is unstated or absent.", apply: { constraints: ["Private / semi-private required"] as Constraint[] } },
];

export function playbookMatches(s: Situation, pb: Playbook): boolean {
  const a = pb.apply;
  if (a.occasion && s.occasion !== a.occasion) return false;
  if (a.partySize != null && s.partySize !== a.partySize) return false;
  if (a.constraints?.length) {
    for (const c of a.constraints) if (!s.constraints.includes(c)) return false;
  }
  if (a.wineForward && !s.wineForward) return false;
  if (a.preferWalkIn && !s.preferWalkIn) return false;
  return true;
}

export function applyPlaybook(pb: Playbook, base: Situation = emptySituation): Situation {
  return {
    ...base,
    ...pb.apply,
    constraints: pb.apply.constraints ?? base.constraints,
  };
}

export const CHAPTERS: { id: PlaybookChapter; label: string; lede: string }[] = [
  { id: "night", label: "The night", lede: "Occasion first — who is at the table and why." },
  { id: "format", label: "The format", lede: "Service shape, pacing, and how the room is used." },
  { id: "constraint", label: "Hard constraints", lede: "Fail-closed gates: allergy, access, privacy, budget." },
];
