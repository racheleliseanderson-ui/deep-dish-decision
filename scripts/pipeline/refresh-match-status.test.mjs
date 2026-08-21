import { describe, expect, it } from "vitest";
import { scoreRefreshItem } from "./refresh.mjs";

const record = {
  slug: "example-room",
  title: "Example Room",
  city: "Example City",
  stateProvince: "Example State",
  reviewStatus: "current",
};

function item(matchStatus, siteFails = []) {
  return scoreRefreshItem({
    record,
    entry: {
      meta: {
        matchStatus,
        lastEnrichedAt: "2026-08-20T00:00:00.000Z",
      },
    },
    score: 100,
    siteFails,
    now: Date.parse("2026-08-20T01:00:00.000Z"),
  });
}

describe("current owned-site match statuses", () => {
  for (const status of ["site-failure", "no-website", "empty", "unresolved", "deferred", "error"]) {
    it(`marks ${status} as hygiene work`, () => {
      const result = item(status);
      expect(result.hygiene).toBe(true);
      expect(result.reasons).toContain(`match-${status}`);
      expect(result.priority).toBeGreaterThanOrEqual(900);
    });
  }

  it("does not mark resolved or partial status as match-status hygiene when otherwise complete", () => {
    for (const status of ["resolved", "partial"]) {
      const result = item(status);
      expect(result.reasons.some((reason) => reason.startsWith("match-"))).toBe(false);
      expect(result.hygiene).toBe(false);
    }
  });

  it("keeps detailed run-log failure text without double-prioritizing site-failure meta", () => {
    const result = item("site-failure", ["site 429"]);
    expect(result.reasons).toContain("match-site-failure");
    expect(result.reasons).toContain("site-failure:site 429");
    expect(result.priority).toBe(900);
  });
});
