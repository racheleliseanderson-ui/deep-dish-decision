/**
 * Read published opening hours out of first-party prose.
 *
 * 199 records state their hours in `hoursSummary` as a sentence, and nothing
 * in the app could read them — so "open now", "serving at 7pm" and the
 * only-rooms-serving-then filter were dark for every record without a Google
 * schedule.
 *
 * This is deliberately conservative. An interval is emitted only when both an
 * opening and a closing time are stated for a named day. "Dinner from 5 PM"
 * with no closing time yields nothing rather than a guess, because a wrong
 * closing time sends someone to a locked door.
 *
 *   parseHoursProse("Dinner is served daily from 5 PM to 10 PM.")
 *   → { week: [[[1020,1320]] x7], days: 7, closedDays: [] }
 */

const DAY_INDEX = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tues: 2,
  tue: 2,
  wednesday: 3,
  weds: 3,
  wed: 3,
  thursday: 4,
  thurs: 4,
  thur: 4,
  thu: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

const DAY_WORD =
  "sundays?|mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sun|mon|tues|tue|weds|wed|thurs|thur|thu|fri|sat";

/** The same alternation, fenced so "months" is not Monday and "reviewed" is not Wednesday. */
const DAY_TOKEN = `\\b(?:${DAY_WORD})\\b`;

/** "5 pm", "11:30 am", "17:00" → minutes from midnight. */
function toMinutes(raw, inheritedMeridiem) {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/.exec(raw.trim());
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const mer = m[3] ?? inheritedMeridiem;
  if (h > 23 || min > 59) return null;
  if (mer === "pm" && h < 12) h += 12;
  else if (mer === "am" && h === 12) h = 0;
  else if (!mer && h <= 11) return null; // ambiguous — refuse rather than guess
  return h * 60 + min;
}

function normalise(text) {
  return String(text)
    .toLowerCase()
    .replace(/[‐-―−]/g, "-") // every dash variant
    .replace(/\ba\.m\.?/g, "am")
    .replace(/\bp\.m\.?/g, "pm")
    .replace(/\bnoon\b/g, "12 pm")
    .replace(/\bmidnight\b/g, "12 am")
    .replace(/\s+/g, " ");
}

/** Expand a day expression ("tuesday through saturday", "fri and sat") to indices. */
function expandDays(spec) {
  const out = new Set();
  const dayRe = new RegExp(DAY_TOKEN, "g");
  const found = [...spec.matchAll(dayRe)].map((m) => m[0].replace(/s$/, ""));
  if (!found.length) {
    if (/\bdaily\b|\bevery day\b|\bseven days\b/.test(spec)) return [0, 1, 2, 3, 4, 5, 6];
    if (/\bweekends?\b/.test(spec)) return [0, 6];
    if (/\bweekdays?\b/.test(spec)) return [1, 2, 3, 4, 5];
    return [];
  }
  // A range: "tuesday through saturday" / "tuesday-saturday"
  const rangeRe = new RegExp(`(${DAY_TOKEN})\\s*(?:through|thru|to|-)\\s*(${DAY_TOKEN})`, "g");
  let usedRange = false;
  for (const m of spec.matchAll(rangeRe)) {
    const a = DAY_INDEX[m[1].replace(/s$/, "")];
    const b = DAY_INDEX[m[2].replace(/s$/, "")];
    if (a === undefined || b === undefined) continue;
    usedRange = true;
    for (let i = a; ; i = (i + 1) % 7) {
      out.add(i);
      if (i === b) break;
      if (out.size > 7) break;
    }
  }
  if (!usedRange) {
    for (const d of found) {
      const i = DAY_INDEX[d];
      if (i !== undefined) out.add(i);
    }
  } else {
    // A range plus stray extras: "sunday, tuesday through thursday"
    for (const d of found) {
      const i = DAY_INDEX[d];
      if (i !== undefined && !spec.includes(`${d} through`) && !spec.includes(`${d} to`))
        out.add(i);
    }
  }
  return [...out];
}

/**
 * Pull every "<days> <open>-<close>" pairing out of a sentence.
 * Returns a week array (Sunday first) or null when nothing was confidently read.
 */
/** Collapse overlapping or touching intervals within one day. */
function mergeIntervals(list) {
  const sorted = [...list].sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const [o, c] of sorted) {
    const last = out[out.length - 1];
    if (last && o <= last[1]) last[1] = Math.max(last[1], c);
    else out.push([o, c]);
  }
  return out;
}

/**
 * Pull every "<days> <open>-<close>" pairing out of a sentence.
 *
 * Rather than splitting the sentence into clauses — which cuts "Wednesday and
 * Sunday" in half and silently loses a day — this walks the time ranges and
 * binds each one to the nearest day expression that precedes it. A day
 * expression is a maximal run of day names and their connectors, so lists and
 * ranges survive intact.
 *
 * Returns a week array (Sunday first) or null when nothing was confidently read.
 */
export function parseHoursProse(text) {
  if (!text) return null;
  const s = normalise(text);
  if (!/\d/.test(s)) return null;

  const week = [[], [], [], [], [], [], []];
  const closedDays = new Set();

  // Days explicitly marked closed.
  const closedRe = new RegExp(
    `closed\\s+(?:on\\s+)?((?:${DAY_TOKEN})(?:(?:\\s*(?:,|and|&|-|through|thru|to)\\s*)+(?:${DAY_TOKEN}))*)`,
    "g",
  );
  for (const m of s.matchAll(closedRe)) {
    for (const d of expandDays(m[1])) closedDays.add(d);
  }

  // Maximal day expressions, with their positions.
  const daySpanRe = new RegExp(
    `(?:${DAY_TOKEN}|\\bdaily\\b|\\bevery day\\b|\\bweekends?\\b|\\bweekdays?\\b)` +
      `(?:(?:\\s*(?:,|and|&|-|through|thru|to)\\s*)+(?:${DAY_TOKEN}))*`,
    "g",
  );
  const daySpans = [...s.matchAll(daySpanRe)]
    .map((m) => ({
      start: m.index ?? 0,
      end: (m.index ?? 0) + m[0].length,
      days: expandDays(m[0]),
      text: m[0],
    }))
    .filter((d) => d.days.length);

  const timeRangeRe = new RegExp(
    "(\\d{1,2}(?::\\d{2})?\\s*(?:am|pm)?)\\s*(?:-|to|until|till|through)\\s*(\\d{1,2}(?::\\d{2})?\\s*(?:am|pm)?)",
    "g",
  );

  let matched = 0;
  for (const r of s.matchAll(timeRangeRe)) {
    const at = r.index ?? 0;

    // A closing meridiem governs an opening time written without one:
    // "4-9:30 pm" means 4 pm, not 4 am.
    const closeMer = /pm/.test(r[2]) ? "pm" : /am/.test(r[2]) ? "am" : undefined;
    let open = toMinutes(r[1], closeMer);
    const close = toMinutes(r[2], closeMer);
    if (open === null || close === null) continue;
    // "11 am-10 pm" read with a carried pm would give 23:00-22:00; retry as am.
    if (open > close && closeMer === "pm" && !/am|pm/.test(r[1])) {
      const retry = toMinutes(r[1], "am");
      if (retry !== null && retry < close) open = retry;
    }
    if (open === close) continue;

    /* Bind to the nearest day expression, which may sit on either side:
       "Sunday through Thursday 5 PM to 9 PM" puts it before,
       "5 PM to 9 PM Sunday through Thursday" puts it after. Taking only the
       preceding one inverts the second form and assigns each range to the
       previous clause's days. A span that already owns a closer range is not
       stolen, and a binding is refused across a sentence boundary. */
    const rangeEnd = at + r[0].length;
    const before = daySpans.filter((d) => d.end <= at).pop();
    const after = daySpans.find((d) => d.start >= rangeEnd);

    const gapBefore = before ? at - before.end : Infinity;
    const gapAfter = after ? after.start - rangeEnd : Infinity;
    const crosses = (a, b) => /[.;]\s/.test(s.slice(a, b));

    let owner = null;
    // A trailing day expression only wins when it is genuinely adjacent —
    // within a few characters — otherwise it belongs to the next clause.
    if (gapAfter <= 3 && !crosses(rangeEnd, after.start) && gapAfter < gapBefore) owner = after;
    else if (before && !crosses(before.end, at)) owner = before;
    else if (after && gapAfter <= 3 && !crosses(rangeEnd, after.start)) owner = after;
    if (!owner) continue;

    for (const d of owner.days) {
      week[d].push([open, close]);
      matched++;
    }
  }

  for (const d of closedDays) week[d] = [];
  if (!matched) return null;

  /* ── two guards against asserting a closure the prose does not support ──
     Both refuse the whole record rather than ship a schedule that is narrower
     than the truth. A missing schedule says "hours not held"; a narrow one
     says "closed" — and sends someone to a room that is serving. */

  // (a) An opening time with no stated close. "Dinner is served daily from
  //     5 PM" alongside "Après 2:30 PM to 4:30 PM" would otherwise publish
  //     only the après window and report the room shut at dinner.
  const openEndedRe = new RegExp(
    "(?:from|at|beginning at|starting at|opens at|opening at)\\s+(\\d{1,2}(?::\\d{2})?)\\s*(am|pm)",
    "g",
  );
  for (const m of s.matchAll(openEndedRe)) {
    const after = s.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 14);
    // A close follows: this one is already handled as a range.
    if (/^\s*(?:-|to|until|till|through)\s*\d/.test(after)) continue;
    const start = toMinutes(`${m[1]}${m[2]}`, m[2]);
    if (start === null) continue;
    const covered = week.some((day) => day.some(([o]) => o === start));
    if (!covered) return null;
  }

  // (b) The prose names the days the room is open. If the schedule we read
  //     covers fewer, we would be asserting a closure the text contradicts.
  const statedOpenRe = new RegExp(
    `\\bopen\\s+(?:for\\s+\\w+\\s+)?((?:${DAY_TOKEN}|\\bdaily\\b|\\bevery day\\b)(?:(?:\\s*(?:,|and|&|-|through|thru|to)\\s*)+(?:${DAY_TOKEN}))*)`,
    "g",
  );
  for (const m of s.matchAll(statedOpenRe)) {
    const stated = expandDays(m[1]);
    if (!stated.length) continue;
    const missing = stated.filter((d) => !closedDays.has(d) && !week[d].length);
    if (missing.length) return null;
  }

  for (let i = 0; i < 7; i++) week[i] = mergeIntervals(week[i]);
  const openDays = week.filter((d) => d.length).length;
  if (!openDays) return null;

  return { week, days: openDays, closedDays: [...closedDays].sort() };
}
