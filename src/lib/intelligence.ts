import type { RestaurantRecord } from "@/lib/dataset";
import { corpusMeta } from "@/lib/corpus-meta";
import { getCompleteness } from "@/lib/completeness";
import {
  CENTROID_SLACK_MI,
  formatDistance,
  haversineMi,
  readDistance,
  openStateAt,
  openStateAtMoment,
  servesAt,
  localNow,
  minutesToClock,
  type DistanceRead,
  type LatLng,
  type LiveRow,
  type OpenState,
} from "@/lib/live";

/* ------------------------------------------------------------------ *
 * Situation model
 * ------------------------------------------------------------------ */

export const OCCASIONS = [
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
] as const;
export type Occasion = (typeof OCCASIONS)[number];

export const CONSTRAINTS = [
  "Severe allergy / celiac",
  "Mobility / step-free needs",
  "Hearing / noise sensitivity",
  "Hard end time (show, train, childcare)",
  "Large party (6+)",
  "Hard budget cap",
  "Private / semi-private required",
  "Zero-proof / no alcohol",
] as const;
export type Constraint = (typeof CONSTRAINTS)[number];

export const COMMITMENT_LEVELS = ["Light", "Moderate", "High", "Structured", "Immersive"] as const;
export const PLANNING_LEVELS = ["Standard", "Material", "Heavy"] as const;
export const DAYPARTS = corpusMeta.daypartOptions;
export const SPEND_BANDS = corpusMeta.spendBandOptions;

export type Situation = {
  occasion: Occasion | null;
  partySize: number | null;
  leadDays: number | null;
  constraints: Constraint[];
  maxCommitment: string | null;
  maxPlanningLoad: string | null;
  daypart: string | null;
  spendBand: string | null;
  regionGroup: string | null;
  region: string | null;
  cuisine: string | null;
  bookingPath: string | null;
  query: string;
  preferNoConflicts: boolean;
  preferWalkIn: boolean;
  wineForward: boolean;
  /** Where you are asking from. Enables distance, radius and "near me" order. */
  origin: LatLng | null;
  originLabel: string | null;
  /** Hard travel radius in miles. Null means distance informs but never excludes. */
  radiusMi: number | null;
  /** Only rooms serving at the arrival moment. */
  openOnly: boolean;
  /** Arrival time as "HH:MM" in the room's own timezone. Null means "now". */
  arriveAt: string | null;
};

export const emptySituation: Situation = {
  occasion: null,
  partySize: null,
  leadDays: null,
  constraints: [],
  maxCommitment: null,
  maxPlanningLoad: null,
  daypart: null,
  spendBand: null,
  regionGroup: null,
  region: null,
  cuisine: null,
  bookingPath: null,
  query: "",
  preferNoConflicts: false,
  preferWalkIn: false,
  wineForward: false,
  origin: null,
  originLabel: null,
  radiusMi: null,
  openOnly: false,
  arriveAt: null,
};

/**
 * Weighted depth (0–9). Occasion and guest constraints count more heavily
 * because they reshape fail-closed findings and ranking order the most.
 * Clamped so the meter stays readable as nine bars.
 */
export function situationDepth(s: Situation): number {
  let d = 0;
  if (s.occasion) d += 2;
  if (s.constraints.length) d += 2;
  if (s.partySize !== null) d += 1;
  if (s.leadDays !== null) d += 1;
  if (s.maxCommitment) d += 1;
  if (s.maxPlanningLoad) d += 1;
  if (s.daypart) d += 1;
  if (s.spendBand) d += 1;
  if (s.regionGroup ?? s.region) d += 1;
  if (s.origin) d += 1;
  if (s.arriveAt || s.openOnly) d += 1;
  return Math.min(SITUATION_SLOTS, d);
}

/** Unweighted slot fill count for diagnostics (nine binary slots). */
export function situationSlotCount(s: Situation): number {
  const slots = [
    s.occasion,
    s.partySize,
    s.leadDays,
    s.constraints.length ? "y" : null,
    s.maxCommitment,
    s.maxPlanningLoad,
    s.daypart,
    s.spendBand,
    s.regionGroup ?? s.region,
  ];
  return slots.filter(Boolean).length;
}

export const SITUATION_SLOTS = 11;

/** Ranking / findings options — enrichment is opt-in at call sites via prefs. */
export type ScoreOptions = {
  /** When true, labeled third-party signals join as watch/unknown only. Default true. */
  useEnrichment?: boolean | undefined;
  /** The dynamic layer for this region group, keyed by slug. */
  live?: Record<string, LiveRow> | undefined;
  /** Fixed clock for deterministic tests. Defaults to the real now. */
  now?: Date | undefined;
};

/** Resolve the arrival moment in the room's own timezone. */
export function arrivalMoment(
  row: LiveRow | undefined,
  s: Situation,
  now: Date,
): { day: number; minute: number } | null {
  const here = localNow(row?.tz, now);
  if (!here) return null;
  if (!s.arriveAt) return here;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.arriveAt);
  if (!m) return here;
  const minute = Number(m[1]) * 60 + Number(m[2]);
  // An arrival earlier than the current hour means tomorrow night.
  const day = minute < here.minute ? (here.day + 1) % 7 : here.day;
  return { day, minute };
}

/* ------------------------------------------------------------------ *
 * Occasion profiles — how each occasion reads a record
 * ------------------------------------------------------------------ */

type Profile = {
  groupFit?: string[];
  cuisine?: string[];
  service?: string[];
  energy?: string[];
  noise?: string[];
  pacing?: string[];
  commitment?: string[];
  party?: string[];
  formality?: string[];
  daypart?: string[];
  wine?: string[];
  privacy?: string[];
  booking?: string[];
  avoidEnergy?: string[];
  avoidCommitment?: string[];
  keywords?: string[];
};

const PROFILES: Record<Occasion, Profile> = {
  "Date night": {
    groupFit: ["Date night", "Counter dining", "Small group"],
    energy: ["Calm", "Balanced"],
    noise: ["Conversation-first"],
    pacing: ["Leisurely", "Long-form"],
    formality: ["Elevated", "Smart casual default"],
    party: ["Small table", "Flexible party"],
    keywords: ["date", "intimate", "counter"],
  },
  "Business dining": {
    groupFit: ["Business dining", "Private dining", "Small group"],
    energy: ["Calm", "Balanced"],
    noise: ["Conversation-first"],
    formality: ["Elevated", "Structured service", "Smart casual default"],
    pacing: ["Leisurely", "Quick"],
    privacy: ["Private-ready", "Some capacity", "Event / buyout"],
    keywords: ["business", "steak", "private"],
  },
  Celebration: {
    groupFit: ["Celebration", "Special occasion", "Special event", "Private dining"],
    formality: ["Elevated", "High formality / format lock", "Structured service"],
    commitment: ["High", "Structured", "Immersive"],
    pacing: ["Long-form", "Immersive", "Leisurely"],
    wine: ["Cellar / pairing", "Deep program"],
    keywords: ["celebration", "anniversary", "special"],
  },
  "Group dining": {
    groupFit: ["Group dining", "Large group", "Flexible group", "Family dining", "Family style"],
    party: ["Group-ready", "Large-group ready", "Flexible party"],
    service: ["Family style", "Communal dining", "Small plates"],
    energy: ["Lively", "Balanced"],
    keywords: ["group", "shared", "family"],
  },
  "Walk-in / spontaneous": {
    booking: ["Easy"],
    service: ["Walk-ins", "Bar", "Bar dining", "Happy hour", "Casual dining"],
    commitment: ["Light", "Moderate"],
    avoidCommitment: ["Immersive", "Structured"],
    keywords: ["walk-in", "open seating", "bar"],
  },
  "Tasting / immersive": {
    commitment: ["Immersive", "Structured"],
    pacing: ["Immersive", "Long-form"],
    service: ["Tasting menu", "Chef menu", "Chef table", "Prix fixe", "Chef-driven"],
    formality: ["High formality / format lock", "Structured service", "Elevated"],
    keywords: ["tasting", "course", "chef"],
  },
  "Wine-forward evening": {
    wine: ["Cellar / pairing", "Deep program", "Solid list"],
    cuisine: ["Wine-forward", "Fine dining"],
    service: ["Wine dinners", "Seasonal"],
    pacing: ["Leisurely", "Long-form"],
    keywords: ["wine", "cellar", "sommelier", "pairing"],
  },
  "Visitor / one-night-in-town": {
    groupFit: ["Visitor dining", "Special occasion", "Celebration"],
    energy: ["Lively", "Balanced"],
    keywords: ["visitor", "iconic", "view", "waterfront", "destination"],
  },
  "Access-sensitive visit": {
    keywords: ["accessible", "step-free", "elevator", "ground floor"],
  },
  "Dietary-sensitive visit": {
    cuisine: ["Plant-forward"],
    keywords: ["gluten", "vegan", "vegetarian", "allergen", "celiac"],
  },
  "Solo dining": {
    service: ["Bar", "Bar dining", "Counter dining", "Oyster bar", "Lounge"],
    party: ["Small table", "Flexible party"],
    commitment: ["Light", "Moderate"],
    keywords: ["counter", "bar seat", "solo"],
  },
  "Brunch / daytime": {
    service: ["Brunch", "Breakfast", "Lunch", "Patio", "Outdoor dining"],
    daypart: ["Brunch/breakfast language", "Lunch language"],
    commitment: ["Light", "Moderate"],
    keywords: ["brunch", "breakfast", "daytime", "lunch"],
  },
  "Late seating / bar-led": {
    service: ["Late night", "Bar", "Cocktail bar", "Lounge", "Happy hour"],
    daypart: ["Late/bar language"],
    energy: ["Lively", "High-energy"],
    keywords: ["late", "cocktail", "bar"],
  },
  "Local / low-stakes weeknight": {
    commitment: ["Light", "Moderate"],
    booking: ["Easy", "Plan ahead"],
    energy: ["Balanced", "Calm", "Lively"],
    avoidCommitment: ["Immersive", "Structured"],
    keywords: ["neighborhood", "casual", "weeknight"],
  },
};

function hits(list: string[] | undefined, pool: string[] | undefined): number {
  if (!list?.length || !pool?.length) return 0;
  return list.filter((v) => pool.includes(v)).length;
}

export function occasionScore(r: RestaurantRecord, occasion: Occasion): number {
  const p = PROFILES[occasion];
  let score = 30;
  score += Math.min(3, hits(p.groupFit, r.groupFitTags)) * 9;
  score += Math.min(2, hits(p.cuisine, r.cuisineTags)) * 7;
  score += Math.min(3, hits(p.service, r.serviceStyles)) * 5;
  if (p.energy?.includes(r.signals.energy ?? "")) score += 7;
  if (p.noise?.includes(r.noiseBand ?? "")) score += 7;
  if (p.pacing?.includes(r.signals.pacing ?? "")) score += 6;
  if (p.commitment?.includes(r.signals.commitment ?? "")) score += 7;
  if (p.party?.includes(r.signals.party ?? "")) score += 5;
  if (p.formality?.includes(r.formalityBand ?? "")) score += 6;
  if (p.wine?.includes(r.signals.wine ?? "")) score += 8;
  if (p.privacy?.includes(r.signals.private ?? "")) score += 5;
  if (p.booking?.includes(r.signals.booking ?? "")) score += 6;
  if (p.daypart?.some((d) => r.daypartTags?.includes(d))) score += 8;
  if (p.avoidEnergy?.includes(r.signals.energy ?? "")) score -= 10;
  if (p.avoidCommitment?.includes(r.signals.commitment ?? "")) score -= 12;
  const hay = (r.searchText ?? `${r.title} ${r.occasionFit} ${r.serviceSummary}`).toLowerCase();
  const kw = (p.keywords ?? []).filter((k) => hay.includes(k)).length;
  score += Math.min(3, kw) * 4;
  return clamp(Math.round(score), 0, 100);
}

export function topOccasion(r: RestaurantRecord): { occasion: Occasion; score: number } {
  let best: { occasion: Occasion; score: number } = { occasion: OCCASIONS[0], score: -1 };
  for (const o of OCCASIONS) {
    const s = occasionScore(r, o);
    if (s > best.score) best = { occasion: o, score: s };
  }
  return best;
}

/* ------------------------------------------------------------------ *
 * Findings
 * ------------------------------------------------------------------ */

export type FindingLayer = "critical" | "watch" | "unknown";

export type Finding = {
  id: string;
  layer: FindingLayer;
  domain: string;
  title: string;
  detail: string;
  action: string;
  impact: number; // 0-100, decision impact for this situation
  confidence: "high" | "moderate" | "low";
  situational: boolean;
  /** Provenance of the finding. user-photo is for multimodal vision OCR/detection results. */
  provenance?: "first-party" | "google-places" | "site-scrape" | "enrichment" | "user-photo";
};

const NOT_STATED = ["Not stated", "Direct confirmation required", "Route details unknown"];

function isThin(value: string | undefined): boolean {
  if (!value) return true;
  const v = value.toLowerCase();
  return (
    v.length < 40 ||
    v.includes("not stated") ||
    v.includes("not published") ||
    v.includes("were not")
  );
}

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

const levelIndex = (list: readonly string[], v: string | undefined) => (v ? list.indexOf(v) : -1);

export function buildFindings(
  r: RestaurantRecord,
  s: Situation,
  opts: ScoreOptions = {},
): Finding[] {
  const f: Finding[] = [];
  const c = (x: Constraint) => s.constraints.includes(x);
  const push = (x: Finding) => f.push(x);
  const live = opts.live?.[r.slug];
  const now = opts.now ?? new Date();

  /* --- access ---------------------------------------------------- */
  const accessThin =
    r.accessibilityTags.some((t) => NOT_STATED.includes(t)) || isThin(r.accessibilityState);
  const stairs = r.accessibilityTags.some((t) =>
    ["Stairs required", "Stairs stated", "No elevator", "Uneven terrain"].includes(t),
  );
  /* Directory-confirmed step-free evidence outranks first-party silence. */
  const a11y = live?.a11y;
  const a11yConfirmed = Boolean(a11y?.entrance);
  const a11yFull = Boolean(a11y?.entrance && a11y?.restroom && a11y?.seating);

  if (c("Mobility / step-free needs")) {
    if (stairs) {
      push({
        id: "access-stairs",
        layer: "critical",
        domain: "access",
        title: "First-party pages state stairs or no elevator",
        detail: r.accessibilityState || r.accessibilityTags.join(" · "),
        action:
          "Needs confirmation: call and confirm a step-free route, restroom access, and which entrance to use before committing this guest.",
        impact: 98,
        confidence: "high",
        situational: true,
      });
    } else if (a11yConfirmed) {
      const parts = [
        a11y?.entrance && "step-free entrance",
        a11y?.restroom && "accessible restroom",
        a11y?.seating && "accessible seating",
        a11y?.parking && "accessible parking",
      ].filter(Boolean) as string[];
      push({
        id: "access-directory",
        layer: a11yFull ? "watch" : "critical",
        domain: "access",
        title: a11yFull
          ? "Step-free entrance, restroom and seating reported"
          : "Step-free entrance reported — restroom or seating unconfirmed",
        detail: `Directory listing reports ${parts.join(", ")}. The restaurant's own pages do not state a route.`,
        action: a11yFull
          ? "Confirm the route on arrival day and reserve a table that matches the reported seating."
          : "Confirm restroom and table height directly — only the entrance is reported.",
        impact: a11yFull ? 46 : 74,
        confidence: "moderate",
        situational: true,
      });
    } else if (accessThin) {
      push({
        id: "access-unstated",
        layer: "critical",
        domain: "access",
        title: "Access route not stated on any source",
        detail:
          r.accessibilityState ||
          "No first-party statement of entrance, route, or restroom configuration was recorded.",
        action:
          "Treat as unverified. Confirm entrance, interior route, table height and restroom access live — do not infer from a directory listing.",
        impact: 78,
        confidence: "high",
        situational: true,
      });
    } else {
      push({
        id: "access-stated",
        layer: "watch",
        domain: "access",
        title: "First-party accessibility statement on record",
        detail: r.accessibilityState,
        action: "Still confirm restroom and table configuration for the exact seating you book.",
        impact: 52,
        confidence: "moderate",
        situational: true,
      });
    }
  } else if (accessThin) {
    push({
      id: "access-thin",
      layer: "unknown",
      domain: "access",
      title: "Access honesty marker: route unstated",
      detail: r.accessibilityState || "Physical-access details were not published first-party.",
      action: "Ask only if a guest needs it; the record does not claim accessibility either way.",
      impact: 24,
      confidence: "high",
      situational: false,
    });
  }

  /* --- dietary ---------------------------------------------------- */
  const dietaryHardNo = r.dietaryTags.some((t) =>
    ["No allergy guarantee", "Restrictions may not be accommodated", "No substitutions"].includes(
      t,
    ),
  );
  const dietaryUnstated = r.dietaryTags.some((t) => NOT_STATED.includes(t));
  if (c("Severe allergy / celiac")) {
    push({
      id: "diet-severe",
      layer: "critical",
      domain: "dietary",
      title: dietaryHardNo
        ? "Restaurant declines an allergy guarantee"
        : dietaryUnstated
          ? "Allergy handling not stated first-party"
          : "Allergy handling requires named confirmation",
      detail:
        r.dietaryDetails ||
        "First-party dietary language does not resolve cross-contact for a severe allergy.",
      action: dietaryHardNo
        ? "Cannot recommend until confirmed: this restaurant cannot carry a severe-allergy guest without a named manager confirming kitchen practice for your date."
        : "Call, name the allergen, and get cross-contact practice confirmed by kitchen staff — not by a booking form note.",
      impact: dietaryHardNo ? 99 : 76,
      confidence: "high",
      situational: true,
    });
  } else if (dietaryUnstated) {
    push({
      id: "diet-thin",
      layer: "unknown",
      domain: "dietary",
      title: "Dietary handling requires direct confirmation",
      detail: r.dietaryDetails || "No first-party dietary policy recorded.",
      action: "Confirm before inviting anyone with a restriction.",
      impact: 26,
      confidence: "high",
      situational: false,
    });
  }
  if (c("Zero-proof / no alcohol")) {
    const zp = /nonalcohol|non-alcohol|zero-proof|zero proof|na pairing/i.test(
      `${r.beverageDetails} ${r.dietaryTags.join(" ")}`,
    );
    push({
      id: "zero-proof",
      layer: zp ? "watch" : "unknown",
      domain: "beverage",
      title: zp ? "Zero-proof program referenced first-party" : "Zero-proof program unstated",
      detail: r.beverageDetails || "Beverage program not detailed first-party.",
      action: zp
        ? "Confirm the zero-proof pairing is running on your date and its supplement price."
        : "Ask what non-alcoholic options exist beyond soft drinks before you seat a zero-proof guest at a pairing table.",
      impact: zp ? 40 : 55,
      confidence: "moderate",
      situational: true,
    });
  }

  /* --- serving hours at the arrival moment -------------------------- */
  if (live?.hours) {
    const at = arrivalMoment(live, s, now);
    const serving = at ? servesAt(live, at.day, at.minute) : null;
    const state = openStateAt(live, now);
    if (at && serving === false) {
      const when = s.arriveAt ? `at ${minutesToClock(at.minute)}` : "right now";
      push({
        id: "hours-closed",
        layer: "critical",
        domain: "hours",
        title: `Not serving ${when}`,
        detail:
          state.state === "opens-later"
            ? `Published hours open at ${state.opensAt} local time.`
            : "Published hours show no service in that window.",
        action:
          state.state === "opens-later"
            ? `Move your arrival to ${state.opensAt} or later, or choose another room.`
            : "Pick a different night, or confirm a private booking outside published hours.",
        impact: 88,
        confidence: "high",
        situational: true,
      });
    } else if (state.state === "closing-soon" && !s.arriveAt) {
      push({
        id: "hours-closing",
        layer: "watch",
        domain: "hours",
        title: `Kitchen closes in ${state.closesInMin} minutes`,
        detail: `Published service ends at ${state.closesAt} local time.`,
        action: "Call before you travel — last seating is usually earlier than the closing time.",
        impact: 62,
        confidence: "moderate",
        situational: true,
      });
    } else if (at && serving === true) {
      push({
        id: "hours-open",
        layer: "watch",
        domain: "hours",
        title: s.arriveAt ? `Serving at ${minutesToClock(at.minute)}` : "Serving now",
        detail: `Published hours cover your arrival window${state.state === "open" ? ` and run to ${state.closesAt}` : ""}.`,
        action: "Published hours change with holidays and private events — reconfirm on the day.",
        impact: 20,
        confidence: "moderate",
        situational: false,
      });
    }
  } else if (s.openOnly || s.arriveAt) {
    push({
      id: "hours-unheld",
      layer: "unknown",
      domain: "hours",
      title: "Structured hours not held for this room",
      detail: r.hoursSummary || "Only prose hours are on file; no machine-readable schedule.",
      action: "Read the hours line and confirm the closing time for your night by phone.",
      impact: 34,
      confidence: "high",
      situational: true,
    });
  }

  /* --- distance from where you are asking ---------------------------- */
  if (s.origin && live?.ll) {
    const mi = haversineMi(s.origin, live.ll);
    const exact = live.llSource === "exact";
    const read = readDistance(mi, exact, r.city);
    // A centroid is not the door. Excluding a room on it would be the same
    // false precision in filter form, so the radius gets slack it did not ask
    // for rather than a hard edge the corpus cannot support.
    const edge = s.radiusMi === null ? null : s.radiusMi + (exact ? 0 : CENTROID_SLACK_MI);
    if (edge !== null && mi > edge) {
      push({
        id: "distance-out",
        layer: "critical",
        domain: "location",
        title: `Outside your ${s.radiusMi}-mile radius`,
        detail: exact
          ? `${read.value} from ${s.originLabel ?? "your origin"}.`
          : `${read.value} ${read.measuredTo}. No address coordinate is on file, so the radius was read against the city rather than the door.`,
        action: "Widen the radius or accept the travel time.",
        impact: 86,
        confidence: exact ? "high" : "moderate",
        situational: true,
      });
    } else if (mi <= 1.5 && exact) {
      push({
        id: "distance-walk",
        layer: "watch",
        domain: "location",
        title: "Walkable from where you are",
        detail: `${read.value} from where you are${live.hood ? ` — ${live.hood}` : ""}.`,
        action: "No parking question to resolve.",
        impact: 14,
        confidence: "high",
        situational: false,
      });
    }
  }

  /* --- budget ceiling ------------------------------------------------ */
  if (c("Hard budget cap")) {
    if (live?.pp) {
      const [lo, hi] = live.pp;
      const published = live.ppSource === "published";
      push({
        id: "budget",
        layer: lo >= 90 ? "critical" : "watch",
        domain: "spend",
        title:
          lo === hi ? `About $${lo} per guest before drinks` : `Roughly $${lo}–$${hi} per guest`,
        detail: published
          ? `Published by the restaurant${live.ppService ? `, including the ${live.ppService}% service charge` : ""}.`
          : "Estimated from the price band, not published per-guest pricing.",
        action:
          lo >= 90
            ? "Confirm the current per-guest total, supplements and service charge before you commit a capped budget."
            : "Ask what the total looks like with drinks and service before booking.",
        impact: lo >= 90 ? 70 : 38,
        confidence: published ? "high" : "low",
        situational: true,
      });
    } else {
      push({
        id: "budget-unknown",
        layer: "unknown",
        domain: "spend",
        title: "No per-guest figure on file",
        detail: r.priceDetails || "Pricing was not published on the reviewed pages.",
        action: "Ask for a current per-guest total before you seat a capped budget.",
        impact: 44,
        confidence: "high",
        situational: true,
      });
    }
  }

  /* --- conflict ---------------------------------------------------- */
  if (r.hasOfficialConflict) {
    const path = r.hasPhone
      ? `Call ${r.phone}`
      : r.reservationUrl
        ? "Use the official reservation page"
        : "Email the restaurant";
    push({
      id: "conflict",
      layer: s.preferNoConflicts || (s.leadDays !== null && s.leadDays <= 2) ? "critical" : "watch",
      domain: "evidence",
      title: "Official sources conflict — both claims preserved",
      detail:
        r.conflict ||
        "Two first-party statements disagree on a material field. Neither has been collapsed.",
      action: `${path} and ask the conflicted field as a direct question. Keep both recorded claims visible until sources converge; do not adopt the friendlier one.`,
      impact: 84,
      confidence: "high",
      situational: false,
    });
  }

  /* --- booking / lead time ----------------------------------------- */
  const tightBooking = ["Competitive", "Scarce"].includes(r.signals.booking ?? "");
  if (s.leadDays !== null) {
    if (tightBooking && s.leadDays <= 7) {
      push({
        id: "lead-tight",
        layer: s.leadDays <= 3 ? "critical" : "watch",
        domain: "booking",
        title: `Release cadence is ${(r.signals.booking ?? "").toLowerCase()} against ${s.leadDays}-day lead`,
        detail: r.reservationDetails || "Reservation release windows are constrained.",
        action:
          "Check the live inventory now, and hold a fallback record before you send an invitation.",
        impact: s.leadDays <= 3 ? 90 : 70,
        confidence: "high",
        situational: true,
      });
    } else if (!tightBooking && s.leadDays <= 2) {
      push({
        id: "lead-ok",
        layer: "watch",
        domain: "booking",
        title: "Short lead time is workable on this pathway",
        detail: r.reservationDetails || r.serviceSummary,
        action: "Confirm same-day capacity for your party size and arrival window.",
        impact: 44,
        confidence: "moderate",
        situational: true,
      });
    }
  } else if (tightBooking) {
    push({
      id: "lead-unknown",
      layer: "unknown",
      domain: "booking",
      title: "Booking is competitive; your lead time is unstated",
      detail: r.reservationDetails || "Release windows are limited.",
      action: "Add a date to the situation console to rank this record honestly.",
      impact: 34,
      confidence: "moderate",
      situational: false,
    });
  }
  if (s.preferWalkIn) {
    const walkIn = r.bookingPlatforms.includes("Walk-in / open seating");
    push({
      id: "walkin",
      layer: walkIn ? "watch" : "critical",
      domain: "booking",
      title: walkIn ? "A walk-in path exists on record" : "No first-party walk-in path recorded",
      detail: r.reservationDetails || r.serviceSummary,
      action: walkIn
        ? "Confirm which room takes walk-ins and at what hour the queue forms."
        : "Expect to be turned away without a reservation; treat this as a booked-only record.",
      impact: walkIn ? 48 : 88,
      confidence: "high",
      situational: true,
    });
  }

  /* --- party size ---------------------------------------------------- */
  const smallTable = r.signals.party === "Small table";
  const largeParty = c("Large party (6+)") || (s.partySize ?? 0) >= 6;
  if (largeParty) {
    push({
      id: "party",
      layer: smallTable ? "critical" : "watch",
      domain: "party",
      title: smallTable
        ? `Small-table constraint against a party of ${s.partySize ?? "6+"}`
        : `Large-party handling for ${s.partySize ?? "6+"} needs a named confirmation`,
      detail: r.groupDetails || "Group capacity was not fully described first-party.",
      action: smallTable
        ? "Do not attempt online; call and ask the maximum single-table seating before proposing this to the group."
        : "Call for the large-party path — deposits, set menus, and cut-off times usually differ from the public booking flow.",
      impact: smallTable ? 92 : 66,
      confidence: "moderate",
      situational: true,
    });
  }
  if (c("Private / semi-private required")) {
    const priv = r.signals.private ?? "Not stated";
    const weak = ["Not stated", "Limited"].includes(priv);
    push({
      id: "private",
      layer: weak ? "critical" : "watch",
      domain: "party",
      title: weak ? "Private path unstated or limited" : `Private capacity: ${priv}`,
      detail: r.groupDetails || "Private-dining language was not published first-party.",
      action: weak
        ? "Treat private seating as unavailable until the restaurant confirms a room, minimum spend, and cut-off date."
        : "Confirm the room, minimum spend, and whether the main dining noise carries into it.",
      impact: weak ? 86 : 56,
      confidence: "moderate",
      situational: true,
    });
  }

  /* --- timing / pacing ------------------------------------------------ */
  if (c("Hard end time (show, train, childcare)")) {
    const slow = ["Immersive", "Long-form"].includes(r.signals.pacing ?? "");
    push({
      id: "endtime",
      layer: slow ? "critical" : "watch",
      domain: "timing",
      title: slow
        ? `${r.signals.pacing} pacing against a hard end time`
        : "Pacing is workable against a hard end time",
      detail: r.typicalMealLength || r.serviceSummary,
      action: slow
        ? "Ask for the actual table time in minutes for your seating; a multi-course format rarely compresses on request."
        : "State the hard out-time when booking and confirm it is accepted, not just noted.",
      impact: slow ? 90 : 50,
      confidence: "moderate",
      situational: true,
    });
  }
  if (c("Hearing / noise sensitivity")) {
    const loud = ["High stimulus", "Higher stimulus"].includes(r.noiseBand ?? "");
    push({
      id: "noise",
      layer: loud ? "critical" : "watch",
      domain: "environment",
      title: loud
        ? `Noise band reads ${r.noiseBand}`
        : `Noise band reads ${r.noiseBand ?? "unstated"}`,
      detail: r.atmosphereSummary || "Room energy was inferred from first-party language only.",
      action: loud
        ? "Request an early seating and a perimeter or side-room table, or drop this record for a conversation-first room."
        : "Request a perimeter table and an early seating to keep the room readable.",
      impact: loud ? 84 : 44,
      confidence: "moderate",
      situational: true,
    });
  }

  /* --- spend ---------------------------------------------------------- */
  const conflictedPrice = r.priceTags.includes("Conflicting official price");
  if (c("Hard budget cap") || s.spendBand) {
    const premium = r.priceTags.includes("Special occasion");
    const mismatch =
      (c("Hard budget cap") && (premium || conflictedPrice)) ||
      (s.spendBand ? !(r.spendBands ?? []).includes(s.spendBand) : false);
    push({
      id: "spend",
      layer: conflictedPrice ? "critical" : mismatch ? "watch" : "unknown",
      domain: "spend",
      title: conflictedPrice
        ? "Official price statements conflict"
        : mismatch
          ? "Spend band sits outside the stated cap"
          : "Spend band matches the stated cap",
      detail: r.priceDetails || "Price was not fully published first-party.",
      action: conflictedPrice
        ? "Get the current per-guest price in writing before you invite anyone under a fixed cap."
        : mismatch
          ? "Price the full evening — supplements, service charge, and beverage — before treating this as affordable."
          : "Confirm service charge and supplement handling so the per-guest number holds.",
      impact: conflictedPrice ? 80 : mismatch ? 62 : 30,
      confidence: "moderate",
      situational: true,
    });
  }

  /* --- planning load / commitment -------------------------------------- */
  const loadIdx = levelIndex(PLANNING_LEVELS, r.planningLoad);
  const capIdx = levelIndex(PLANNING_LEVELS, s.maxPlanningLoad ?? undefined);
  if (capIdx >= 0 && loadIdx > capIdx) {
    push({
      id: "load",
      layer: "watch",
      domain: "operations",
      title: `Planning load is ${r.planningLoad}, above your ${s.maxPlanningLoad} ceiling`,
      detail: r.practicalNotes || r.reservationDetails,
      action:
        "Either accept the extra coordination or move to a record with a lighter confirm burden — the ranking below has already demoted this one.",
      impact: 64,
      confidence: "high",
      situational: true,
    });
  }
  const commIdx = levelIndex(COMMITMENT_LEVELS, r.signals.commitment);
  const commCap = levelIndex(COMMITMENT_LEVELS, s.maxCommitment ?? undefined);
  if (commCap >= 0 && commIdx > commCap) {
    push({
      id: "commitment",
      layer: "watch",
      domain: "operations",
      title: `Format commitment is ${r.signals.commitment}, above your ${s.maxCommitment} ceiling`,
      detail: r.reservationDetails || r.serviceSummary,
      action: "Check whether a bar or lounge path offers the same kitchen at a lower commitment.",
      impact: 58,
      confidence: "moderate",
      situational: true,
    });
  }

  /* --- freshness -------------------------------------------------------- */
  if (r.reviewStatus === "overdue") {
    push({
      id: "stale",
      layer: "critical",
      domain: "evidence",
      title: "Review window has lapsed",
      detail: `Last first-party review ${r.reviewedAt}; window closed ${r.nextReviewAt}.`,
      action: "Re-read the official pages before using this record for a decision.",
      impact: 78,
      confidence: "high",
      situational: false,
    });
  } else if (r.reviewDueSoon) {
    push({
      id: "due",
      layer: "watch",
      domain: "evidence",
      title: "Review due within the current cycle",
      detail: `Reviewed ${r.reviewedAt} · next review ${r.nextReviewAt}.`,
      action:
        "Volatile fields — hours, availability, price — should be confirmed in the same call.",
      impact: 46,
      confidence: "high",
      situational: false,
    });
  }

  /* --- thin fields as residual unknowns ---------------------------------- */
  if (isThin(r.parkingTransit)) {
    push({
      id: "thin-parking",
      layer: "unknown",
      domain: "arrival",
      title: "Parking and transit unstated",
      detail: r.parkingTransit || "No first-party arrival guidance was published.",
      action: c("Mobility / step-free needs")
        ? "Ask where a passenger can be dropped within a step-free distance of the entrance."
        : c("Hard end time (show, train, childcare)")
          ? "Ask about valet or the nearest garage — arrival friction is what breaks a hard end time."
          : "Low stakes here; check a map before you leave.",
      impact: c("Mobility / step-free needs")
        ? 60
        : c("Hard end time (show, train, childcare)")
          ? 48
          : 18,
      confidence: "high",
      situational: s.constraints.length > 0,
    });
  }
  if (isThin(r.dressCode)) {
    push({
      id: "thin-dress",
      layer: "unknown",
      domain: "arrival",
      title: "Dress expectation unstated",
      detail: r.dressCode || "No dress guidance was published first-party.",
      action:
        s.occasion === "Business dining" || s.occasion === "Celebration"
          ? "Ask directly — an unstated code in an elevated room is the most common guest embarrassment."
          : "Read the room from the atmosphere note; the restaurant has published no rule.",
      impact: s.occasion === "Business dining" || s.occasion === "Celebration" ? 42 : 14,
      confidence: "high",
      situational: false,
    });
  }
  for (const u of r.unknownList.slice(0, 4)) {
    push({
      id: `unknown-${u.slice(0, 18)}`,
      layer: "unknown",
      domain: "residual",
      title: capitalize(u),
      detail: "Recorded as unknown at the last first-party review; not inferred, not filled.",
      action: "Carry into the confirmation call if it bears on your night.",
      impact: 20,
      confidence: "high",
      situational: false,
      provenance: "first-party",
    });
  }

  /* Directory listing samples and review patterns never join ranking.
     They live on the public-reputation layer. useEnrichment is accepted
     for call-site compatibility and is a no-op here. */
  void opts;

  const order: Record<FindingLayer, number> = { critical: 0, watch: 1, unknown: 2 } as never;
  return f
    .sort((a, b) => order[a.layer] - order[b.layer] || b.impact - a.impact)
    .filter((v, i, arr) => arr.findIndex((x) => x.id === v.id) === i);
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ------------------------------------------------------------------ *
 * Confirm burden + scoring
 * ------------------------------------------------------------------ */

export function confirmBurden(r: RestaurantRecord, findings: Finding[]): number {
  let b = 12;
  b += Math.min(6, r.unknownsCount) * 5;
  b += Math.min(4, r.thinFieldCount) * 4;
  if (r.hasOfficialConflict) b += 18;
  if (r.reviewStatus === "overdue") b += 16;
  else if (r.reviewDueSoon) b += 7;
  if (["Competitive", "Scarce"].includes(r.signals.booking ?? "")) b += 8;
  if (r.planningLoad === "Heavy") b += 12;
  else if (r.planningLoad === "Material") b += 6;
  if (!r.hasPhone) b += 6;
  b += findings.filter((f) => f.layer === "critical" && f.situational).length * 7;
  return clamp(Math.round(b), 0, 100);
}

/** One term in the fit calculation, kept so the ranking can explain itself. */
export type Contribution = {
  label: string;
  /** Points added (positive) or removed (negative) from fit. */
  delta: number;
  group:
    "occasion" | "location" | "timing" | "party" | "spend" | "booking" | "constraint" | "evidence";
};

export type Scored = {
  record: RestaurantRecord;
  fit: number;
  rank: number;
  burden: number;
  findings: Finding[];
  criticals: Finding[];
  watch: Finding[];
  unknowns: Finding[];
  occasionScore: number;
  reasons: string[];
  /** Every term that moved fit, largest magnitude first. */
  contributions: Contribution[];
  /**
   * The score before the 0-100 display clamp. Ordering uses this: on a
   * demanding situation dozens of records clamp to 0 and the clamped value
   * cannot tell them apart.
   */
  fitRaw: number;
  /** Where fit started before any term was applied. */
  fitBase: number;
  blocked: boolean;
  /** Dynamic layer for this room, when the region's live file is loaded. */
  live?: LiveRow | undefined;
  /** Miles from the situation origin. Null when either point is missing. */
  distanceMi: number | null;
  /** Whether the distance came from an exact point or a city centroid. */
  distanceExact: boolean;
  /**
   * The distance as it may be shown. Banded and qualified whenever the point is
   * a city centroid, so no render site has to remember to do that itself.
   */
  distanceRead: DistanceRead | null;
  /** Serving state at the arrival moment. */
  open: OpenState;
};

export function scoreRecord(r: RestaurantRecord, s: Situation, opts: ScoreOptions = {}): Scored {
  const findings = buildFindings(r, s, opts);
  const burden = confirmBurden(r, findings);
  const reasons: string[] = [];
  const live = opts.live?.[r.slug];
  const now = opts.now ?? new Date();
  const distanceMi = s.origin && live?.ll ? haversineMi(s.origin, live.ll) : null;
  const distanceExact = live?.llSource === "exact";
  const distanceRead = distanceMi === null ? null : readDistance(distanceMi, distanceExact, r.city);
  // The reader's arrival moment, not "now" — otherwise the card can print
  // "Serving at 7pm" beside a strip reading "Closed today" and charge the
  // penalty for a room that is open when they mean to go.
  const arrival = arrivalMoment(live, s, now);
  const open = arrival
    ? openStateAtMoment(live, arrival.day, arrival.minute)
    : openStateAt(live, now);

  const occ = s.occasion ? occasionScore(r, s.occasion) : topOccasion(r).score;
  let fit = s.occasion ? occ : 50 + (occ - 50) * 0.35;
  const fitBase = fit;
  const contributions: Contribution[] = [];
  /** Apply a term and record it. */
  const add = (label: string, delta: number, group: Contribution["group"]) => {
    if (Math.abs(delta) < 0.5) return;
    fit += delta;
    contributions.push({ label, delta, group });
  };
  if (s.occasion) reasons.push(`${s.occasion} fit ${occ}`);

  // Party composition
  if (s.partySize !== null) {
    if (s.partySize >= 6) {
      if (r.signals.party === "Large-group ready") {
        add("Large-group ready", 10, "party");
        reasons.push("large-group ready");
      } else if (r.signals.party === "Group-ready") {
        add("Group-ready", 6, "party");
        reasons.push("group-ready");
      } else if (r.signals.party === "Small table") {
        add("Small tables only", -22, "party");
        reasons.push("small-table constraint");
      }
    } else if (s.partySize <= 2) {
      if (["Small table", "Flexible party"].includes(r.signals.party ?? ""))
        add("Suits two", 5, "party");
    }
  }

  // Daypart
  if (s.daypart) {
    if (r.daypartTags?.includes(s.daypart)) {
      add("Daypart matches", 9, "timing");
      reasons.push("daypart language matches");
    } else {
      add("Daypart unstated for this service", -8, "timing");
      reasons.push("daypart unstated for this service");
    }
  }

  // Spend band
  if (s.spendBand) {
    if ((r.spendBands ?? []).includes(s.spendBand)) {
      add("Spend band matches", 8, "spend");
      reasons.push("spend band matches");
    } else add("Outside your spend band", -12, "spend");
  }

  // Booking path preference
  if (s.bookingPath && !r.bookingPlatforms.includes(s.bookingPath))
    add(`No ${s.bookingPath} pathway`, -25, "booking");
  if (s.preferWalkIn) {
    if (r.bookingPlatforms.includes("Walk-in / open seating")) add("Takes walk-ins", 8, "booking");
    else add("No walk-in path", -20, "booking");
  }
  if (s.wineForward) {
    if (["Cellar / pairing", "Deep program"].includes(r.signals.wine ?? ""))
      add("Deep wine programme", 10, "evidence");
    else if (r.signals.wine === "Solid list") add("Solid wine list", 3, "evidence");
    else add("Wine programme unstated", -8, "evidence");
  }
  if (s.preferNoConflicts && r.hasOfficialConflict)
    add("Official sources conflict", -18, "evidence");

  // Lead time vs booking scarcity
  if (s.leadDays !== null) {
    const tight = ["Competitive", "Scarce"].includes(r.signals.booking ?? "");
    if (tight && s.leadDays <= 3) {
      add("Release cadence beats your lead time", -26, "booking");
      reasons.push("release cadence beats your lead time");
    } else if (tight && s.leadDays <= 7) add("Tight booking for this lead time", -12, "booking");
    else if (!tight && s.leadDays <= 3) {
      add("Bookable on short notice", 6, "booking");
      reasons.push("bookable on short notice");
    }
    if (s.leadDays >= 21 && tight) {
      add("Lead time covers the release window", 6, "booking");
      reasons.push("lead time covers the release window");
    }
  }

  // Ceilings
  const loadIdx = levelIndex(PLANNING_LEVELS, r.planningLoad);
  const capIdx = levelIndex(PLANNING_LEVELS, s.maxPlanningLoad ?? undefined);
  if (capIdx >= 0 && loadIdx > capIdx)
    add(
      `Planning load above your ${s.maxPlanningLoad} cap`,
      -10 * (loadIdx - capIdx),
      "constraint",
    );
  const commIdx = levelIndex(COMMITMENT_LEVELS, r.signals.commitment);
  const commCap = levelIndex(COMMITMENT_LEVELS, s.maxCommitment ?? undefined);
  if (commCap >= 0 && commIdx > commCap)
    add(`Commitment above your ${s.maxCommitment} cap`, -8 * (commIdx - commCap), "constraint");

  // Constraints — fail closed
  const situationalCriticals = findings.filter((f) => f.layer === "critical" && f.situational);
  for (const f of situationalCriticals) {
    add(f.title, -f.impact * 0.32, "constraint");
    reasons.push(f.title.toLowerCase());
  }

  // Confirm burden discount, scaled by how little time the reader has
  const timePressure =
    s.leadDays === null ? 0.12 : s.leadDays <= 3 ? 0.3 : s.leadDays <= 10 ? 0.18 : 0.1;
  add("Still to confirm yourself", -burden * timePressure, "evidence");

  // Evidence depth rewards completeness, never invents it
  add("Evidence depth", (r.depthFilled / Math.max(1, r.depthTotal)) * 8, "evidence");
  add(
    `${r.unknownsCount} open unknown${r.unknownsCount === 1 ? "" : "s"}`,
    -Math.min(6, r.unknownsCount) * 1.2,
    "evidence",
  );
  const ownedCompleteness = getCompleteness(r.slug)?.completeness;
  if (typeof ownedCompleteness === "number") {
    add("Owned-site completeness", (ownedCompleteness / 100) * 6, "evidence");
    if (ownedCompleteness < 50) add("Thin owned-site file", -4, "evidence");
  }

  /* --- dynamic terms: proximity, serving hours, spend, evidence depth --- */

  // Proximity. Closer is better, but only when the point is real; a city
  // centroid earns a much smaller nudge because every room in that city shares it.
  if (distanceMi !== null) {
    const weight = distanceExact ? 1 : 0.3;
    // The label a reader sees for this term carries the same qualifier the card
    // does. "3.2 mi away" on a centroid was the lie in miniature.
    const near = `${formatDistance(distanceMi, distanceExact, r.city)} away`;
    if (distanceMi <= 1 && distanceExact) {
      add("Walkable from you", 12, "location");
      reasons.push("walkable from you");
    } else if (distanceMi <= 3) {
      add(near, 8 * weight, "location");
      if (distanceExact) reasons.push(near);
    } else if (distanceMi <= 8) add(near, 3 * weight, "location");
    else if (distanceMi <= 20) add(near, -3 * weight, "location");
    else add(near, -Math.min(18, distanceMi * 0.25) * weight, "location");
  }

  // Serving at the moment you actually want to arrive.
  if (open.state === "open") {
    add(`Open until ${open.closesAt}`, 7, "timing");
    reasons.push(`open until ${open.closesAt}`);
  } else if (open.state === "closing-soon") add("Closing within the hour", -6, "timing");
  else if (open.state === "closed" || open.state === "closed-today") {
    // `hours-closed` already charges this through the situational-critical
    // term; charging again here would count one fact twice.
    const alreadyCharged = findings.some((f) => f.id === "hours-closed" && f.layer === "critical");
    if (!alreadyCharged) add("Not serving then", -14, "timing");
  }

  // A named dish is a real reason to choose a room.
  const leadDish = live?.dishes?.[0];
  if (leadDish) {
    add(`Known for ${leadDish.name}`, 4, "evidence");
    reasons.push(`known for ${leadDish.name}`);
  }

  // Recurring-praise evidence is context, never a rating.
  if (live?.rep?.praise?.length) add("Researched review patterns on file", 3, "evidence");

  // Spend fit against a stated band. Only when the record carried no spend
  // band of its own — otherwise this is the same evidence charged twice, and
  // when `bandSource` is "planning-band" it is literally derived from it.
  if (s.spendBand && live?.band === s.spendBand && !(r.spendBands ?? []).length) {
    add("Price band matches", 6, "spend");
    reasons.push("price band matches");
  }

  const blocked = situationalCriticals.some((f) => f.impact >= 90);

  // A malformed coordinate must not poison the comparator with NaN.
  if (!Number.isFinite(fit)) fit = 0;

  return {
    record: r,
    fit: clamp(Math.round(fit), 0, 100),
    fitRaw: Math.round(fit),
    rank: 0,
    burden,
    findings,
    criticals: findings.filter((f) => f.layer === "critical"),
    watch: findings.filter((f) => f.layer === "watch"),
    unknowns: findings.filter((f) => f.layer === "unknown"),
    occasionScore: occ,
    reasons: reasons.slice(0, 4),
    contributions: [...contributions].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)),
    fitBase,
    blocked,
    live,
    distanceMi,
    distanceExact,
    distanceRead,
    open,
  };
}

export function rank(list: RestaurantRecord[], s: Situation, opts: ScoreOptions = {}): Scored[] {
  const scored = list.map((r) => scoreRecord(r, s, opts));
  scored.sort((a, b) => {
    if (a.blocked !== b.blocked) return a.blocked ? 1 : -1;
    if (b.fitRaw !== a.fitRaw) return b.fitRaw - a.fitRaw;
    if (a.distanceMi !== null && b.distanceMi !== null && a.distanceMi !== b.distanceMi) {
      return a.distanceMi - b.distanceMi;
    }
    if (a.burden !== b.burden) return a.burden - b.burden;
    return a.record.title.localeCompare(b.record.title);
  });
  scored.forEach((x, i) => (x.rank = i + 1));
  return scored;
}

export function filterRecords(
  list: RestaurantRecord[],
  s: Situation,
  live?: Record<string, LiveRow>,
): RestaurantRecord[] {
  const q = s.query.trim().toLowerCase();
  const now = new Date();
  return list.filter((r) => {
    const row = live?.[r.slug];
    if (s.radiusMi !== null && s.radiusMi > 0 && s.origin && row) {
      const ll = row.ll;
      // Same slack as the distance-out finding: a room is never dropped on a
      // point that is the middle of its city rather than its address.
      const edge = s.radiusMi + (row.llSource === "exact" ? 0 : CENTROID_SLACK_MI);
      const mi = ll ? haversineMi(s.origin, ll) : null;
      if (mi !== null && Number.isFinite(mi) && mi > edge) return false;
    }
    // "Only rooms serving then" is a filter, as the control says it is. A room
    // whose schedule is not held is kept — silence is not evidence of closure —
    // but the card says the schedule is missing.
    if (s.openOnly && row?.hours) {
      const at = arrivalMoment(row, s, now);
      if (at && servesAt(row, at.day, at.minute) === false) return false;
    }
    if (s.regionGroup && r.regionGroup !== s.regionGroup) return false;
    if (s.region && r.region !== s.region) return false;
    if (s.cuisine && !r.cuisineTags.includes(s.cuisine)) return false;
    if (q) {
      const hay = (
        r.searchText ?? `${r.title} ${r.region} ${r.cuisineTags.join(" ")}`
      ).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/* ------------------------------------------------------------------ *
 * Decision brief
 * ------------------------------------------------------------------ */

export type Brief = {
  verdict: string;
  verdictTone: "clear" | "conditional" | "hold";
  fitLine: string;
  riskLine: string;
  burdenLine: string;
  nextAction: string;
  confirmCalls: string[];
  /**
   * The findings behind confirmCalls, in the same order. The call text is for
   * this screen; anything crossing to another app needs the finding's own
   * domain so it can be reduced to a category instead of a sentence.
   */
  confirmFindings: Finding[];
};

export function decisionBrief(sc: Scored, s: Situation): Brief {
  const r = sc.record;
  const situationalCriticals = sc.criticals.filter((f) => f.situational);
  const tone: Brief["verdictTone"] = sc.blocked
    ? "hold"
    : situationalCriticals.length || sc.criticals.length
      ? "conditional"
      : "clear";

  const depth = situationDepth(s);
  const verdict = sc.blocked
    ? "Hold — a stated constraint is unresolved on first-party evidence"
    : sc.criticals.length
      ? "Workable, conditional on live confirmation"
      : depth < 3
        ? "No blocking evidence found; the situation is still thin"
        : "Clear on the evidence recorded";

  const fitLine = s.occasion
    ? `Reads ${sc.fit}/100 for ${s.occasion.toLowerCase()}${s.partySize ? ` at ${s.partySize}` : ""}${
        s.leadDays !== null ? `, ${s.leadDays} days out` : ""
      }. ${sc.reasons.length ? sc.reasons.slice(0, 3).join("; ") + "." : ""}`
    : `Reads ${sc.fit}/100 against a partial situation. Strongest recorded use: ${topOccasion(r).occasion.toLowerCase()}. Add an occasion to sharpen this.`;

  const riskLine = sc.criticals.length
    ? `${sc.criticals.length} critical risk${sc.criticals.length > 1 ? "s" : ""}: ${sc.criticals
        .slice(0, 2)
        .map((f) => f.title.toLowerCase())
        .join(
          "; ",
        )}. ${sc.watch.length} watch item${sc.watch.length === 1 ? "" : "s"}, ${sc.unknowns.length} residual unknown${sc.unknowns.length === 1 ? "" : "s"} carried forward.`
    : `No critical risk recorded for this situation. ${sc.watch.length} watch item${sc.watch.length === 1 ? "" : "s"} and ${sc.unknowns.length} residual unknown${sc.unknowns.length === 1 ? "" : "s"} remain visible.`;

  const burdenLine = `Confirm burden ${sc.burden}/100 · planning load ${r.planningLoad ?? "unstated"} · ${
    r.hasOfficialConflict ? "one official conflict open" : "no official conflict"
  } · reviewed ${r.reviewedAt}, next ${r.nextReviewAt}.`;

  const path = r.hasPhone
    ? `Call ${r.phone}`
    : r.reservationUrl
      ? "Open the official reservation page"
      : "Email the restaurant";

  const nextAction = sc.blocked
    ? `${path} and resolve the blocking constraint before this record re-enters the shortlist. Do not book against inference.`
    : sc.criticals.length
      ? `${path} in one pass and clear every critical item below; book only after they resolve.`
      : `${path} to confirm hours, party size, and the volatile fields, then book on the ${r.bookingPlatforms[0] ?? "official"} pathway.`;

  const confirmFindings = sc.findings
    .filter((f) => f.layer !== "unknown" || f.impact >= 40)
    .slice(0, 6);
  const confirmCalls = confirmFindings.map((f) => f.action);

  return {
    verdict,
    verdictTone: tone,
    fitLine,
    riskLine,
    burdenLine,
    nextAction,
    confirmCalls,
    confirmFindings,
  };
}

export const OPS = corpusMeta.ops;
