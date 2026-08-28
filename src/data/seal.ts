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
  reviewStatus: "current",
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

export function seal(input: Draft): RestaurantRecord {
  const r = { ...DEFAULTS, ...input };
  const thinFields = DEPTH_FIELDS.filter((k) => isThin(String(r[k] ?? "")));
  const unknownList = r.unknownList ?? [];
  const region = r.region ?? `${r.city}, ${r.stateProvince}`;
  const hasPhone = Boolean(r.phone && r.phone !== "Not stated");
  const reviewDueSoon = r.reviewStatus === "due-soon";
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
    reviewDueSoon,
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
