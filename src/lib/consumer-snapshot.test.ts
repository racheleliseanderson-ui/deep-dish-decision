import { describe, expect, it } from "vitest";
import { bySlug, records } from "@/lib/dataset";
import { buildConsumerSnapshot, whyGoLine } from "@/lib/consumer-snapshot";
import { buildFoodIntel } from "@/lib/food-intel";
import { buildDinerAnswers } from "@/lib/diner-questions";
import { buildReputation } from "@/lib/reputation";
import { emptySituation, rank } from "@/lib/intelligence";
import { findCrossWiredSources, visualsFor, visualCoverage } from "@/lib/visual-program";

describe("consumer snapshot", () => {
  it("extracts a decision point for Canlis instead of dumping two fields", () => {
    const r = bySlug.get("canlis");
    expect(r).toBeTruthy();
    const snap = buildConsumerSnapshot(r!);
    const food = snap.items.find((i) => i.label === "Food & menu")!;
    expect(food.open).toBe(false);
    expect(food.value.toLowerCase()).toMatch(/seattle|wine|six-course|lounge/);
    expect(food.value.length).toBeLessThan(320);
    const spend = snap.items.find((i) => i.label === "Spend / value")!;
    expect(spend.value).toMatch(/185/);
    expect(spend.value).toMatch(/20%/);
    expect(whyGoLine(r!)).not.toMatch(/great atmosphere and delicious food/i);
  });

  it("does not treat vegetarian markers as allergy safety", () => {
    const r = bySlug.get("nue");
    expect(r).toBeTruthy();
    const snap = buildConsumerSnapshot(r!);
    const dietary = snap.items.find((i) => i.label === "Dietary")!;
    expect(dietary.value.toLowerCase()).toMatch(/not a statement|allergy/);
  });

  it("covers the whole recovered corpus without throwing", () => {
    expect(records.length).toBe(836);
    for (const r of records) {
      const snap = buildConsumerSnapshot(r);
      expect(snap.items).toHaveLength(6);
      expect(snap.provenance).toBe("firstPartyEvidence");
      expect(snap.whyGo.length).toBeGreaterThan(8);
    }
  });
});

describe("food intel", () => {
  it("reads Canlis as tasting format with a wine-forward identity", () => {
    const food = buildFoodIntel(bySlug.get("canlis")!);
    expect(food.layer).toBe("firstPartyEvidence");
    expect(food.menuFormat).toMatch(/tasting|set menu|lounge/i);
    expect(food.culinaryIdentity).toMatch(/seattle/i);
  });

  it("does not invent signature dishes", () => {
    const food = buildFoodIntel(bySlug.get("nue")!);
    expect(food.signatureMentions.every((s) => /signature|known for|famous for|house/i.test(s) || s.length > 0)).toBe(
      true,
    );
    if (!food.signatureMentions.length) {
      expect(food.whatToOrder.toLowerCase()).toMatch(/no signature dish/);
    }
  });
});

describe("reputation layer", () => {
  it("never marks listing ratings as ranking-eligible", () => {
    const rep = buildReputation("carmine-s-44th-street-nyc");
    expect(rep.rankingEligible).toBe(false);
    expect(rep.layer).toBe("publicReputationEvidence");
    expect(rep.patternSummary.toLowerCase()).toMatch(/not a deep dish ranking|not a ranking|not on file/);
  });

  it("does not fabricate recurring praise", () => {
    for (const r of records.slice(0, 40)) {
      const rep = buildReputation(r.slug);
      expect(rep.recurringPraise).toEqual([]);
      expect(rep.recurringComplaints).toEqual([]);
    }
  });

  it("does not feed ratings into rank()", () => {
    const filtered = records.filter((r) => r.regionGroup === "Washington").slice(0, 12);
    const ranked = rank(filtered, emptySituation);
    const src = rank.toString();
    expect(src).not.toMatch(/listingRating|reviewCount|buildReputation/);
    expect(ranked.length).toBeGreaterThan(0);
  });
});

describe("diner questions", () => {
  it("answers ten questions for a full case file", () => {
    const answers = buildDinerAnswers(bySlug.get("kann")!);
    expect(answers).toHaveLength(10);
    expect(answers.map((a) => a.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const food = answers.find((a) => a.id === "food")!;
    expect(food.answer.toLowerCase()).toMatch(/haitian|live-fire/);
    expect(food.answer.toLowerCase()).not.toMatch(/\bauthentic\b/);
    const trust = answers.find((a) => a.id === "trust")!;
    expect(trust.open).toBe(true);
    expect(trust.answer.toLowerCase()).toMatch(/no health-inspection/);
  });
});

describe("visual program guards", () => {
  it("has no documentary photography until a proven ingest", () => {
    const cov = visualCoverage();
    expect(cov.documentary).toBe(0);
    expect(findCrossWiredSources()).toEqual([]);
  });

  it("never returns another restaurant's image", () => {
    expect(visualsFor("canlis")).toEqual([]);
    expect(visualsFor("not-a-real-restaurant-slug")).toEqual([]);
  });
});
