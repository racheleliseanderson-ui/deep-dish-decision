/**
 * SALTY NIGHT RECORD — the small continuity object the suite passes in `#nr=`.
 *
 * TRANSPORT RULES. Read these before copying this file into a sibling repo.
 * The stored record and the travelling record are not the same object.
 *
 *  1. PROJECT BEFORE YOU SEND. Only `transportSafeNightRecord()` may be
 *     serialised into a URL. It drops `home` (region, default party size,
 *     service style) and `restaurant.unresolved` outright, and truncates every
 *     free-text field to 120 characters. Local storage may keep more; the wire
 *     may not.
 *  2. HARD SIZE CAP. `NIGHT_MAX_BYTES` (2048) is a refusal, not a target. Over
 *     the cap the optional summaries are dropped and it is re-serialised; still
 *     over, the link is emitted with no `#nr=` at all. A link never grows to fit
 *     the record.
 *  3. CLEAN THE ADDRESS BAR. An absorbed record is stripped from the fragment
 *     with `history.replaceState`, the way the handoff codec strips `#sh=`, so
 *     the back button and any copied link cannot silently re-apply it.
 *  4. NO FREE TEXT THE READER DID NOT MEAN TO SEND. Notes, guest names,
 *     addresses and allergen claims never belong here — the `#sh=` handoff
 *     rejects them outright, and this channel must not become the way around it.
 */

import { decodeHandoff } from "./salty-handoff/codec.ts";
import { APP_LABELS, APP_ORIGINS, type SaltyApp, type SaltyHandoff } from "./salty-handoff/contract.ts";

export const NIGHT_RECORD_VERSION = 1 as const;
export const NIGHT_RECORD_STORAGE_KEY = "salty-night-record-v1";
export const NIGHT_HISTORY_STORAGE_KEY = "salty-night-history-v1";
export const HOME_PROFILE_STORAGE_KEY = "salty-home-profile-v1";
export const NIGHT_HASH_KEY = "nr";

/** A serialised night record larger than this never travels. Rule 2 above. */
export const NIGHT_MAX_BYTES = 2048;

/** Every free-text field is cut to this before it leaves the origin. */
const NIGHT_FIELD_MAX = 120;

export type NightState =
  | "deciding"
  | "cooking"
  | "building-menu"
  | "planning"
  | "hosting"
  | "choosing-restaurant"
  | "confirming"
  | "done";

export type NightResume = { app: SaltyApp; url: string; label: string };

export type SaltyHomeProfile = {
  region?: string | undefined;
  defaultPartySize?: number | undefined;
  serviceStyle?: string | undefined;
  kitchenNote?: string | undefined;
  updatedAt: string;
};

export type SaltyNightRecord = {
  v: typeof NIGHT_RECORD_VERSION;
  id: string;
  startedAt: string;
  updatedAt: string;
  decision: string;
  state: NightState;
  currentApp: SaltyApp;
  nextStep: string;
  resume: NightResume;
  partySize?: number | undefined;
  timing?: { date?: string | undefined; time?: string | undefined; window?: "tonight" | "days" | "weeks" | undefined } | undefined;
  constraint?: string | undefined;
  shelfSummary?: string | undefined;
  menuSummary?: string | undefined;
  restaurant?: {
    room?: string | undefined;
    status?: "shortlisted" | "in-progress" | "hold" | "verified" | undefined;
    unresolved?: string[] | undefined;
  } | undefined;
  home?: {
    region?: string | undefined;
    defaultPartySize?: number | undefined;
    serviceStyle?: string | undefined;
  } | undefined;
};

function nowIso() {
  return new Date().toISOString();
}

function makeId() {
  return `night-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function stateFor(app: SaltyApp, handoff?: SaltyHandoff): NightState {
  if (handoff?.intent === "return-decision") return "confirming";
  if (app === "kitchen") return "cooking";
  if (app === "occasion") return handoff?.menu ? "planning" : "building-menu";
  if (app === "restaurant") return "choosing-restaurant";
  return "deciding";
}

function decisionFor(handoff?: SaltyHandoff) {
  if (!handoff) return "Decide what happens tonight";
  if (handoff.intent === "cook-from-pantry") return "Cook from what I have";
  if (handoff.intent === "dine-out") return "Choose a restaurant for this night";
  if (handoff.intent === "undecided") return "Decide whether to host or dine out";
  if (handoff.intent === "return-decision" && handoff.decision?.room)
    return `Finish the decision for ${handoff.decision.room}`;
  if (handoff.menu) return "Run the menu and the night";
  return "Host this night";
}

function nextFor(app: SaltyApp, handoff?: SaltyHandoff) {
  if (app === "kitchen") return "Turn the confirmed shelf into tonight's useful options.";
  if (app === "occasion") return "Build the first workable plan, then refine only what is tight.";
  if (app === "restaurant") return "Rank the room, surface the unknowns, then confirm what matters.";
  if (handoff?.decision?.unresolved?.length) return "Confirm the open questions before treating the room as booked.";
  if (handoff?.decision?.room) return "Confirm live details, book if they hold, then close the night.";
  return "Choose the next specialist and carry only the context it needs.";
}

export function startNightRecord(input: {
  decision: string;
  currentApp: SaltyApp;
  state?: NightState | undefined;
  nextStep?: string | undefined;
  resumeUrl?: string | undefined;
  partySize?: number | undefined;
  constraint?: string | undefined;
  timing?: SaltyNightRecord["timing"] | undefined;
  home?: SaltyNightRecord["home"] | undefined;
}): SaltyNightRecord {
  const at = nowIso();
  return {
    v: NIGHT_RECORD_VERSION,
    id: makeId(),
    startedAt: at,
    updatedAt: at,
    decision: input.decision,
    state: input.state ?? stateFor(input.currentApp),
    currentApp: input.currentApp,
    nextStep: input.nextStep ?? nextFor(input.currentApp),
    resume: {
      app: input.currentApp,
      url: input.resumeUrl ?? `${APP_ORIGINS[input.currentApp]}/`,
      label: `Continue in ${APP_LABELS[input.currentApp]}`,
    },
    ...(input.partySize ? { partySize: input.partySize } : {}),
    ...(input.constraint ? { constraint: input.constraint } : {}),
    ...(input.timing ? { timing: input.timing } : {}),
    ...(input.home ? { home: input.home } : {}),
  };
}

export function mergeNightFromHandoff(
  existing: SaltyNightRecord | null,
  handoff: SaltyHandoff,
  currentApp: SaltyApp,
): SaltyNightRecord {
  const base = existing ?? startNightRecord({ decision: decisionFor(handoff), currentApp });
  return {
    ...base,
    updatedAt: nowIso(),
    decision: existing?.decision || decisionFor(handoff),
    state: stateFor(currentApp, handoff),
    currentApp,
    nextStep: nextFor(currentApp, handoff),
    resume: {
      app: currentApp,
      url: `${APP_ORIGINS[currentApp]}/`,
      label: `Continue in ${APP_LABELS[currentApp]}`,
    },
    partySize: handoff.party?.size ?? base.partySize,
    timing: handoff.timing ? { ...base.timing, ...handoff.timing } : base.timing,
    constraint: handoff.constraint ?? base.constraint,
    shelfSummary: handoff.availability?.summary ?? base.shelfSummary,
    menuSummary: handoff.menu?.anchor ?? base.menuSummary,
    restaurant: handoff.decision
      ? {
          room: handoff.decision.room,
          status: handoff.decision.status,
          unresolved: handoff.decision.unresolved,
        }
      : base.restaurant,
  };
}

function isNightRecord(value: unknown): value is SaltyNightRecord {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<SaltyNightRecord>;
  return (
    row.v === NIGHT_RECORD_VERSION &&
    typeof row.id === "string" &&
    typeof row.decision === "string" &&
    typeof row.currentApp === "string" &&
    typeof row.nextStep === "string" &&
    Boolean(row.resume && typeof row.resume.url === "string")
  );
}

export function readNightRecord(): SaltyNightRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(NIGHT_RECORD_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isNightRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function readNightHistory(): SaltyNightRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(NIGHT_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isNightRecord).slice(0, 8) : [];
  } catch {
    return [];
  }
}

export function writeNightRecord(record: SaltyNightRecord | null) {
  if (typeof window === "undefined") return;
  try {
    if (!record) {
      window.localStorage.removeItem(NIGHT_RECORD_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(NIGHT_RECORD_STORAGE_KEY, JSON.stringify(record));
    const history = readNightHistory().filter((row) => row.id !== record.id);
    window.localStorage.setItem(
      NIGHT_HISTORY_STORAGE_KEY,
      JSON.stringify([{ ...record }, ...history].slice(0, 8)),
    );
  } catch {
    /* A storage failure must never stop the decision itself. */
  }
}

export function readHomeProfile(): SaltyHomeProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(HOME_PROFILE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SaltyHomeProfile;
    return parsed && typeof parsed.updatedAt === "string" ? parsed : null;
  } catch {
    return null;
  }
}

export function writeHomeProfile(profile: Omit<SaltyHomeProfile, "updatedAt">) {
  if (typeof window === "undefined") return;
  const next: SaltyHomeProfile = { ...profile, updatedAt: nowIso() };
  try {
    window.localStorage.setItem(HOME_PROFILE_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* Profile memory is optional; specialist work still functions without it. */
  }
}

const cut = (value: string | undefined, max = NIGHT_FIELD_MAX): string | undefined =>
  typeof value === "string" && value.trim() !== "" ? value.trim().slice(0, max) : undefined;

function byteLength(value: string): number {
  try {
    return new TextEncoder().encode(value).length;
  } catch {
    return value.length;
  }
}

/**
 * The only shape allowed onto the wire. `home` and `restaurant.unresolved` are
 * dropped, not truncated: neither has a reader job in the receiving app, and a
 * region plus a default party size is a profile, not a night.
 */
export function transportSafeNightRecord(
  record: SaltyNightRecord,
  withSummaries = true,
): SaltyNightRecord {
  const projection: SaltyNightRecord = {
    v: record.v,
    id: record.id,
    startedAt: record.startedAt,
    updatedAt: record.updatedAt,
    decision: cut(record.decision) ?? "",
    state: record.state,
    currentApp: record.currentApp,
    nextStep: cut(record.nextStep) ?? "",
    resume: record.resume,
    ...(record.partySize ? { partySize: record.partySize } : {}),
    ...(record.timing ? { timing: record.timing } : {}),
    ...(cut(record.constraint) ? { constraint: cut(record.constraint) } : {}),
  };

  if (withSummaries) {
    const shelf = cut(record.shelfSummary);
    const menu = cut(record.menuSummary);
    if (shelf) projection.shelfSummary = shelf;
    if (menu) projection.menuSummary = menu;
  }

  const room = cut(record.restaurant?.room);
  if (room || record.restaurant?.status) {
    projection.restaurant = {
      ...(room ? { room } : {}),
      ...(record.restaurant?.status ? { status: record.restaurant.status } : {}),
    };
  }

  return projection;
}

export function nightRecordUrl(url: string, record: SaltyNightRecord) {
  try {
    const target = new URL(url);
    let payload = JSON.stringify(transportSafeNightRecord(record));
    if (byteLength(payload) > NIGHT_MAX_BYTES) {
      payload = JSON.stringify(transportSafeNightRecord(record, false));
    }
    // Still over the cap: the link goes out bare rather than carrying a record
    // trimmed until it no longer means anything.
    if (byteLength(payload) > NIGHT_MAX_BYTES) return url;
    const hash = new URLSearchParams(target.hash.replace(/^#/, ""));
    hash.set(NIGHT_HASH_KEY, payload);
    target.hash = hash.toString();
    return target.toString();
  } catch {
    return url;
  }
}

/**
 * Wipe the night record from the address bar without adding a history entry, so
 * the back button and any copied link cannot silently re-apply it. Mirrors
 * clearHandoffFromUrl() in the handoff codec, and keeps every other fragment
 * part intact.
 */
export function clearNightFromUrl(): void {
  if (typeof window === "undefined" || !window.history?.replaceState) return;
  try {
    const raw = window.location.hash.replace(/^#/, "");
    const kept = raw
      .split("&")
      .filter((part) => part !== "" && !part.startsWith(`${NIGHT_HASH_KEY}=`))
      .join("&");
    const url = `${window.location.pathname}${window.location.search}${kept ? `#${kept}` : ""}`;
    window.history.replaceState(window.history.state, "", url);
  } catch {
    /* the address bar is cosmetic here — never break the night over it */
  }
}

export function readNightFromLocation(expectedApp: SaltyApp): SaltyNightRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const rawNight = hash.get(NIGHT_HASH_KEY);
    let record: SaltyNightRecord | null = null;
    if (rawNight) {
      const parsed = JSON.parse(rawNight);
      if (isNightRecord(parsed)) record = parsed;
    }
    const handoffToken = hash.get("sh");
    if (handoffToken) {
      const decoded = decodeHandoff(handoffToken, expectedApp);
      if (decoded.ok) record = mergeNightFromHandoff(record ?? readNightRecord(), decoded.handoff, expectedApp);
    }
    if (record) {
      // Strip the packet before the resume URL is read, so the record the reader
      // continues from does not carry a copy of itself in its own fragment.
      clearNightFromUrl();
      const next: SaltyNightRecord = {
        ...record,
        currentApp: expectedApp,
        updatedAt: nowIso(),
        resume: {
          app: expectedApp,
          url: window.location.href,
          label: `Continue in ${APP_LABELS[expectedApp]}`,
        },
      };
      writeNightRecord(next);
      return next;
    }
    return readNightRecord();
  } catch {
    return readNightRecord();
  }
}
