/**
 * SALTY HANDOFF v2 — shared continuity contract.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS FILE IS VENDORED. It is byte-identical in every Salty & Clever app:
 *
 *   salty-command-center            src/lib/salty-handoff/contract.ts
 *   salty-kitchen-bar-intelligence  src/lib/salty-handoff/contract.ts
 *   occasion-planner-suite          src/lib/salty-handoff/contract.ts
 *   deep-dish-decision              src/lib/salty-handoff/contract.ts
 *
 * The apps deploy independently, so there is no package to depend on. Copy the
 * whole file when it changes and run the parity test in each repo. It has no
 * imports on purpose: it must drop into any of the four apps unchanged.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * DESIGN RULES
 *  1. Small. A handoff carries the decision, not the application's state.
 *  2. Public-safe. Nothing here should embarrass anyone if pasted into a chat.
 *  3. Explicit. A packet is built when a user asks for it and applied when a
 *     user confirms it. There is no background sync anywhere in this suite.
 *  4. Fail safe. A bad packet is ignored and the app continues normally.
 *  5. Forward tolerant / privacy strict. Unknown fields are dropped in silence;
 *     PROHIBITED fields reject the whole packet loudly.
 */

export const HANDOFF_VERSION = 2 as const;

/** Versions this build can read. Older packets keep working. */
export const SUPPORTED_VERSIONS: readonly number[] = [2];

/** URL fragment key. Fragments are never sent to the server in an HTTP request. */
export const HANDOFF_HASH_KEY = "sh";

/** Decoded JSON larger than this is refused before it is parsed. */
export const MAX_PACKET_BYTES = 4096;

/** A packet older than this is offered as stale rather than applied. */
export const MAX_PACKET_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type SaltyApp = "desk" | "kitchen" | "occasion" | "restaurant";

export const APP_LABELS: Record<SaltyApp, string> = {
  desk: "Salty Desk",
  kitchen: "Kitchen & Bar",
  occasion: "Occasion OS",
  restaurant: "Restaurant Intelligence",
};

export const APP_ORIGINS: Record<SaltyApp, string> = {
  desk: "https://salty.saltnotes.blog",
  kitchen: "https://kitchen.saltnotes.blog",
  occasion: "https://occasion.saltnotes.blog",
  restaurant: "https://deepdish.saltnotes.blog",
};

/** What the user is trying to do. Not a score, not an inference. */
export type HandoffIntent =
  | "host"
  | "dine-out"
  | "cook-from-pantry"
  | "undecided"
  | "return-decision";

export const INTENTS: readonly HandoffIntent[] = [
  "host",
  "dine-out",
  "cook-from-pantry",
  "undecided",
  "return-decision",
];

export type TimingWindow = "tonight" | "days" | "weeks";
export const TIMING_WINDOWS: readonly TimingWindow[] = ["tonight", "days", "weeks"];

export type StressBand = "strong" | "workable" | "fragile";
export const STRESS_BANDS: readonly StressBand[] = ["strong", "workable", "fragile"];

export type Urgency = "high" | "medium" | "low" | "none";
export const URGENCIES: readonly Urgency[] = ["high", "medium", "low", "none"];

export type DecisionStatus = "shortlisted" | "in-progress" | "hold" | "verified";
export const DECISION_STATUSES: readonly DecisionStatus[] = [
  "shortlisted",
  "in-progress",
  "hold",
  "verified",
];

export interface HandoffParty {
  /** Number at the table. Never a guest list. */
  size?: number;
  seatsKnown?: boolean;
}

export interface HandoffTiming {
  /** ISO yyyy-mm-dd. */
  date?: string;
  /** 24h HH:mm. */
  time?: string;
  window?: TimingWindow;
}

/** Kitchen & Bar → Occasion OS. Confirmed shelf only — never raw detections. */
export interface AvailabilityBlock {
  items: { name: string; qty?: string; urgency?: Urgency }[];
  /** e.g. "18 confirmed items · 3 near expiry". Shown when the list is long. */
  summary?: string;
}

/** Architecture → Plan, inside Occasion OS. The menu that survived, nothing else. */
export interface MenuBlock {
  roles: { role: string; dish: string }[];
  anchor?: string;
  stress?: { band: StressBand; weak?: string[] };
}

/** Desk/Occasion → Restaurant Intelligence. Ranking inputs only. */
export interface OccasionBlock {
  type?: string;
  serviceStyle?: string;
  /** Planning-level categories. Never an allergy guarantee. See DIET_DISCLAIMER. */
  diet?: string[];
  /** Approximate region, e.g. "Denver metro". Never an address or coordinates. */
  region?: string;
}

/** Restaurant Intelligence → Desk. The conclusion, not the browsing history. */
export interface DecisionBlock {
  /** The single room the user chose to return. Never a shortlist or rejections. */
  room?: string;
  status?: DecisionStatus;
  /** Confirmations the user still owes. Short questions, not evidence dumps. */
  unresolved?: string[];
}

export interface SaltyHandoff {
  v: typeof HANDOFF_VERSION;
  from: SaltyApp;
  to: SaltyApp;
  /** ISO timestamp, used only for staleness. */
  at: string;
  intent: HandoffIntent;
  party?: HandoffParty;
  timing?: HandoffTiming;
  /** One short human phrase, e.g. "service load". Not a paragraph, not a note. */
  constraint?: string;
  availability?: AvailabilityBlock;
  menu?: MenuBlock;
  occasion?: OccasionBlock;
  decision?: DecisionBlock;
}

export const DIET_DISCLAIMER =
  "Dietary categories travel as planning filters. They are never an allergy guarantee — confirm ingredients and cross-contact directly.";

/**
 * Field names that must never appear anywhere in a packet, at any depth.
 * Matching is case-insensitive and ignores _ and - so guest_names, guestNames
 * and guest-names all reject. A hit rejects the whole packet.
 */
export const PROHIBITED_FIELDS: readonly string[] = [
  "guestname",
  "guestnames",
  "guestlist",
  "attendees",
  "privatenote",
  "privatenotes",
  "usernotes",
  "note",
  "notes",
  "allergen",
  "allergens",
  "allergy",
  "allergies",
  "declaredallergens",
  "medical",
  "medicalhistory",
  "detection",
  "detections",
  "candidates",
  "rejected",
  "discarded",
  "drafts",
  "history",
  "reasoning",
  "shortlist",
  "shoppinglist",
  "shoppinghistory",
  "prepschedule",
  "preproute",
  "email",
  "phone",
  "address",
  "coordinates",
  "lat",
  "lng",
  "token",
  "password",
  "recipes",
  "pricing",
  "nutrition",
];

export type HandoffFailure =
  | "absent"
  | "corrupt"
  | "too-large"
  | "malformed"
  | "unsupported-version"
  | "wrong-destination"
  | "prohibited-field"
  | "stale";

export type HandoffResult =
  | { ok: true; handoff: SaltyHandoff; dropped: string[]; stale: boolean }
  | { ok: false; reason: HandoffFailure; message: string };

/** Short, plain-language messages. No implementation vocabulary reaches a user. */
export const FAILURE_MESSAGES: Record<HandoffFailure, string> = {
  absent: "",
  corrupt: "That link didn't carry any context we could read. Starting fresh.",
  "too-large": "That link carried more than we bring across. Starting fresh.",
  malformed: "That link didn't carry any context we could read. Starting fresh.",
  "unsupported-version":
    "That context came from a newer version of the suite. Starting fresh here.",
  "wrong-destination": "That context was meant for a different tool. Starting fresh here.",
  "prohibited-field": "That link carried more than we bring across. Starting fresh.",
  stale: "That context is more than a week old.",
};
