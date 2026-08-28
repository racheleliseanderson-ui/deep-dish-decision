import type { Freshness, RestaurantRecord, Signals } from "../lib/types.ts";

const NOT_STATED = /not stated|not published|unstated|direct confirmation required|were not/i;

function isThin(value: string | undefined): boolean {
  if (!value) return true;
  return value.length < 40 || NOT_STATED.test(value);
}

const DEPTH_FIELDS = [
  "serviceSummary",
  "hoursSummary",
  "reservationDetails",
  "cancellationPolicy",
  "priceDetails",
  "dietaryDetails",
  "accessibilityState",
  "groupDetails",
  "atmosphereSummary",
  "parkingTransit",
  "dressCode",
  "typicalMealLength",
  "depositPolicy",
  "beverageDetails",
] as const;

export type Draft = Partial<RestaurantRecord> & {
  slug: string;
  title: string;
  recordId: string;
  city: string;
  stateProvince: string;
  regionGroup: string;
  address: string;
  phone: string;
  website: string;
  menuUrl: string;
  reservationUrl: string;
  cuisineTags: string[];
  cuisineContext: string;
  serviceSummary: string;
  menuSummary: string;
  occasionFit: string;
  hoursSummary: string;
  reservationDetails: string;
  cancellationPolicy: string;
  depositPolicy: string;
  latePolicy: string;
  priceDetails: string;
  dietaryDetails: string;
  beverageDetails: string;
  groupDetails: string;
  atmosphereSummary: string;
  practicalNotes: string;
  accessibilityState: string;
  parkingTransit: string;
  dressCode: string;
  typicalMealLength: string;
  unknownList: string[];
  signals: Signals;
  priceTags: string[];
  serviceStyles: string[];
  dietaryTags: string[];
  accessibilityTags: string[];
  reservationTags: string[];
  groupFitTags: string[];
  bookingPlatforms: string[];
  spendBands: string[];
  daypartTags: string[];
  formalityBand: string;
  noiseBand: string;
  sources: string[];
  officialSource: string;
};

const DEFAULTS: Partial<RestaurantRecord> = {
  email: "",
  conflict: "",
  retrievedAt: "2026-08-20",
  version: "2026.08.20",
  reviewedAt: "2026-08-20",
  nextReviewAt: "2026-09-03",
  freshnessStatus: "current",
  hoursFreshness: "current",
  priceFreshness: "current",
  cancellationFreshness: "incomplete",
  dietaryFreshness: "unknown",
  accessFreshness: "unknown",
  sourceAuthority: "Official restaurant website / first-party menu, reservation, and contact pages",
  confidence: "moderate_best_effort_first_party",
  fieldVolatility:
    "Hours, menus, prices, availability and reservation terms are volatile. Reconfirm within 14 days of the night.",
  disclaimer:
    "A decision aid, not a booking, allergen, accessibility, or price guarantee. Silence is unknown — never a policy.",
  tableTimeMinutes: null,
  bookingLeadDays: null,
  dietaryAdvanceNoticeDays: null,
  maxOnlineParty: null,
  planningLoad: "Standard",
};

/**
 * Review state is derived from the calendar, never asserted.
 *
 * A record that publishes "next review 2026-09-03" has to stop calling itself
 * current on 2026-09-04. Carrying that state as a constant in DEFAULTS made
 * the one promise this instrument cannot afford to get wrong — that you are
 * told when the evidence went out of date — the single field it never
 * checked. It also left the overdue and due-soon branches of buildFindings
 * unreachable and their confirm-burden weights dead.
 *
 * Dates are compared date-only in UTC so a server render and a browser
 * hydration land on the same calendar day.
 */
const DUE_SOON_WINDOW_DAYS = 7;
const DAY_MS = 86_400_000;

export function todayISO(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Whole days from `today` to `iso`; negative once the date has passed. */
export function daysUntil(iso: string, today: string): number | null {
  const target = Date.parse(`${iso}T00:00:00Z`);
  const from = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(target) || Number.isNaN(from)) return null;
  return Math.round((target - from) / DAY_MS);
}

export function deriveReviewStatus(
  nextReviewAt: string | undefined,
  today: string,
): RestaurantRecord["reviewStatus"] {
  const left = nextReviewAt ? daysUntil(nextReviewAt, today) : null;
  // A missing or unreadable review date is not a pass. Fail closed.
  if (left === null) return "overdue";
  if (left < 0) return "overdue";
  if (left <= DUE_SOON_WINDOW_DAYS) return "due-soon";
  return "current";
}

/**
 * A record past its review window is not "current" evidence, whatever the
 * default said. A freshness state an author set deliberately — conflicting,
 * incomplete, under-review — is more specific than the clock and is left alone.
 */
export function deriveFreshness(
  authored: Freshness | undefined,
  reviewStatus: RestaurantRecord["reviewStatus"],
): Freshness {
  const base = authored ?? "current";
  if (base !== "current") return base;
  if (reviewStatus === "overdue") return "stale";
  if (reviewStatus === "due-soon") return "review-due";
  return "current";
}

export function seal(input: Draft): RestaurantRecord {
  const r = { ...DEFAULTS, ...input };
  const thinFields = DEPTH_FIELDS.filter((k) => isThin(String(r[k] ?? "")));
  const unknownList = r.unknownList ?? [];
  const region = r.region ?? `${r.city}, ${r.stateProvince}`;
  const hasPhone = Boolean(r.phone && r.phone !== "Not stated");
  const today = todayISO();
  // An explicitly authored status still wins: a human who marked a record
  // "under review" knows something the calendar does not.
  const reviewStatus = input.reviewStatus ?? deriveReviewStatus(r.nextReviewAt, today);
  const reviewDueSoon = reviewStatus === "due-soon";
  const freshnessStatus = deriveFreshness(input.freshnessStatus, reviewStatus);
  const depthTotal = DEPTH_FIELDS.length;
  const depthFilled = depthTotal - thinFields.length;
  const searchText = [
    r.title,
    region,
    r.cuisineTags.join(" "),
    r.cuisineContext,
    r.serviceSummary,
    r.occasionFit,
    r.serviceStyles.join(" "),
    r.groupFitTags.join(" "),
  ]
    .join(" ")
    .toLowerCase();

  const checklist = r.checklist?.length
    ? r.checklist
    : [
        "Confirm hours and last seating for the exact date.",
        "Confirm the current menu and per-guest price, including service charge.",
        "Confirm cancellation window, deposit, and late policy.",
        unknownList[0] ? `Resolve: ${unknownList[0]}.` : "Ask any unstated access or dietary question that bears on your party.",
      ];

  return {
    ...(r as RestaurantRecord),
    region,
    hasPhone,
    reviewStatus,
    reviewDueSoon,
    freshnessStatus,
    unknownList,
    unknownsCount: unknownList.length,
    thinFields: [...thinFields],
    thinFieldCount: thinFields.length,
    depthFilled,
    depthTotal,
    searchText,
    checklist,
    hasOfficialConflict: Boolean(r.conflict),
  };
}
