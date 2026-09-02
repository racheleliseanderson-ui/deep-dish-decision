/**
 * Formatters for promoting owned-site quotes onto first-party case-file fields.
 * Nothing here invents evidence — it only cleans language already extracted
 * from the restaurant's own pages.
 */

export const FLOOR_PREFIX = "Not stated on the restaurant's own pages";

export function quoteText(value) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") return String(value.quote || "");
  return "";
}

export function stripPrefix(raw) {
  return String(raw ?? "")
    .replace(/^JSON-LD\s+[A-Za-z]+:\s*/i, "")
    .replace(/^hydration\s+[A-Za-z]+:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function emptyish(value) {
  const t = String(value ?? "").trim();
  if (!t) return true;
  // The leveling floor sentence is a placeholder we wrote, not evidence the
  // restaurant published. Counting it as filled is what let measureDepth()
  // score records "12 / 12 core fields" while nine of them said nothing.
  if (t.startsWith(FLOOR_PREFIX)) return true;
  return /^(not stated|unstated|not provided|unknown|none|n\/a|na|tbd|—|–|-)$/i.test(t);
}

export function isOurFloor(value) {
  return String(value ?? "").startsWith(FLOOR_PREFIX);
}

export function canFill(value) {
  return emptyish(value) || isOurFloor(value);
}

export function isQuestion(value) {
  const t = String(value ?? "").trim();
  if (!t) return true;
  if (/\?\s*$/.test(t)) return true;
  return /^(is |are |do |does |can |will |what |when |where |who |how )/i.test(t);
}

export function isNavLabel(value) {
  const t = String(value ?? "").trim();
  if (!t) return true;
  if (t.length < 12) return true;
  const words = t.split(/\s+/);
  if (words.length <= 6 && t === t.toUpperCase() && /[A-Z]/.test(t)) return true;
  return false;
}

export function usableQuotes(values, { allowQuestions = false } = {}) {
  const out = [];
  const seen = new Set();
  for (const value of values ?? []) {
    const quote = stripPrefix(quoteText(value));
    if (!quote) continue;
    if (!allowQuestions && isQuestion(quote)) continue;
    const key = quote.toLowerCase().slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(quote);
  }
  return out;
}

export function formatPhone(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return "";
}

export function to12h(token) {
  const t = String(token ?? "").trim();
  if (!t) return "";
  const ampm = t.match(/^(\d{1,2})(?::(\d{2}))?\s*([APap][Mm])$/);
  if (ampm) {
    const h = Number(ampm[1]);
    const m = ampm[2] ?? "00";
    const mer = ampm[3].toUpperCase();
    return `${h}:${m} ${mer}`;
  }
  const mil = t.match(/^(\d{1,2}):(\d{2})$/);
  if (mil) {
    let h = Number(mil[1]);
    const m = mil[2];
    const mer = h >= 12 ? "PM" : "AM";
    if (h === 0) h = 12;
    else if (h > 12) h -= 12;
    return `${h}:${m} ${mer}`;
  }
  return t;
}

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const DAY_INDEX = Object.fromEntries(
  DAY_NAMES.flatMap((name, i) => [
    [name.toLowerCase(), i],
    [name.slice(0, 3).toLowerCase(), i],
    [name.slice(0, 2).toLowerCase(), i],
  ]),
);

function expandDays(chunk) {
  const parts = chunk.split(/\s*,\s*/).filter(Boolean);
  const days = [];
  for (const part of parts) {
    const range = part.match(/^([A-Za-z]{2,9})\s*[-–—to]+\s*([A-Za-z]{2,9})$/i);
    if (range) {
      const a = DAY_INDEX[range[1].toLowerCase().slice(0, 3)];
      const b = DAY_INDEX[range[2].toLowerCase().slice(0, 3)];
      if (a == null || b == null) continue;
      if (a <= b) {
        for (let i = a; i <= b; i += 1) days.push(i);
      } else {
        for (let i = a; i < 7; i += 1) days.push(i);
        for (let i = 0; i <= b; i += 1) days.push(i);
      }
      continue;
    }
    const one = DAY_INDEX[part.toLowerCase().slice(0, 3)];
    if (one != null) days.push(one);
  }
  return [...new Set(days)];
}

function compactDayRange(indices) {
  const sorted = [...new Set(indices)].sort((a, b) => a - b);
  if (!sorted.length) return "";
  if (sorted.length === 7) return "Daily";
  const runs = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i] === prev + 1) {
      prev = sorted[i];
      continue;
    }
    runs.push([start, prev]);
    start = sorted[i];
    prev = sorted[i];
  }
  runs.push([start, prev]);
  return runs
    .map(([a, b]) => (a === b ? DAY_NAMES[a] : `${DAY_NAMES[a]}–${DAY_NAMES[b]}`))
    .join(", ");
}

/**
 * Turn owned-site hours quotes into a diner-facing summary.
 * Falls back to cleaned joined text when the shape is irregular.
 */
export function formatHoursSummary(values) {
  const lines = usableQuotes(values);
  if (!lines.length) return "";

  /** @type {Map<number, string[]>} */
  const byDay = new Map();
  let parsed = 0;

  for (const line of lines) {
    const spec = line.match(
      /^((?:[A-Za-z]{2,9}(?:,)?(?:\s*[-–—to]+\s*[A-Za-z]{2,9})?(?:\s*,\s*)?)+)\s+(\d{1,2}:\d{2}(?:\s*[APap][Mm])?)\s+(\d{1,2}:\d{2}(?:\s*[APap][Mm])?)$/,
    );
    if (spec) {
      const days = expandDays(spec[1].replace(/,/g, ", "));
      const interval = `${to12h(spec[2])}–${to12h(spec[3])}`;
      for (const d of days) {
        const list = byDay.get(d) ?? [];
        if (!list.includes(interval)) list.push(interval);
        byDay.set(d, list);
        parsed += 1;
      }
      continue;
    }

    // Schema.org openingHours: "Tu 11:30-22:00, We 11:30-22:00" or "Su-Th 16:00-22:00; Fr-Sa 16:00-23:00"
    const chunks = line.split(/[;,]/).map((s) => s.trim()).filter(Boolean);
    for (const chunk of chunks) {
      const open = chunk.match(
        /^([A-Za-z]{2,9}(?:\s*[-–—to]+\s*[A-Za-z]{2,9})?(?:\s*,\s*[A-Za-z]{2,9})*)\s+(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})$/,
      );
      if (!open) continue;
      const days = expandDays(open[1]);
      const interval = `${to12h(open[2])}–${to12h(open[3])}`;
      for (const d of days) {
        const list = byDay.get(d) ?? [];
        if (!list.includes(interval)) list.push(interval);
        byDay.set(d, list);
        parsed += 1;
      }
    }
  }

  if (parsed && byDay.size) {
    /** @type {Map<string, number[]>} */
    const groups = new Map();
    for (const [day, intervals] of byDay) {
      const key = intervals.join(" and ");
      const list = groups.get(key) ?? [];
      list.push(day);
      groups.set(key, list);
    }
    const parts = [...groups.entries()]
      .sort((a, b) => Math.min(...a[1]) - Math.min(...b[1]))
      .map(([intervals, days]) => `${compactDayRange(days)} ${intervals}`);
    const summary = `Hours as published on the restaurant's own pages: ${parts.join("; ")}.`;
    return summary.length > 420 ? `${summary.slice(0, 417).replace(/\s+\S*$/, "")}…` : summary;
  }

  const cleaned = lines
    .map((line) => line.replace(/^,+\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 6);
  if (!cleaned.length) return "";
  const joined = `Hours as published on the restaurant's own pages: ${cleaned.join("; ")}.`;
  return joined.length > 420 ? `${joined.slice(0, 417).replace(/\s+\S*$/, "")}…` : joined;
}

export function formatPriceDetails(values) {
  const lines = usableQuotes(values);
  if (!lines.length) return "";
  const first = lines[0];
  if (/^\$+$/.test(first)) {
    return `Price band ${first} as published on the restaurant's own pages.`;
  }
  if (/^\$/.test(first) || /\d/.test(first)) {
    return `Published price range ${first} on the restaurant's own pages.`;
  }
  return `Price note from the restaurant's own pages: ${first}`;
}

export function formatCuisineContext(values) {
  const lines = usableQuotes(values);
  if (!lines.length) return "";
  const labels = uniqueLabels(
    lines.flatMap((line) => line.split(/[,;/]|&/g).map((s) => s.trim()).filter(Boolean)),
  ).slice(0, 6);
  if (!labels.length) return "";
  return `${labels.join(", ")} — named on the restaurant's own pages.`;
}

export function sentenceFromQuotes(values, label, limit = 2) {
  const lines = usableQuotes(values).filter((q) => !isNavLabel(q)).slice(0, limit);
  if (!lines.length) return "";
  return `${label}: ${lines.join(" · ")}`;
}

export function uniqueLabels(values) {
  const seen = new Set();
  const out = [];
  for (const raw of values) {
    const label = String(raw ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^[\W_]+|[\W_]+$/g, "");
    if (label.length < 3 || label.length > 40) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label.replace(/\b\w/g, (m) => m.toUpperCase()).replace(/\bAnd\b/g, "and"));
  }
  return out;
}

const CUISINE_MAP = [
  [/fine[\s-]?din/i, "Fine dining"],
  [/wine/i, "Wine-forward"],
  [/seafood|oyster|fish/i, "Seafood"],
  [/steak/i, "Steak / grill"],
  [/italian/i, "Italian"],
  [/french/i, "French"],
  [/thai/i, "Thai"],
  [/korean/i, "Korean"],
  [/mexican|taco|latin/i, "Mexican"],
  [/chinese|sichuan|szechuan|chengdu|cantonese|hunan/i, "Chinese"],
  [/japan|sushi|izakaya|ramen/i, "Japanese"],
  [/brunch|breakfast/i, "Breakfast / brunch"],
  [/cocktail|lounge|bar/i, "Cocktail / lounge"],
  [/plant|vegan|vegetarian/i, "Plant-forward"],
  [/mediterranean/i, "Mediterranean"],
  [/spanish|tapas/i, "Spanish"],
  [/indian/i, "Indian"],
  [/vietnamese|pho/i, "Vietnamese"],
  [/ethiopian/i, "Ethiopian"],
  [/lebanese|middle eastern/i, "Lebanese"],
  [/filipino/i, "Filipino"],
  [/peruvian/i, "Peruvian"],
  [/caribbean/i, "Caribbean"],
  [/thai/i, "Thai"],
  [/american|new-american|bistro|california/i, "Contemporary American"],
  [/seasonal|market|farm/i, "Seasonal / market"],
  [/small plates|tapas/i, "Small plates"],
];

export function cuisineTagsFrom(text, existing = []) {
  const source = `${existing.join(" ")} ${text}`;
  const out = [...existing];
  const seen = new Set(existing.map((t) => t.toLowerCase()));
  for (const [re, label] of CUISINE_MAP) {
    if (re.test(source) && !seen.has(label.toLowerCase())) {
      seen.add(label.toLowerCase());
      out.push(label);
    }
  }
  return out.slice(0, 6);
}

export const BOOKING_PLATFORMS = [
  ["OpenTable", /opentable\.com/i],
  ["Resy", /resy\.com/i],
  ["Tock", /exploretock\.com|tock\.com/i],
  ["SevenRooms", /sevenrooms\.com/i],
  ["Yelp Reservations", /yelp\.com\/reservations/i],
  ["Toast", /toasttab\.com/i],
  ["Google Reserve", /reserve\.google\.com/i],
];

export function platformFromUrl(url, listed = "") {
  if (listed && listed !== "Direct") return listed;
  if (!url) return listed === "Direct" ? "Direct / confirm live" : "";
  const hit = BOOKING_PLATFORMS.find(([, re]) => re.test(url));
  if (hit) return hit[0];
  return "Direct / confirm live";
}

export function floor(field) {
  return `${FLOOR_PREFIX} — ${field}. Confirm live before you commit.`;
}

export const CORE_SLOTS = [
  { id: "phone", label: "Phone", get: (r) => r.phone || r.website },
  { id: "hoursSummary", label: "Hours", get: (r) => r.hoursSummary },
  { id: "priceDetails", label: "Price", get: (r) => r.priceDetails },
  { id: "cuisineContext", label: "Cuisine", get: (r) => r.cuisineContext },
  { id: "menu", label: "Menu", get: (r) => r.menuUrl || r.menuSummary },
  { id: "reservation", label: "Reservations", get: (r) => r.reservationUrl || r.reservationDetails },
  { id: "dietaryDetails", label: "Dietary", get: (r) => r.dietaryDetails },
  { id: "accessibilityState", label: "Access", get: (r) => r.accessibilityState },
  { id: "groupDetails", label: "Group", get: (r) => r.groupDetails },
  { id: "dressCode", label: "Dress", get: (r) => r.dressCode },
  { id: "atmosphereSummary", label: "Atmosphere", get: (r) => r.atmosphereSummary },
  { id: "serviceSummary", label: "Service", get: (r) => r.serviceSummary },
];

export function isOperationallyThin(value) {
  const t = String(value ?? "").trim();
  if (!t) return true;
  if (isOurFloor(t)) return true;
  return /not stated|not published|not named|not described|could not be reviewed|confirm live/i.test(t);
}

export function measureDepth(record) {
  const filled = CORE_SLOTS.filter((slot) => !emptyish(slot.get(record))).length;
  const thinFields = CORE_SLOTS.filter((slot) => isOperationallyThin(slot.get(record))).map(
    (slot) => slot.id,
  );
  return {
    depthFilled: filled,
    depthTotal: CORE_SLOTS.length,
    depthLabel: `${filled} / ${CORE_SLOTS.length} core fields`,
    thinFields,
    thinFieldCount: thinFields.length,
    isFullCaseFile: filled === CORE_SLOTS.length,
  };
}
