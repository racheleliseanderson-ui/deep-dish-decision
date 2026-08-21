import { describe, expect, it } from "vitest";
import { ownedSiteEvidence, quoteText } from "@/lib/enrichment";

describe("ownedSiteEvidence", () => {
  it("returns grouped first-party quotes for a recovered record", () => {
    const owned = ownedSiteEvidence("mexo-grand-rapids");
    expect(owned.present).toBe(true);
    expect((owned.pagesRead ?? 0) > 0 || owned.groups.length > 0).toBe(true);
    expect(owned.groups.every((g) => g.quotes.length > 0)).toBe(true);
    expect(owned.groups.every((g) => g.quotes.every((q) => quoteText(q).length > 0))).toBe(true);
  });

  it("does not invent evidence for a missing slug", () => {
    const owned = ownedSiteEvidence("not-a-real-restaurant-slug");
    expect(owned.present).toBe(false);
    expect(owned.groups).toEqual([]);
  });
});
