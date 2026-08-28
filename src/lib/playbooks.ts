import { emptySituation, type Situation } from "./types.ts";
import { addDaysIso } from "./utils.ts";

export type PlaybookChapter = "night" | "format" | "constraint";

export type Playbook = {
  id: string;
  chapter: PlaybookChapter;
  title: string;
  lede: string;
  apply: Partial<Situation>;
};

export const PLAYBOOKS: Playbook[] = [
  {
    id: "date-night",
    chapter: "night",
    title: "Date night",
    lede: "Calm room, two covers, moderate commitment. Noise and privacy gaps stay open until you confirm them.",
    apply: {
      occasion: "Date night",
      partySize: 2,
      maxCommitment: "Moderate",
      daypart: "Dinner language",
      regionGroup: "Denver metro",
      leadDays: 7,
    },
  },
  {
    id: "business",
    chapter: "night",
    title: "Business dining",
    lede: "Quiet enough to talk, predictable pacing, clear booking path.",
    apply: {
      occasion: "Business dining",
      partySize: 2,
      maxCommitment: "Moderate",
      maxPlanningLoad: "Material",
      daypart: "Dinner language",
      regionGroup: "Denver metro",
      leadDays: 5,
    },
  },
  {
    id: "celebration",
    chapter: "night",
    title: "Celebration",
    lede: "Room that can hold a toast; private or semi-private preferred when stated.",
    apply: { occasion: "Celebration", partySize: 4, maxCommitment: "High", regionGroup: "Denver metro", leadDays: 14 },
  },
  {
    id: "group",
    chapter: "night",
    title: "Group dining",
    lede: "Six or more; check group policy and lead time first.",
    apply: { occasion: "Group dining", partySize: 6, constraints: ["Large party (6+)"], regionGroup: "Denver metro", leadDays: 14 },
  },
  {
    id: "solo",
    chapter: "night",
    title: "Solo dining",
    lede: "Counter or bar-friendly rooms; low commitment preferred.",
    apply: { occasion: "Solo dining", partySize: 1, maxCommitment: "Light", regionGroup: "Denver metro" },
  },
  {
    id: "visitor",
    chapter: "night",
    title: "One night in town",
    lede: "High signal, limited lead; walk-in tolerance when possible.",
    apply: { occasion: "Visitor / one-night-in-town", leadDays: 1, preferWalkIn: true, regionGroup: "Denver metro" },
  },
  {
    id: "weeknight",
    chapter: "night",
    title: "Low-stakes weeknight",
    lede: "Local, flexible, light planning load.",
    apply: {
      occasion: "Local / low-stakes weeknight",
      maxCommitment: "Light",
      maxPlanningLoad: "Standard",
      regionGroup: "Denver metro",
      leadDays: 1,
    },
  },
  {
    id: "tasting",
    chapter: "format",
    title: "Tasting / immersive",
    lede: "Structured menus and longer seats; high commitment only when you want it.",
    apply: { occasion: "Tasting / immersive", maxCommitment: "Immersive", maxPlanningLoad: "Heavy", regionGroup: "Denver metro", leadDays: 21 },
  },
  {
    id: "wine",
    chapter: "format",
    title: "Wine-forward evening",
    lede: "A beverage program on the record; your stated needs still have to be confirmed live.",
    apply: { occasion: "Wine-forward evening", wineForward: true, regionGroup: "Denver metro", leadDays: 7 },
  },
  {
    id: "brunch",
    chapter: "format",
    title: "Brunch / daytime",
    lede: "Daypart-tagged rooms; lighter dress and pacing expectations.",
    apply: { occasion: "Brunch / daytime", daypart: "Brunch/breakfast language", regionGroup: "Denver metro", leadDays: 3 },
  },
  {
    id: "late-bar",
    chapter: "format",
    title: "Late seating / bar-led",
    lede: "Later daypart, walk-in friendly when the record supports it.",
    apply: { occasion: "Late seating / bar-led", daypart: "Late/bar language", preferWalkIn: true, regionGroup: "Denver metro" },
  },
  {
    id: "walk-in",
    chapter: "format",
    title: "Walk-in / spontaneous",
    lede: "Zero lead; prefer rooms that publish walk-in or same-day paths.",
    apply: { occasion: "Walk-in / spontaneous", leadDays: 0, preferWalkIn: true, regionGroup: "Denver metro" },
  },
  {
    id: "allergy",
    chapter: "constraint",
    title: "Severe allergy / celiac",
    lede: "Holds the booking whenever dietary evidence is thin or conflicting. Confirm live.",
    apply: { occasion: "Dietary-sensitive visit", constraints: ["Severe allergy / celiac"], regionGroup: "Denver metro", leadDays: 14 },
  },
  {
    id: "access",
    chapter: "constraint",
    title: "Access-sensitive",
    lede: "Step-free and mobility needs; holds the booking when access is unstated.",
    apply: { occasion: "Access-sensitive visit", constraints: ["Mobility / step-free needs"], regionGroup: "Denver metro", leadDays: 7 },
  },
  {
    id: "noise",
    chapter: "constraint",
    title: "Hearing / noise sensitivity",
    lede: "Prefer calm energy rooms; surface noise unknowns.",
    apply: { constraints: ["Hearing / noise sensitivity"], regionGroup: "Denver metro" },
  },
  {
    id: "hard-end",
    chapter: "constraint",
    title: "Hard end time",
    lede: "Show, train, or childcare — pacing and booking path matter.",
    apply: { constraints: ["Hard end time (show, train, childcare)"], regionGroup: "Denver metro", leadDays: 3 },
  },
  {
    id: "private",
    chapter: "constraint",
    title: "Private / semi-private",
    lede: "Requires stated private or semi-private capacity; otherwise the booking stays on hold.",
    apply: { constraints: ["Private / semi-private required"], regionGroup: "Denver metro", leadDays: 14 },
  },
  {
    id: "zero-proof",
    chapter: "constraint",
    title: "Zero-proof / no alcohol",
    lede: "Beverage evidence must support non-alcoholic paths when stated.",
    apply: { constraints: ["Zero-proof / no alcohol"], regionGroup: "Denver metro" },
  },
];

export function playbooksByChapter(): Record<PlaybookChapter, Playbook[]> {
  const chapters: Record<PlaybookChapter, Playbook[]> = { night: [], format: [], constraint: [] };
  for (const p of PLAYBOOKS) chapters[p.chapter].push(p);
  return chapters;
}

export function applyPlaybook(p: Playbook): Situation {
  const s: Situation = { ...emptySituation, ...p.apply, constraints: p.apply.constraints ?? [] };
  if (s.leadDays !== null && !s.nightDate) s.nightDate = addDaysIso(s.leadDays);
  return s;
}

export const DEMO_NIGHT: Situation = applyPlaybook(PLAYBOOKS[0]!);
