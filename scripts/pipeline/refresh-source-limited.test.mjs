import { describe, expect, it } from "vitest";
import { scoreRefreshItem } from "./refresh.mjs";

const record = {
  slug: "platform-only-room",
  title: "Platform Only Room",
  city: "Example City",
  stateProvince: "Example State",
  reviewStatus: "listing_only",
};

function item(matchStatus, score) {
  return scoreRefreshItem({
    record,
    entry: {
      meta: {
        matchStatus,
        lastEnrichedAt: "2026-08-20T14:30:00.000Z",
      },
    },
    score,
    siteFails: [],
    now: Date.parse("2026-08-20T15:00:00.000Z"),
  });
}

describe("source-limited refresh priority", () => {
  it("keeps source-limited records in hygiene below actual match failures", () => {
    const limited = item("source-limited", 100);
    const failure = item("site-failure", 100);
    expect(limited.hygiene).toBe(true);
    expect(limited.reasons).toContain("source-limited");
    expect(limited.priority).toBe(250);
    expect(failure.priority).toBe(900);
    expect(limited.priority).toBeLessThan(failure.priority);
  });

  it("still adds thin-data priority without turning the source limitation into a scrape error", () => {
    const limited = item("source-limited", 22);
    expect(limited.reasons).toEqual(expect.arrayContaining(["source-limited", "thin-22"]));
    expect(limited.reasons.some((reason) => reason.startsWith("match-"))).toBe(false);
    expect(limited.priority).toBe(698);
  });
});
