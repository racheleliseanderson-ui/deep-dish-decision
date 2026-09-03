// UNREFERENCED as of 2026-09-02 — see DEAD-CODE.md
/**
 * Situation playbooks — short, first-party-safe starting points for common nights.
 * Applying a playbook only fills Situation fields; it never invents evidence.
 */

import type { Situation } from "@/lib/intelligence";
import { emptySituation } from "@/lib/intelligence";

export type PlaybookChapter = "night" | "format" | "constraint";

export type Playbook = {
  id: string;
  chapter: PlaybookChapter;
  title: string;
  lede: string;
  /** Partial situation to merge onto emptySituation */
  apply: Partial<Situation>;
};

export const PLAYBOOKS: Playbook[] = [
  // --- night ---
  {
    id: "date-night",
    chapter: "night",
    title: "Date night",
    lede: "Calm room, two covers, moderate commitment. Do not recommend when noise or privacy cannot be confirmed.",
    apply: { occasion: "Date night", partySize: 2, maxCommitment: "Moderate" },
  },
  {
    id: "business",
    chapter: "night",
    title: "Business dining",
    lede: "Quiet enough to talk, predictable pacing, clear booking path.",
    apply: { occasion: "Business dining", partySize: 2, maxCommitment: "Moderate", maxPlanningLoad: "Material" },
  },
  {
    id: "celebration",
    chapter: "night",
    title: "Celebration",
    lede: "Room that can hold a toast; private or semi-private preferred when stated.",
    apply: { occasion: "Celebration", partySize: 4, maxCommitment: "High" },
  },
  {
    id: "group",
    chapter: "night",
    title: "Group dining",
    lede: "Six or more; check group policy and lead time first.",
    apply: { occasion: "Group dining", partySize: 6, constraints: ["Large party (6+)"] },
  },
  {
    id: "solo",
    chapter: "night",
    title: "Solo dining",
    lede: "Counter or bar-friendly rooms; low commitment preferred.",
    apply: { occasion: "Solo dining", partySize: 1, maxCommitment: "Light" },
  },
  {
    id: "visitor",
    chapter: "night",
    title: "One night in town",
    lede: "High signal, limited lead; walk-in tolerance when possible.",
    apply: { occasion: "Visitor / one-night-in-town", leadDays: 0, preferWalkIn: true },
  },
  {
    id: "weeknight",
    chapter: "night",
    title: "Low-stakes weeknight",
    lede: "Local, flexible, light planning load.",
    apply: { occasion: "Local / low-stakes weeknight", maxCommitment: "Light", maxPlanningLoad: "Standard" },
  },
  // --- format ---
  {
    id: "tasting",
    chapter: "format",
    title: "Tasting / immersive",
    lede: "Structured menus and longer seats; high commitment only when you want it.",
    apply: { occasion: "Tasting / immersive", maxCommitment: "Immersive", maxPlanningLoad: "Heavy" },
  },
  {
    id: "wine",
    chapter: "format",
    title: "Wine-forward evening",
    lede: "Beverage program in the evidence; still hold the booking when a stated need cannot be confirmed.",
    apply: { occasion: "Wine-forward evening", wineForward: true },
  },
  {
    id: "brunch",
    chapter: "format",
    title: "Brunch / daytime",
    lede: "Daypart-tagged rooms; lighter dress and pacing expectations.",
    apply: { occasion: "Brunch / daytime", daypart: "Daytime / brunch" },
  },
  {
    id: "late-bar",
    chapter: "format",
    title: "Late seating / bar-led",
    lede: "Later daypart, walk-in friendly when the record supports it.",
    apply: { occasion: "Late seating / bar-led", daypart: "Late", preferWalkIn: true },
  },
  {
    id: "walk-in",
    chapter: "format",
    title: "Walk-in / spontaneous",
    lede: "Zero lead; prefer rooms that publish walk-in or same-day paths.",
    apply: { occasion: "Walk-in / spontaneous", leadDays: 0, preferWalkIn: true },
  },
  // --- constraint ---
  {
    id: "allergy",
    chapter: "constraint",
    title: "Severe allergy / celiac",
    lede: "Do not recommend when dietary evidence is thin or conflicts. Confirm live.",
    apply: { occasion: "Dietary-sensitive visit", constraints: ["Severe allergy / celiac"] },
  },
  {
    id: "access",
    chapter: "constraint",
    title: "Access-sensitive",
    lede: "Step-free and mobility needs; hold when accessibility is unstated.",
    apply: { occasion: "Access-sensitive visit", constraints: ["Mobility / step-free needs"] },
  },
  {
    id: "noise",
    chapter: "constraint",
    title: "Hearing / noise sensitivity",
    lede: "Prefer calm energy rooms; surface noise unknowns.",
    apply: { constraints: ["Hearing / noise sensitivity"] },
  },
  {
    id: "hard-end",
    chapter: "constraint",
    title: "Hard end time",
    lede: "Show, train, or childcare — pacing and booking path matter.",
    apply: { constraints: ["Hard end time (show, train, childcare)"] },
  },
  {
    id: "private",
    chapter: "constraint",
    title: "Private / semi-private",
    lede: "Require stated private or semi-private capacity; do not recommend otherwise.",
    apply: { constraints: ["Private / semi-private required"] },
  },
  {
    id: "zero-proof",
    chapter: "constraint",
    title: "Zero-proof / no alcohol",
    lede: "Beverage evidence must support non-alcoholic paths when stated.",
    apply: { constraints: ["Zero-proof / no alcohol"] },
  },
];

export function playbooksByChapter(): Record<PlaybookChapter, Playbook[]> {
  const chapters: Record<PlaybookChapter, Playbook[]> = { night: [], format: [], constraint: [] };
  for (const p of PLAYBOOKS) chapters[p.chapter].push(p);
  return chapters;
}

export function applyPlaybook(p: Playbook, current: Situation = emptySituation): Situation {
  return {
    ...emptySituation,
    regionGroup: current.regionGroup,
    region: current.region,
    ...p.apply,
    constraints: p.apply.constraints ?? [],
  };
}

/** Whether a playbook's core fields already match the current situation. */
export function playbookMatches(p: Playbook, s: Situation): boolean {
  const a = p.apply;
  if (a.occasion && a.occasion !== s.occasion) return false;
  if (a.partySize != null && a.partySize !== s.partySize) return false;
  if (a.leadDays != null && a.leadDays !== s.leadDays) return false;
  if (a.maxCommitment && a.maxCommitment !== s.maxCommitment) return false;
  if (a.wineForward && !s.wineForward) return false;
  if (a.preferWalkIn && !s.preferWalkIn) return false;
  if (a.constraints?.length) {
    for (const c of a.constraints) if (!s.constraints.includes(c)) return false;
  }
  return true;
}
