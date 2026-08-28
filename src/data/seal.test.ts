import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { daysUntil, deriveFreshness, deriveReviewStatus, seal, todayISO } from "./seal.ts";
import type { Draft } from "./seal.ts";

/**
 * Review state is the one claim this instrument makes about its own evidence.
 * It used to be a constant, which meant it was always "current" and the
 * overdue/due-soon findings could never fire. These are the known answers.
 */
describe("deriveReviewStatus", () => {
  const TODAY = "2026-08-28";

  it("is current while the review window is comfortably open", () => {
    assert.equal(deriveReviewStatus("2026-12-01", TODAY), "current");
  });

  it("turns due-soon on the last day outside the window and stays current one day earlier", () => {
    // The window is 7 days: +8 is still current, +7 is the first due-soon day.
    assert.equal(deriveReviewStatus("2026-09-05", TODAY), "current");
    assert.equal(deriveReviewStatus("2026-09-04", TODAY), "due-soon");
  });

  it("is due-soon, not overdue, on the review date itself", () => {
    assert.equal(deriveReviewStatus(TODAY, TODAY), "due-soon");
  });

  it("is overdue the day after the window closes", () => {
    assert.equal(deriveReviewStatus("2026-08-27", TODAY), "overdue");
  });

  it("fails closed on a missing review date", () => {
    assert.equal(deriveReviewStatus(undefined, TODAY), "overdue");
  });

  it("fails closed on an unreadable review date rather than reporting current", () => {
    assert.equal(deriveReviewStatus("not a date", TODAY), "overdue");
    assert.equal(deriveReviewStatus("", TODAY), "overdue");
  });
});

describe("daysUntil", () => {
  it("counts whole days forward and backward", () => {
    assert.equal(daysUntil("2026-08-28", "2026-08-28"), 0);
    assert.equal(daysUntil("2026-09-03", "2026-08-28"), 6);
    assert.equal(daysUntil("2026-08-20", "2026-08-28"), -8);
  });

  it("crosses a month and a leap day without drifting", () => {
    assert.equal(daysUntil("2027-03-01", "2027-02-28"), 1);
    assert.equal(daysUntil("2028-03-01", "2028-02-28"), 2);
  });

  it("returns null rather than NaN for input it cannot read", () => {
    assert.equal(daysUntil("nonsense", "2026-08-28"), null);
    assert.equal(daysUntil("2026-08-28", "nonsense"), null);
  });
});

describe("deriveFreshness", () => {
  it("downgrades an unremarkable current record as its review date approaches and passes", () => {
    assert.equal(deriveFreshness(undefined, "current"), "current");
    assert.equal(deriveFreshness(undefined, "due-soon"), "review-due");
    assert.equal(deriveFreshness(undefined, "overdue"), "stale");
  });

  it("leaves a deliberately authored state alone — it is more specific than the clock", () => {
    for (const authored of ["conflicting", "incomplete", "under-review", "verified"] as const) {
      assert.equal(deriveFreshness(authored, "overdue"), authored);
    }
  });
});

describe("todayISO", () => {
  it("is a date-only UTC day, so a server render and a hydration agree", () => {
    assert.equal(todayISO(new Date("2026-08-28T23:59:59.000Z")), "2026-08-28");
    assert.equal(todayISO(new Date("2026-08-29T00:00:00.000Z")), "2026-08-29");
    assert.match(todayISO(), /^\d{4}-\d{2}-\d{2}$/);
  });
});

const draft: Draft = {
  slug: "fixture",
  title: "Fixture",
  recordId: "RI-TEST-001",
  city: "Denver",
  stateProvince: "Colorado",
  regionGroup: "Denver metro",
  address: "1 Test St",
  phone: "555-0100",
  website: "https://example.test/",
  menuUrl: "https://example.test/menu",
  reservationUrl: "https://example.test/book",
  cuisineTags: ["Italian"],
  cuisineContext: "A fixture record used only by the test suite.",
  serviceSummary: "Dinner nightly, reservations by phone, walk-ins at the bar.",
  menuSummary: "A short seasonal menu that rotates.",
  occasionFit: "Date night and small group dining.",
  hoursSummary: "Dinner daily 5-10 p.m. Closed on public holidays.",
  reservationDetails: "Phone reservations up to 30 days ahead; bar is walk-in.",
  cancellationPolicy: "Not stated on first-party pages.",
  depositPolicy: "Not stated on first-party pages.",
  latePolicy: "Not stated on first-party pages.",
  priceDetails: "A la carte in a moderate band; no per-guest number published.",
  dietaryDetails: "Not stated on first-party pages.",
  beverageDetails: "A short wine list and a zero-proof section.",
  groupDetails: "Parties above eight by phone only.",
  atmosphereSummary: "A small room that runs loud at peak and calm early.",
  practicalNotes: "Ask for the front room if conversation matters.",
  accessibilityState: "Not stated on first-party pages.",
  parkingTransit: "Street parking; no drop-off route described.",
  dressCode: "No formal dress code published.",
  typicalMealLength: "Dinner typically ninety minutes; not published as a count.",
  unknownList: ["Cancellation window"],
  signals: { commitment: "Moderate" },
  priceTags: ["$$"],
  serviceStyles: ["A la carte"],
  dietaryTags: ["Not stated"],
  accessibilityTags: ["Not stated"],
  reservationTags: ["Phone"],
  groupFitTags: ["Date night"],
  bookingPlatforms: ["Phone"],
  spendBands: ["Moderate planning band"],
  daypartTags: ["Dinner language"],
  formalityBand: "Smart casual default",
  noiseBand: "Conversation-first",
  sources: ["https://example.test/"],
  officialSource: "https://example.test/",
};

describe("seal", () => {
  it("derives review state from the record's own dates instead of asserting it", () => {
    const past = seal({ ...draft, nextReviewAt: "2020-01-01" });
    assert.equal(past.reviewStatus, "overdue");
    assert.equal(past.reviewDueSoon, false);
    assert.equal(past.freshnessStatus, "stale");

    const open = seal({ ...draft, nextReviewAt: "2099-01-01" });
    assert.equal(open.reviewStatus, "current");
    assert.equal(open.freshnessStatus, "current");
  });

  it("lets a human-authored status override the calendar", () => {
    const held = seal({ ...draft, nextReviewAt: "2020-01-01", reviewStatus: "current" });
    assert.equal(held.reviewStatus, "current");
  });

  it("keeps an authored freshness state through a lapsed review window", () => {
    const conflicted = seal({
      ...draft,
      nextReviewAt: "2020-01-01",
      freshnessStatus: "conflicting",
    });
    assert.equal(conflicted.reviewStatus, "overdue");
    assert.equal(conflicted.freshnessStatus, "conflicting");
  });
});
