/**
 * SALTY HANDOFF v2 — encode, decode, validate, describe.
 *
 * VENDORED FILE — byte-identical in all four Salty & Clever apps. See contract.ts.
 * No imports beyond ./contract.ts so it drops into any app unchanged.
 *
 * TRANSPORT: the packet rides in the URL fragment (#sh=...). A fragment is not
 * sent to the server as part of the HTTP request, so nothing here is written to
 * an access log or a referrer header. It is read on the client, validated,
 * previewed for the user, applied only on confirmation, and then wiped from the
 * address bar with history.replaceState so a back button or a shared link does
 * not silently re-apply it.
 */

import {
  DECISION_STATUSES,
  FAILURE_MESSAGES,
  HANDOFF_HASH_KEY,
  HANDOFF_VERSION,
  INTENTS,
  MAX_PACKET_AGE_MS,
  MAX_PACKET_BYTES,
  PROHIBITED_FIELDS,
  STRESS_BANDS,
  SUPPORTED_VERSIONS,
  TIMING_WINDOWS,
  URGENCIES,
  APP_LABELS,
  APP_ORIGINS,
  type AvailabilityBlock,
  type DecisionBlock,
  type DecisionStatus,
  type HandoffIntent,
  type HandoffResult,
  type MenuBlock,
  type OccasionBlock,
  type SaltyApp,
  type SaltyHandoff,
  type StressBand,
  type TimingWindow,
  type Urgency,
} from "./contract.ts";

const APPS: readonly SaltyApp[] = ["desk", "kitchen", "occasion", "restaurant"];

/* ── base64url, working in both the browser and node ───────────────────────── */

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i] as number);
  const g = globalThis as { btoa?: (s: string) => string };
  if (typeof g.btoa === "function") return g.btoa(binary);
  return Buffer.from(bytes).toString("base64");
}

function base64ToBytes(b64: string): Uint8Array {
  const g = globalThis as { atob?: (s: string) => string };
  if (typeof g.atob === "function") {
    const binary = g.atob(b64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(b64, "base64"));
}

export function encodeBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeBase64Url(token: string): string {
  const pad = token.length % 4 === 0 ? "" : "=".repeat(4 - (token.length % 4));
  const b64 = token.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return new TextDecoder("utf-8", { fatal: true }).decode(base64ToBytes(b64));
}

/* ── prohibited-field scan ─────────────────────────────────────────────────── */

const normalizeKey = (key: string) => key.toLowerCase().replace(/[_-]/g, "");
const PROHIBITED = new Set(PROHIBITED_FIELDS.map(normalizeKey));

/** Depth-first scan. Returns the first prohibited key found, or null. */
export function findProhibitedField(value: unknown, depth = 0): string | null {
  if (depth > 8 || value === null || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const hit = findProhibitedField(entry, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (PROHIBITED.has(normalizeKey(key))) return key;
    const hit = findProhibitedField(child, depth + 1);
    if (hit) return hit;
  }
  return null;
}

/* ── coercion helpers ──────────────────────────────────────────────────────── */

const str = (v: unknown, max = 120): string | undefined =>
  typeof v === "string" && v.trim() !== "" ? v.trim().slice(0, max) : undefined;

const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | undefined =>
  typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;

const posInt = (v: unknown, max: number): number | undefined =>
  typeof v === "number" && Number.isFinite(v) && v > 0 && v <= max ? Math.round(v) : undefined;

const bool = (v: unknown): boolean | undefined => (typeof v === "boolean" ? v : undefined);

const isoDate = (v: unknown): string | undefined =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;

const clockTime = (v: unknown): string | undefined =>
  typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : undefined;

const strList = (v: unknown, maxItems: number, maxLen = 120): string[] | undefined => {
  if (!Array.isArray(v)) return undefined;
  const out = v.map((e) => str(e, maxLen)).filter((e): e is string => Boolean(e)).slice(0, maxItems);
  return out.length ? out : undefined;
};

const obj = (v: unknown): Record<string, unknown> | undefined =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;

/** Assign only when defined, so exactOptionalPropertyTypes stays satisfied. */
function put<T extends object, K extends keyof T>(target: T, key: K, value: T[K] | undefined) {
  if (value !== undefined) target[key] = value;
}

/* ── block parsers ─────────────────────────────────────────────────────────── */

function parseAvailability(raw: unknown): AvailabilityBlock | undefined {
  const o = obj(raw);
  if (!o) return undefined;
  const rawItems = Array.isArray(o["items"]) ? (o["items"] as unknown[]) : [];
  const items: AvailabilityBlock["items"] = [];
  for (const entry of rawItems.slice(0, 60)) {
    const e = obj(entry);
    const name = str(e?.["name"], 60);
    if (!name) continue;
    const item: AvailabilityBlock["items"][number] = { name };
    put(item, "qty", str(e?.["qty"], 24));
    put(item, "urgency", oneOf<Urgency>(e?.["urgency"], URGENCIES));
    items.push(item);
  }
  if (!items.length) return undefined;
  const block: AvailabilityBlock = { items };
  put(block, "summary", str(o["summary"], 160));
  return block;
}

function parseMenu(raw: unknown): MenuBlock | undefined {
  const o = obj(raw);
  if (!o) return undefined;
  const rawRoles = Array.isArray(o["roles"]) ? (o["roles"] as unknown[]) : [];
  const roles: MenuBlock["roles"] = [];
  for (const entry of rawRoles.slice(0, 12)) {
    const e = obj(entry);
    const role = str(e?.["role"], 32);
    const dish = str(e?.["dish"], 80);
    if (role && dish) roles.push({ role, dish });
  }
  if (!roles.length) return undefined;
  const block: MenuBlock = { roles };
  put(block, "anchor", str(o["anchor"], 80));
  const s = obj(o["stress"]);
  const band = oneOf<StressBand>(s?.["band"], STRESS_BANDS);
  if (band) {
    const stress: NonNullable<MenuBlock["stress"]> = { band };
    put(stress, "weak", strList(s?.["weak"], 5, 40));
    block.stress = stress;
  }
  return block;
}

function parseOccasion(raw: unknown): OccasionBlock | undefined {
  const o = obj(raw);
  if (!o) return undefined;
  const block: OccasionBlock = {};
  put(block, "type", str(o["type"], 60));
  put(block, "serviceStyle", str(o["serviceStyle"], 40));
  put(block, "diet", strList(o["diet"], 12, 40));
  put(block, "region", str(o["region"], 60));
  return Object.keys(block).length ? block : undefined;
}

function parseDecision(raw: unknown): DecisionBlock | undefined {
  const o = obj(raw);
  if (!o) return undefined;
  const block: DecisionBlock = {};
  put(block, "room", str(o["room"], 80));
  put(block, "status", oneOf<DecisionStatus>(o["status"], DECISION_STATUSES));
  put(block, "unresolved", strList(o["unresolved"], 8, 140));
  return Object.keys(block).length ? block : undefined;
}

/* ── the validator ─────────────────────────────────────────────────────────── */

const KNOWN_TOP = new Set([
  "v", "from", "to", "at", "intent", "party", "timing", "constraint",
  "availability", "menu", "occasion", "decision",
]);

/**
 * Validate an already-parsed value against the contract.
 *
 * Unknown fields are dropped and reported in `dropped` — a packet from a future
 * build stays usable. PROHIBITED fields reject the whole packet: a privacy
 * breach is never something to silently repair.
 */
export function validateHandoff(
  value: unknown,
  expectedDestination?: SaltyApp,
  now: number = Date.now(),
): HandoffResult {
  const o = obj(value);
  if (!o) return { ok: false, reason: "malformed", message: FAILURE_MESSAGES.malformed };

  const prohibited = findProhibitedField(o);
  if (prohibited) {
    return { ok: false, reason: "prohibited-field", message: FAILURE_MESSAGES["prohibited-field"] };
  }

  const version = typeof o["v"] === "number" ? o["v"] : NaN;
  if (!SUPPORTED_VERSIONS.includes(version)) {
    return {
      ok: false,
      reason: "unsupported-version",
      message: FAILURE_MESSAGES["unsupported-version"],
    };
  }

  const from = oneOf<SaltyApp>(o["from"], APPS);
  const to = oneOf<SaltyApp>(o["to"], APPS);
  const intent = oneOf<HandoffIntent>(o["intent"], INTENTS);
  const at = str(o["at"], 40);
  if (!from || !to || !intent || !at || Number.isNaN(Date.parse(at))) {
    return { ok: false, reason: "malformed", message: FAILURE_MESSAGES.malformed };
  }
  if (from === to) {
    return { ok: false, reason: "malformed", message: FAILURE_MESSAGES.malformed };
  }
  if (expectedDestination && to !== expectedDestination) {
    return {
      ok: false,
      reason: "wrong-destination",
      message: FAILURE_MESSAGES["wrong-destination"],
    };
  }

  const handoff: SaltyHandoff = { v: HANDOFF_VERSION, from, to, at, intent };

  const partyRaw = obj(o["party"]);
  if (partyRaw) {
    const party: NonNullable<SaltyHandoff["party"]> = {};
    put(party, "size", posInt(partyRaw["size"], 200));
    put(party, "seatsKnown", bool(partyRaw["seatsKnown"]));
    if (Object.keys(party).length) handoff.party = party;
  }

  const timingRaw = obj(o["timing"]);
  if (timingRaw) {
    const timing: NonNullable<SaltyHandoff["timing"]> = {};
    put(timing, "date", isoDate(timingRaw["date"]));
    put(timing, "time", clockTime(timingRaw["time"]));
    put(timing, "window", oneOf<TimingWindow>(timingRaw["window"], TIMING_WINDOWS));
    if (Object.keys(timing).length) handoff.timing = timing;
  }

  put(handoff, "constraint", str(o["constraint"], 120));
  put(handoff, "availability", parseAvailability(o["availability"]));
  put(handoff, "menu", parseMenu(o["menu"]));
  put(handoff, "occasion", parseOccasion(o["occasion"]));
  put(handoff, "decision", parseDecision(o["decision"]));

  const dropped = Object.keys(o).filter((k) => !KNOWN_TOP.has(k));
  const stale = now - Date.parse(at) > MAX_PACKET_AGE_MS;

  return { ok: true, handoff, dropped, stale };
}

/* ── encode / decode ───────────────────────────────────────────────────────── */

export function encodeHandoff(handoff: SaltyHandoff): string {
  return encodeBase64Url(JSON.stringify(handoff));
}

/** Decode a fragment token. Never throws. */
export function decodeHandoff(
  token: string,
  expectedDestination?: SaltyApp,
  now: number = Date.now(),
): HandoffResult {
  if (!token) return { ok: false, reason: "absent", message: FAILURE_MESSAGES.absent };
  if (token.length > MAX_PACKET_BYTES * 2) {
    return { ok: false, reason: "too-large", message: FAILURE_MESSAGES["too-large"] };
  }
  let json: string;
  try {
    json = decodeBase64Url(token);
  } catch {
    return { ok: false, reason: "corrupt", message: FAILURE_MESSAGES.corrupt };
  }
  if (json.length > MAX_PACKET_BYTES) {
    return { ok: false, reason: "too-large", message: FAILURE_MESSAGES["too-large"] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, reason: "corrupt", message: FAILURE_MESSAGES.corrupt };
  }
  return validateHandoff(parsed, expectedDestination, now);
}

/** Build the destination URL that carries this handoff. */
export function handoffUrl(handoff: SaltyHandoff, path = "/"): string {
  const origin = APP_ORIGINS[handoff.to];
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${origin}${suffix}#${HANDOFF_HASH_KEY}=${encodeHandoff(handoff)}`;
}

/* ── browser entry / exit ──────────────────────────────────────────────────── */

export function readHandoffToken(hash: string): string {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return "";
  const direct = new RegExp(`(?:^|&)${HANDOFF_HASH_KEY}=([^&]+)`).exec(raw);
  return direct?.[1] ?? "";
}

/** Read and validate whatever the address bar is carrying. Never throws. */
export function readHandoffFromLocation(
  destination: SaltyApp,
  now: number = Date.now(),
): HandoffResult {
  if (typeof window === "undefined") {
    return { ok: false, reason: "absent", message: FAILURE_MESSAGES.absent };
  }
  try {
    const token = readHandoffToken(window.location.hash);
    if (!token) return { ok: false, reason: "absent", message: FAILURE_MESSAGES.absent };
    return decodeHandoff(token, destination, now);
  } catch {
    return { ok: false, reason: "corrupt", message: FAILURE_MESSAGES.corrupt };
  }
}

/**
 * Wipe the packet from the address bar without adding a history entry, so the
 * back button and any copied link cannot silently re-apply it.
 */
export function clearHandoffFromUrl(): void {
  if (typeof window === "undefined" || !window.history?.replaceState) return;
  try {
    const raw = window.location.hash.replace(/^#/, "");
    const kept = raw
      .split("&")
      .filter((part) => part !== "" && !part.startsWith(`${HANDOFF_HASH_KEY}=`))
      .join("&");
    const url = `${window.location.pathname}${window.location.search}${kept ? `#${kept}` : ""}`;
    window.history.replaceState(window.history.state, "", url);
  } catch {
    /* address bar is cosmetic here — never break the app over it */
  }
}

/* ── human-readable summary ────────────────────────────────────────────────── */

const INTENT_PHRASES: Record<HandoffIntent, string> = {
  host: "hosting at home",
  "dine-out": "eating out",
  "cook-from-pantry": "cooking from what's in the house",
  undecided: "still deciding",
  "return-decision": "a decision coming back",
};

function describeDate(timing: NonNullable<SaltyHandoff["timing"]>): string | null {
  if (timing.date) {
    const parsed = new Date(`${timing.date}T12:00:00`);
    if (!Number.isNaN(parsed.getTime())) {
      const day = parsed.toLocaleDateString("en-US", { weekday: "long" });
      return timing.time ? `${day} at ${timing.time}` : day;
    }
  }
  if (timing.window === "tonight") return "tonight";
  if (timing.window === "days") return "in a few days";
  if (timing.window === "weeks") return "a few weeks out";
  return null;
}

/**
 * The line shown in the import panel, e.g.
 * "From Salty Desk: hosting at home · 6 guests · Saturday · service load is the main constraint."
 * Plain language only — no version numbers, no field names.
 */
export function describeHandoff(handoff: SaltyHandoff): string {
  const parts: string[] = [INTENT_PHRASES[handoff.intent]];

  if (handoff.party?.size) {
    parts.push(`${handoff.party.size} ${handoff.party.size === 1 ? "guest" : "guests"}`);
  }
  if (handoff.timing) {
    const when = describeDate(handoff.timing);
    if (when) parts.push(when);
  }
  if (handoff.occasion?.type) parts.push(handoff.occasion.type);
  if (handoff.occasion?.region) parts.push(handoff.occasion.region);
  if (handoff.availability?.items.length) {
    const n = handoff.availability.items.length;
    parts.push(`${n} confirmed ${n === 1 ? "item" : "items"}`);
  }
  if (handoff.menu?.roles.length) {
    parts.push(`${handoff.menu.roles.length}-course menu`);
  }
  if (handoff.decision?.room) parts.push(handoff.decision.room);
  if (handoff.constraint) parts.push(`${handoff.constraint} is the main constraint`);

  return `From ${APP_LABELS[handoff.from]}: ${parts.join(" · ")}.`;
}

/** Itemised list for the import preview, so nothing arrives unseen. */
export function summarizeHandoff(handoff: SaltyHandoff): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  rows.push({ label: "Plan", value: INTENT_PHRASES[handoff.intent] });
  if (handoff.party?.size) rows.push({ label: "At the table", value: String(handoff.party.size) });
  if (handoff.timing) {
    const when = describeDate(handoff.timing);
    if (when) rows.push({ label: "When", value: when });
  }
  if (handoff.occasion?.type) rows.push({ label: "Occasion", value: handoff.occasion.type });
  if (handoff.occasion?.serviceStyle) {
    rows.push({ label: "Service", value: handoff.occasion.serviceStyle });
  }
  if (handoff.occasion?.region) rows.push({ label: "Where", value: handoff.occasion.region });
  if (handoff.occasion?.diet?.length) {
    rows.push({ label: "Dietary", value: handoff.occasion.diet.join(", ") });
  }
  if (handoff.availability?.items.length) {
    rows.push({
      label: "Confirmed items",
      value:
        handoff.availability.summary ??
        handoff.availability.items.slice(0, 6).map((i) => i.name).join(", "),
    });
  }
  if (handoff.menu?.roles.length) {
    rows.push({ label: "Menu", value: handoff.menu.roles.map((r) => r.dish).join(", ") });
  }
  if (handoff.menu?.anchor) rows.push({ label: "Anchor", value: handoff.menu.anchor });
  if (handoff.menu?.stress) rows.push({ label: "Service load", value: handoff.menu.stress.band });
  if (handoff.decision?.room) rows.push({ label: "Room", value: handoff.decision.room });
  if (handoff.decision?.status) rows.push({ label: "Status", value: handoff.decision.status });
  if (handoff.decision?.unresolved?.length) {
    rows.push({ label: "Still to confirm", value: handoff.decision.unresolved.join(" · ") });
  }
  if (handoff.constraint) rows.push({ label: "Main constraint", value: handoff.constraint });
  return rows;
}

/** Convenience builder that always stamps a valid envelope. */
export function createHandoff(
  from: SaltyApp,
  to: SaltyApp,
  intent: HandoffIntent,
  body: Omit<SaltyHandoff, "v" | "from" | "to" | "at" | "intent"> = {},
): SaltyHandoff {
  return { v: HANDOFF_VERSION, from, to, at: new Date().toISOString(), intent, ...body };
}
