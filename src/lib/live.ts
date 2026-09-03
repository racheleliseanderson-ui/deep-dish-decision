/**
 * The dynamic layer.
 *
 * Everything the corpus knows that changes with *when you are asking* and
 * *where you are asking from*: coordinates, opening hours in the room's own
 * timezone, per-guest spend, named dishes, and the recurring praise/complaint
 * patterns that describe the tradeoff.
 *
 * Built by `scripts/pipeline/build-live-index.mjs` from data already held in
 * the repo. Nothing here is invented, and every value carries its provenance
 * so the interface can say "published", "directory", or "city-level" rather
 * than presenting an estimate as a fact.
 */
import { regionGroupFileName } from "@/lib/corpus-meta";
import liveIndex from "@/data/live/index.json";

export type LatLng = [lat: number, lng: number];
export type Interval = [openMin: number, closeMin: number];

export type LiveRow = {
  /** Coordinates. `exact` is the room's own point; `city` is the metro centroid. */
  ll?: LatLng;
  llSource?: "exact" | "city";
  tz?: string | null;
  hood?: string;
  /** Seven days, Sunday first, each a list of [openMinute, closeMinute]. */
  hours?: Interval[][];
  hoursSource?: "google" | "first-party-prose";
  band?: "$" | "$$" | "$$$" | "$$$$";
  bandSource?: "directory" | "planning-band";
  /** Per-guest spend range in USD. */
  pp?: [number, number];
  ppSource?: "published" | "band" | "planning-band";
  ppService?: number;
  ppStated?: number;
  rating?: [rating: number, count: number];
  /** What a cancellation costs. Never spend — money lost without eating. */
  risk?: {
    deposit?: number;
    cancelFee?: number;
    prepaid?: boolean;
    perGuest?: boolean;
    windowHours?: number;
  };
  a11y?: {
    entrance: boolean | null;
    restroom: boolean | null;
    seating: boolean | null;
    parking: boolean | null;
  };
  am?: Record<string, boolean>;
  parking?: Record<string, boolean>;
  mapUri?: string;
  category?: string;
  dishes?: { name: string; source: "first-party" | "reviews" }[];
  rep?: {
    praise: string[];
    complaints: string[];
    consistency: string | null;
    value: string | null;
    service: string | null;
    sample: number | null;
    recency: string | null;
  };
};

type LiveFile = { regionGroup: string; generatedAt: string; records: Record<string, LiveRow> };

const loaders = import.meta.glob<LiveFile | { default: LiveFile }>("../data/live/*.json");
const cache = new Map<string, Record<string, LiveRow>>();

function unpack(mod: LiveFile | { default: LiveFile }): Record<string, LiveRow> {
  const file = "records" in mod ? mod : mod.default;
  return file?.records ?? {};
}

/** Load the live layer for one region group. Mirrors `loadRegionGroup`. */
export async function loadLiveGroup(group: string): Promise<Record<string, LiveRow>> {
  if (cache.has(group)) return cache.get(group)!;
  const key = `../data/live/${regionGroupFileName(group)}.json`;
  const loader = loaders[key];
  if (!loader) return {};
  const rows = unpack(await loader());
  cache.set(group, rows);
  return rows;
}

export function peekLiveGroup(group: string): Record<string, LiveRow> | null {
  return cache.get(group) ?? null;
}

/**
 * How many rooms carry their own coordinate, corpus-wide.
 *
 * A 1.8 KB index, safe to import anywhere. The numbers are the reason distance
 * is banded below: 111 rooms have an address point and 1,416 sit on the middle
 * of their city.
 */
export const COORDINATE_COVERAGE = liveIndex.stats as {
  total: number;
  exact: number;
  city: number;
  none: number;
};

/* ── distance ───────────────────────────────────────────────────────────── */

const R_MILES = 3958.8;
const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in miles. */
export function haversineMi(a: LatLng, b: LatLng): number {
  const dLat = rad(b[0] - a[0]);
  const dLng = rad(b[1] - a[1]);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R_MILES * Math.asin(Math.min(1, Math.sqrt(s)));
}

/**
 * How far a city centroid may sit from the door before a radius filter is
 * entitled to act on it. Four miles covers the spread of a normal metro; it is
 * a deliberate refusal to exclude a room on a point that is not its address.
 */
export const CENTROID_SLACK_MI = 4;

/**
 * Bands for a point that is not the restaurant's address.
 *
 * 1,416 of 1,527 rooms have no address coordinate on file. The point stored for
 * them is the middle of their city, which means every room in Chicago is the
 * same distance from you. A decimal against that point is a measurement the
 * corpus never made, so a centroid distance is published only as a band wide
 * enough to survive being wrong, and never without saying what it measured to.
 */
const BANDS: [limit: number, label: string][] = [
  [1, "under 1 mi"],
  [2, "1–2 mi"],
  [5, "2–5 mi"],
  [10, "5–10 mi"],
  [25, "10–25 mi"],
  [50, "25–50 mi"],
];

export function distanceBand(mi: number): string {
  for (const [limit, label] of BANDS) if (mi < limit) return label;
  return "over 50 mi";
}

export type DistanceRead = {
  /** The figure a reader may act on. Banded whenever the point is a centroid. */
  value: string;
  /** What the figure was measured to. Null only for a real address point. */
  measuredTo: string | null;
  exact: boolean;
};

/**
 * One distance, stated as what it is.
 *
 * There is no call path that yields a bare decimal for a centroid: the band and
 * the "middle of town" clause are produced together, so a render site cannot
 * print half of the reading.
 */
export function readDistance(mi: number, exact: boolean, city?: string | null): DistanceRead {
  if (exact) {
    const n = mi < 10 ? Math.round(mi * 10) / 10 : Math.round(mi);
    return { value: mi < 0.1 ? "under 0.1 mi" : `${n} mi`, measuredTo: null, exact: true };
  }
  const place = String(city ?? "").trim();
  return {
    value: distanceBand(mi),
    measuredTo: `to the middle of ${place || "town"}`,
    exact: false,
  };
}

/** The whole reading as one string, for prose, alt text and tooltips. */
export function formatDistance(mi: number, exact: boolean, city?: string | null): string {
  const read = readDistance(mi, exact, city);
  return read.measuredTo ? `${read.value} ${read.measuredTo}` : read.value;
}

/* ── opening hours ──────────────────────────────────────────────────────── */

export type OpenState =
  | { state: "unknown" }
  | { state: "open"; closesInMin: number; closesAt: string }
  | { state: "closing-soon"; closesInMin: number; closesAt: string }
  | { state: "opens-later"; opensInMin: number; opensAt: string }
  | { state: "closed-today" }
  | { state: "closed" };

const pad = (n: number) => String(n).padStart(2, "0");

export function minutesToClock(m: number): string {
  const total = ((m % 1440) + 1440) % 1440;
  const h24 = Math.floor(total / 60);
  const min = total % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const suffix = h24 < 12 ? "am" : "pm";
  return min === 0 ? `${h12}${suffix}` : `${h12}:${pad(min)}${suffix}`;
}

/** Local wall-clock day-of-week and minute-of-day in an IANA timezone. */
export function localNow(tz: string | null | undefined, when: Date = new Date()) {
  if (!tz) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(when);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    const dayMap: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    const day = dayMap[get("weekday")];
    const hour = Number(get("hour")) % 24;
    const minute = Number(get("minute"));
    if (day === undefined || Number.isNaN(hour) || Number.isNaN(minute)) return null;
    return { day, minute: hour * 60 + minute };
  } catch {
    return null;
  }
}

/**
 * Where the room stands at a given moment, in its own timezone.
 * Intervals that cross midnight are carried into the following day.
 */
export function openStateAt(row: LiveRow | undefined, when: Date = new Date()): OpenState {
  const now = localNow(row?.tz, when);
  if (!now) return { state: "unknown" };
  return openStateAtMoment(row, now.day, now.minute);
}

/**
 * The same reading, at an arbitrary day and minute in the room's own week.
 * Used when the reader has named an arrival time rather than asking about now.
 */
export function openStateAtMoment(
  row: LiveRow | undefined,
  day: number,
  minute: number,
): OpenState {
  // A malformed week is "unknown", never a confident "closed today".
  if (!Array.isArray(row?.hours) || row.hours.length !== 7) return { state: "unknown" };
  if (!row.hours.every((d) => Array.isArray(d))) return { state: "unknown" };
  const yesterday = row.hours[(day + 6) % 7] ?? [];
  const today = row.hours[day] ?? [];

  // A late-night interval opened yesterday and may still be running.
  for (const [open, close] of yesterday) {
    // close <= open means the service crossed midnight; it ends at `close` today.
    if (close <= open && minute < close) {
      const left = close - minute;
      return left <= 60
        ? { state: "closing-soon", closesInMin: left, closesAt: minutesToClock(close) }
        : { state: "open", closesInMin: left, closesAt: minutesToClock(close) };
    }
  }

  for (const [open, close] of today) {
    const end = close <= open ? close + 1440 : close;
    if (minute >= open && minute < end) {
      const left = end - minute;
      return left <= 60
        ? { state: "closing-soon", closesInMin: left, closesAt: minutesToClock(close) }
        : { state: "open", closesInMin: left, closesAt: minutesToClock(close) };
    }
  }

  const next = today
    .map(([o]) => o)
    .filter((o) => o > minute)
    .sort((a, b) => a - b)[0];
  if (next !== undefined) {
    return { state: "opens-later", opensInMin: next - minute, opensAt: minutesToClock(next) };
  }
  return today.length ? { state: "closed" } : { state: "closed-today" };
}

/** Is the room serving at a specific day + time? Used for "the night" rather than "now". */
export function servesAt(row: LiveRow | undefined, day: number, minute: number): boolean | null {
  if (!row?.hours) return null;
  const today = row.hours[day] ?? [];
  const yesterday = row.hours[(day + 6) % 7] ?? [];
  for (const [open, close] of yesterday) if (close <= open && minute < close) return true;
  for (const [open, close] of today) {
    const end = close <= open ? close + 1440 : close;
    if (minute >= open && minute < end) return true;
  }
  return false;
}

export function openLabel(
  s: OpenState,
  /** True when the reader named an arrival time rather than asking about now. */
  atChosenTime = false,
): {
  text: string;
  tone: "verified" | "watch" | "critical" | "unknown";
} {
  switch (s.state) {
    case "open":
      return {
        text: atChosenTime ? `Serving · until ${s.closesAt}` : `Open now · until ${s.closesAt}`,
        tone: "verified",
      };
    case "closing-soon":
      return {
        text: atChosenTime ? `Closing ${s.closesAt}` : `Closing in ${s.closesInMin} min`,
        tone: "watch",
      };
    case "opens-later":
      return { text: `Opens ${s.opensAt}`, tone: "watch" };
    case "closed":
      return { text: "Closed for the night", tone: "critical" };
    case "closed-today":
      return { text: "Closed today", tone: "critical" };
    default:
      return { text: "Hours not held", tone: "unknown" };
  }
}

/* ── spend ──────────────────────────────────────────────────────────────── */

export function spendLine(row: LiveRow | undefined): { text: string; source: string } | null {
  if (!row?.pp) return null;
  const [lo, hi] = row.pp;
  if (row.ppSource === "published") {
    const svc = row.ppService ? ` including the ${row.ppService}% service charge` : "";
    return { text: `About $${lo} per guest${svc}`, source: "Published by the restaurant" };
  }
  const label = `$${lo}–$${hi} per guest`;
  return {
    text: label,
    source:
      row.ppSource === "band"
        ? "Estimated from the directory price band"
        : "Estimated from the planning band",
  };
}

/** How the hours were established, said plainly. */
export function hoursProvenance(row: LiveRow | undefined): string | null {
  if (!row?.hours) return null;
  return row.hoursSource === "google"
    ? "Published schedule"
    : "Read from the restaurant's own hours line";
}

/** One line on what a cancellation costs, or null when nothing is stated. */
export function bookingRiskLine(row: LiveRow | undefined): string | null {
  const r = row?.risk;
  if (!r) return null;
  const per = r.perGuest ? " per guest" : "";
  const when = r.windowHours
    ? r.windowHours % 24 === 0
      ? ` within ${r.windowHours / 24} day${r.windowHours === 24 ? "" : "s"}`
      : ` within ${r.windowHours} hours`
    : "";
  if (r.cancelFee) return `$${r.cancelFee}${per} to cancel${when}`;
  if (r.deposit) return `$${r.deposit}${per} deposit to hold the table`;
  if (r.prepaid) return "Prepaid or non-refundable booking";
  return null;
}

/** A typical total for a party, kept deliberately rough. */
export function partyTotal(row: LiveRow | undefined, party: number | null): string | null {
  if (!row?.pp || !party || party < 1) return null;
  const [lo, hi] = row.pp;
  const l = lo * party;
  const h = hi * party;
  const round = (n: number) => (n >= 200 ? Math.round(n / 25) * 25 : Math.round(n / 5) * 5);
  return l === h ? `~$${round(l)} for ${party}` : `~$${round(l)}–$${round(h)} for ${party}`;
}
