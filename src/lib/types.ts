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
export const DAYPARTS = [
  "Brunch/breakfast language",
  "Lunch language",
  "Dinner language",
  "Late/bar language",
] as const;
export const SPEND_BANDS = [
  "Everyday",
  "Moderate planning band",
  "Premium planning band",
  "Conflicted price band",
] as const;

export type Freshness =
  | "verified"
  | "current"
  | "review-due"
  | "stale"
  | "under-review"
  | "conflicting"
  | "incomplete"
  | "unknown";

export type Signals = {
  commitment?: string;
  booking?: string;
  confirm?: string;
  flexibility?: string;
  party?: string;
  pacing?: string;
  wine?: string;
  energy?: string;
  private?: string;
};

export type RestaurantRecord = {
  slug: string;
  title: string;
  recordId: string;
  city: string;
  stateProvince: string;
  region: string;
  regionGroup: string;
  address: string;
  phone: string;
  email: string;
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
  tableTimeMinutes: number | null;
  bookingLeadDays: number | null;
  dietaryAdvanceNoticeDays: number | null;
  maxOnlineParty: number | null;
  unknownList: string[];
  conflict: string;
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
  planningLoad: string;
  hasPhone: boolean;
  hasOfficialConflict: boolean;
  reviewedAt: string;
  nextReviewAt: string;
  reviewStatus: "current" | "due-soon" | "overdue";
  reviewDueSoon: boolean;
  freshnessStatus: Freshness;
  hoursFreshness: Freshness;
  priceFreshness: Freshness;
  cancellationFreshness: Freshness;
  dietaryFreshness: Freshness;
  accessFreshness: Freshness;
  sourceAuthority: string;
  confidence: string;
  fieldVolatility: string;
  disclaimer: string;
  sources: string[];
  officialSource: string;
  retrievedAt: string;
  version: string;
  unknownsCount: number;
  thinFieldCount: number;
  thinFields: string[];
  depthFilled: number;
  depthTotal: number;
  checklist: string[];
  searchText: string;
};

export type Situation = {
  occasion: Occasion | null;
  partySize: number | null;
  leadDays: number | null;
  nightDate: string | null;
  nightTime: string | null;
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
};

export const emptySituation: Situation = {
  occasion: null,
  partySize: null,
  leadDays: null,
  nightDate: null,
  nightTime: null,
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
};

export type FindingLayer = "critical" | "watch" | "unknown";

export type Finding = {
  id: string;
  layer: FindingLayer;
  domain: string;
  title: string;
  detail: string;
  action: string;
  impact: number;
  confidence: "high" | "moderate" | "low";
  situational: boolean;
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
  blocked: boolean;
};

export type Brief = {
  verdict: string;
  verdictTone: "clear" | "conditional" | "hold";
  fitLine: string;
  riskLine: string;
  burdenLine: string;
  nextAction: string;
  confirmCalls: string[];
};

export type ConfirmStatus = "open" | "confirmed" | "denied" | "not-applicable" | "still-unknown";
export type ConfirmPriority = "must" | "should" | "if-relevant";
export type ConfirmCategory =
  | "hours"
  | "menu-price"
  | "reservation"
  | "cancellation"
  | "dietary"
  | "access"
  | "pacing"
  | "party"
  | "conflict"
  | "environment"
  | "beverage";

export type ConfirmItem = {
  id: string;
  category: ConfirmCategory;
  priority: ConfirmPriority;
  question: string;
  why: string;
  evidence: string;
  volatility: "volatile" | "stable" | "unknown";
  status: ConfirmStatus;
  answer: string;
  askedOf: string;
};

export type ReservationCapture = {
  confirmationNumber: string;
  dateConfirmed: string;
  contactPerson: string;
  channel: "" | "phone" | "opentable" | "resy" | "tock" | "direct" | "email" | "walk-in";
  reservationDate: string;
  reservationTime: string;
  partySizeConfirmed: number | null;
  cancellationDeadline: string;
  depositAmount: string;
  notes: string;
};

export type PassStatus = "in-progress" | "hold" | "verified" | "abandoned";

export type ConfirmationPass = {
  id: string;
  slug: string;
  restaurantTitle: string;
  nightId: string;
  createdAt: string;
  updatedAt: string;
  situation: Situation;
  items: ConfirmItem[];
  capture: ReservationCapture;
  status: PassStatus;
  holdReasons: string[];
};

export type SavedNight = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  situation: Situation;
  shortlist: string[];
  compare: string[];
  pinned: boolean;
};

export const CORPUS = {
  generatedAt: "2026-08-27",
  source: "First-party restaurant sites, menus, reservation pages. Direct-call fields marked when used.",
  workingSetNote:
    "A smaller confirmation-complete working set. Thin coverage is worse than an honest file.",
} as const;
