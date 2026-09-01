import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHoursProse } from "./parse-hours.mjs";

const D = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const at = (r, day) => r.week[D[day]];
const hm = (h, m = 0) => h * 60 + m;

test("reads a simple daily service", () => {
  const r = parseHoursProse("Dinner is served daily from 5 PM to 10 PM.");
  assert.equal(r.days, 7);
  for (const d of Object.keys(D)) assert.deepEqual(at(r, d), [[hm(17), hm(22)]]);
});

test("keeps every day of a comma-and list", () => {
  const r = parseHoursProse(
    "Dinner is served Sunday, Tuesday, Wednesday, and Thursday from 5 PM to 9 PM and Friday and Saturday from 5 PM to 10 PM.",
  );
  assert.deepEqual(at(r, "Sun"), [[hm(17), hm(21)]]);
  assert.deepEqual(at(r, "Tue"), [[hm(17), hm(21)]]);
  assert.deepEqual(at(r, "Wed"), [[hm(17), hm(21)]]);
  assert.deepEqual(at(r, "Thu"), [[hm(17), hm(21)]]);
  assert.deepEqual(at(r, "Fri"), [[hm(17), hm(22)]]);
  assert.deepEqual(at(r, "Sat"), [[hm(17), hm(22)]]);
  assert.deepEqual(at(r, "Mon"), []);
});

test("expands a day range and honours an explicit closure", () => {
  const r = parseHoursProse(
    "Official restaurant hours: Wednesday and Sunday 4-7 PM; Thursday-Saturday 4-9:30 PM; closed Monday and Tuesday.",
  );
  assert.deepEqual(at(r, "Wed"), [[hm(16), hm(19)]]);
  assert.deepEqual(at(r, "Sun"), [[hm(16), hm(19)]]);
  assert.deepEqual(at(r, "Thu"), [[hm(16), hm(21, 30)]]);
  assert.deepEqual(at(r, "Sat"), [[hm(16), hm(21, 30)]]);
  assert.deepEqual(at(r, "Mon"), []);
  assert.deepEqual(at(r, "Tue"), []);
  assert.deepEqual(r.closedDays, [1, 2]);
});

test("carries a closing meridiem back to a bare opening time", () => {
  // "4-9:30 PM" is 4pm, never 4am.
  const r = parseHoursProse("Open Friday 4-9:30 PM.");
  assert.deepEqual(at(r, "Fri"), [[hm(16), hm(21, 30)]]);
});

test("does not turn 11 AM-10 PM into an inverted range", () => {
  const r = parseHoursProse("Official site business hours: Monday 11 AM-10 PM.");
  assert.deepEqual(at(r, "Mon"), [[hm(11), hm(22)]]);
});

test("refuses an open-ended service rather than inventing a closing time", () => {
  assert.equal(
    parseHoursProse("Dinner is served Tuesday through Saturday evenings beginning at 5 PM."),
    null,
  );
});

test("refuses prose with no times at all", () => {
  assert.equal(
    parseHoursProse("Hours were not published on the reviewed first-party pages."),
    null,
  );
  assert.equal(parseHoursProse(""), null);
  assert.equal(parseHoursProse(undefined), null);
});

test("merges an overlapping happy hour into the service it sits inside", () => {
  const r = parseHoursProse(
    "The restaurant is open daily from 11 AM to 9 PM, with happy hour from 3 PM to 5 PM.",
  );
  assert.deepEqual(at(r, "Mon"), [[hm(11), hm(21)]]);
});

test("keeps two genuinely separate services on one day", () => {
  const r = parseHoursProse("Open Tuesday 11 AM to 2 PM and Tuesday 5 PM to 9 PM.");
  assert.deepEqual(at(r, "Tue"), [
    [hm(11), hm(14)],
    [hm(17), hm(21)],
  ]);
});

test("understands weekday and weekend shorthand", () => {
  const wk = parseHoursProse("Open weekdays 11 AM to 3 PM.");
  assert.deepEqual(at(wk, "Mon"), [[hm(11), hm(15)]]);
  assert.deepEqual(at(wk, "Sat"), []);
  const we = parseHoursProse("Brunch runs weekends 10 AM to 2 PM.");
  assert.deepEqual(at(we, "Sat"), [[hm(10), hm(14)]]);
  assert.deepEqual(at(we, "Sun"), [[hm(10), hm(14)]]);
  assert.deepEqual(at(we, "Wed"), []);
});

test("reads noon and midnight", () => {
  const r = parseHoursProse("Open Friday noon to midnight.");
  assert.deepEqual(at(r, "Fri"), [[hm(12), hm(0)]]);
});

test("refuses when an open-ended service would be reported as closed", () => {
  // The après window alone would say the room is shut at dinner.
  assert.equal(
    parseHoursProse(
      "Dinner is served daily from 5 PM. Apres service is offered daily from 2:30 PM to 4:30 PM.",
    ),
    null,
  );
});

test("refuses when the schedule is narrower than the stated open days", () => {
  // The text says Tuesday through Saturday; the times only cover Tue-Fri.
  assert.equal(
    parseHoursProse(
      "The restaurant is open Tuesday through Saturday. Lunch runs Tuesday through Friday from 11:30 AM to 2:30 PM.",
    ),
    null,
  );
});

test("reads a day expression that follows its time range", () => {
  const r = parseHoursProse(
    "Dinner runs 5 PM to 9 PM Sunday through Thursday and 5 PM to 10 PM Friday and Saturday.",
  );
  assert.deepEqual(at(r, "Sun"), [[hm(17), hm(21)]]);
  assert.deepEqual(at(r, "Thu"), [[hm(17), hm(21)]]);
  assert.deepEqual(at(r, "Fri"), [[hm(17), hm(22)]]);
  assert.deepEqual(at(r, "Sat"), [[hm(17), hm(22)]]);
});

test("does not read a day out of an ordinary word", () => {
  // "months" is not Monday; "reviewed" is not Wednesday.
  assert.equal(
    parseHoursProse("Reduced service in shoulder months. Happy hour is 4 PM to 5 PM."),
    null,
  );
});

test("never emits a day outside Sunday-first indices", () => {
  const r = parseHoursProse("Open Monday through Sunday 5 PM to 9 PM.");
  assert.equal(r.week.length, 7);
  assert.equal(r.days, 7);
});
