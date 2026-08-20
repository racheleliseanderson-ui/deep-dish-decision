import { describe, expect, it } from "vitest";
import {
  SOURCE_LIMITED_AUTHORITY,
  applySourceLimitedRecord,
  isOperatorPlatformUrl,
  isSourceLimitedRecord,
  sourceLimitedMeta,
} from "./source-limited.mjs";

describe("source-limited operator platform model", () => {
  it("accepts known operator platform hosts and rejects arbitrary directories", () => {
    expect(isOperatorPlatformUrl("https://www.facebook.com/example/")).toBe(true);
    expect(isOperatorPlatformUrl("https://www.toasttab.com/local/order/example")).toBe(true);
    expect(isOperatorPlatformUrl("https://www.fetail.com/storev2/shop?store_id=1")).toBe(true);
    expect(isOperatorPlatformUrl("https://www.yelp.com/biz/example")).toBe(false);
  });

  it("keeps website blank while recording an operator platform as officialSource", () => {
    const record = {
      website: "",
      officialSource: "",
      additionalSources: "",
      sources: [],
      sourceAuthority: "Public listing seed pending first-party review",
      confidence: "listing_only",
      freshnessStatus: "AWAITING_FIRST_PARTY_REVIEW",
      reviewStatus: "listing_only",
      reviewedAt: "2026-08-11",
      nextReviewAt: "2026-09-10",
      disclaimer: "",
      nextAction: "",
      fieldVolatility: "",
    };
    applySourceLimitedRecord(
      record,
      {
        officialSource: "https://www.facebook.com/example/",
        additionalSources: ["https://www.toasttab.com/local/order/example"],
        sourceAuthority: SOURCE_LIMITED_AUTHORITY,
      },
      "2026-08-20T14:30:00.000Z",
    );

    expect(record.website).toBe("");
    expect(record.officialSource).toBe("https://www.facebook.com/example/");
    expect(record.additionalSources).toContain("toasttab.com");
    expect(record.sources).toHaveLength(2);
    expect(record.sourceAuthority).toBe(SOURCE_LIMITED_AUTHORITY);
    expect(record.reviewStatus).toBe("listing_only");
    expect(record.freshnessStatus).toBe("SOURCE_LIMITED_OPERATOR_PLATFORM");
    expect(isSourceLimitedRecord(record)).toBe(true);
  });

  it("sets a distinct enrichment status without claiming a site scrape", () => {
    expect(sourceLimitedMeta({ confidence: 0.5 }, "2026-08-20T14:30:00.000Z")).toEqual({
      confidence: 0.5,
      matchStatus: "source-limited",
      lastEnrichedAt: "2026-08-20T14:30:00.000Z",
      enrichmentMode: "operator-platform-source",
    });
  });
});
