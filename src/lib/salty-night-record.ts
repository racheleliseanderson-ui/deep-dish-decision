import { decodeHandoff } from "./salty-handoff/codec.ts";
import { APP_ORIGINS, type SaltyApp, type SaltyHandoff } from "./salty-handoff/contract.ts";

export const NIGHT_RECORD_VERSION = 1 as const;
export const NIGHT_RECORD_STORAGE_KEY = "salty-night-record-v1";
export const NIGHT_HISTORY_STORAGE_KEY = "salty-night-history-v1";
export const HOME_PROFILE_STORAGE_KEY = "salty-home-profile-v1";
export const NIGHT_HASH_KEY = "nr";

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

const LABELS: Record<SaltyApp, string> = {
  desk: "Salty Desk",
  kitchen: "Kitchen & Bar",
  occasion: "Occasion",
  restaurant: "Restaurant Intelligence",
};

function nowIso() { return new Date().toISOString(); }
function makeId() { return `night-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }

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
  if (handoff.intent === "return-decision" && handoff.decision?.room) return `Finish the decision for ${handoff.decision.room}`;
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
    resume: { app: input.currentApp, url: input.resumeUrl ?? `${APP_ORIGINS[input.currentApp]}/`, label: `Continue in ${LABELS[input.currentApp]}` },
    ...(input.partySize ? { partySize: input.partySize } : {}),
    ...(input.constraint ? { constraint: input.constraint } : {}),
    ...(input.timing ? { timing: input.timing } : {}),
    ...(input.home ? { home: input.home } : {}),
  };
}

export function mergeNightFromHandoff(existing: SaltyNightRecord | null, handoff: SaltyHandoff, currentApp: SaltyApp): SaltyNightRecord {
  const base = existing ?? startNightRecord({ decision: decisionFor(handoff), currentApp });
  return {
    ...base,
    updatedAt: nowIso(),
    decision: existing?.decision || decisionFor(handoff),
    state: stateFor(currentApp, handoff),
    currentApp,
    nextStep: nextFor(currentApp, handoff),
    resume: { app: currentApp, url: `${APP_ORIGINS[currentApp]}/`, label: `Continue in ${LABELS[currentApp]}` },
    partySize: handoff.party?.size ?? base.partySize,
    timing: handoff.timing ? { ...base.timing, ...handoff.timing } : base.timing,
    constraint: handoff.constraint ?? base.constraint,
    shelfSummary: handoff.availability?.summary ?? base.shelfSummary,
    menuSummary: handoff.menu?.anchor ?? base.menuSummary,
    restaurant: handoff.decision ? { room: handoff.decision.room, status: handoff.decision.status, unresolved: handoff.decision.unresolved } : base.restaurant,
  };
}

function isNightRecord(value: unknown): value is SaltyNightRecord {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<SaltyNightRecord>;
  return row.v === NIGHT_RECORD_VERSION && typeof row.id === "string" && typeof row.decision === "string" && typeof row.currentApp === "string" && typeof row.nextStep === "string" && Boolean(row.resume && typeof row.resume.url === "string");
}

export function readNightRecord(): SaltyNightRecord | null {
  if (typeof window === "undefined") return null;
  try { const raw = window.localStorage.getItem(NIGHT_RECORD_STORAGE_KEY); if (!raw) return null; const parsed = JSON.parse(raw); return isNightRecord(parsed) ? parsed : null; } catch { return null; }
}

export function readNightHistory(): SaltyNightRecord[] {
  if (typeof window === "undefined") return [];
  try { const raw = window.localStorage.getItem(NIGHT_HISTORY_STORAGE_KEY); if (!raw) return []; const parsed = JSON.parse(raw); return Array.isArray(parsed) ? parsed.filter(isNightRecord).slice(0, 8) : []; } catch { return []; }
}

export function writeNightRecord(record: SaltyNightRecord | null) {
  if (typeof window === "undefined") return;
  try {
    if (!record) { window.localStorage.removeItem(NIGHT_RECORD_STORAGE_KEY); return; }
    window.localStorage.setItem(NIGHT_RECORD_STORAGE_KEY, JSON.stringify(record));
    const history = readNightHistory().filter((row) => row.id !== record.id);
    window.localStorage.setItem(NIGHT_HISTORY_STORAGE_KEY, JSON.stringify([{ ...record }, ...history].slice(0, 8)));
  } catch { /* A storage failure must never stop the decision itself. */ }
}

export function readHomeProfile(): SaltyHomeProfile | null {
  if (typeof window === "undefined") return null;
  try { const raw = window.localStorage.getItem(HOME_PROFILE_STORAGE_KEY); if (!raw) return null; const parsed = JSON.parse(raw) as SaltyHomeProfile; return parsed && typeof parsed.updatedAt === "string" ? parsed : null; } catch { return null; }
}

export function writeHomeProfile(profile: Omit<SaltyHomeProfile, "updatedAt">) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(HOME_PROFILE_STORAGE_KEY, JSON.stringify({ ...profile, updatedAt: nowIso() })); } catch { /* Profile memory is optional. */ }
}

export function nightRecordUrl(url: string, record: SaltyNightRecord) {
  try { const target = new URL(url); const hash = new URLSearchParams(target.hash.replace(/^#/, "")); hash.set(NIGHT_HASH_KEY, JSON.stringify(record)); target.hash = hash.toString(); return target.toString(); } catch { return url; }
}

export function readNightFromLocation(expectedApp: SaltyApp): SaltyNightRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const rawNight = hash.get(NIGHT_HASH_KEY);
    let record: SaltyNightRecord | null = null;
    if (rawNight) { const parsed = JSON.parse(rawNight); if (isNightRecord(parsed)) record = parsed; }
    const handoffToken = hash.get("sh");
    if (handoffToken) { const decoded = decodeHandoff(handoffToken, expectedApp); if (decoded.ok) record = mergeNightFromHandoff(record ?? readNightRecord(), decoded.handoff, expectedApp); }
    if (record) {
      const next: SaltyNightRecord = { ...record, currentApp: expectedApp, updatedAt: nowIso(), resume: { app: expectedApp, url: window.location.href, label: `Continue in ${LABELS[expectedApp]}` } };
      writeNightRecord(next);
      return next;
    }
    return readNightRecord();
  } catch { return readNightRecord(); }
}
