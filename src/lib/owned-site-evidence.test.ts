import { beforeAll, describe, expect, it } from "vitest";
import { isUnstated } from "@/lib/case-depth";
import { loadEnrichmentGroup, ownedSiteEvidence, quoteText } from "@/lib/enrichment";
import { records } from "@/lib/dataset";

describe("ownedSiteEvidence", () => {
  // Enrichment is loaded per region group now, not imported whole. Reading
  // before the group lands returns null by design — see the contract tests in
  // enrichment-loading.test.ts.
  beforeAll(() => loadEnrichmentGroup("Michigan"));

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

describe("case-file floor", () => {
  /*
   * The floor is that every record is measured against the same twelve slots.
   * It is not that every record fills them — 41 of 1,527 do, and a corpus whose
   * whole position is "we stop rather than guess" cannot assert otherwise.
   *
   * This test used to require depthFilled === 12 and isFullCaseFile on every
   * record. That was true when the corpus was 800-odd leveled files and became
   * false the moment it grew; the suite has been failing on it since, which is
   * how five stale assertions went unread.
   */
  it("puts every record on the same twelve-slot file", () => {
    expect(records.length).toBeGreaterThan(800);
    expect(records.every((r) => r.depthTotal === 12)).toBe(true);
    expect(records.every((r) => r.depthFilled >= 0 && r.depthFilled <= 12)).toBe(true);
    expect(records.every((r) => r.isFullCaseFile === (r.depthFilled === 12))).toBe(true);
    expect(records.some((r) => r.isFullCaseFile)).toBe(true);
  });

  it("keeps thinFieldCount in step with thinFields", () => {
    const drifted = records.filter((r) => (r.thinFields ?? []).length !== r.thinFieldCount);
    expect(drifted.map((r) => r.slug)).toEqual([]);
  });

  it("keeps unstated language visible instead of inventing facts", () => {
    const silent = records.find((r) => isUnstated(r.hoursSummary));
    expect(silent).toBeTruthy();
    expect(isUnstated(silent?.hoursSummary)).toBe(true);
    const stated = records.find((r) => r.slug === "canlis");
    expect(stated).toBeTruthy();
    expect(isUnstated(stated?.hoursSummary)).toBe(false);
    expect(stated?.hoursSummary).toMatch(/Tuesday through Saturday/);
  });
});
