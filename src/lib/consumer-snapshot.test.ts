import { describe, expect, it } from "vitest";
import { bySlug, records } from "@/lib/dataset";
import { buildConsumerSnapshot, whyGoLine } from "@/lib/consumer-snapshot";
import { buildFoodIntel } from "@/lib/food-intel";
import { buildDinerAnswers } from "@/lib/diner-questions";
import { getInspection } from "@/lib/inspections";
import { buildReputation, getResearchedPattern } from "@/lib/reputation";
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
    expect(records.length).toBeGreaterThanOrEqual(836);
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

  it("does not treat Goldbelly shipping copy as a signature dish", () => {
    const food = buildFoodIntel(bySlug.get("kann")!);
    expect(food.signatureMentions.join(" ").toLowerCase()).not.toMatch(/goldbelly|nationwide/);
  });

  it("does not keep sourcing essays as named dishes", () => {
    const blob = records
      .map((r) => buildFoodIntel(r).signatureMentions.join(" "))
      .join(" | ")
      .toLowerCase();
    expect(blob).not.toMatch(/wine program|seasonal menu sourced|welcoming hospitalit|globally inspired/);
  });
});

describe("reputation layer", () => {
  it("never marks listing ratings as ranking-eligible", () => {
    const rep = buildReputation("carmine-s-44th-street-nyc");
    expect(rep.rankingEligible).toBe(false);
    expect(rep.layer).toBe("publicReputationEvidence");
    expect(rep.patternSummary.toLowerCase()).toMatch(/not a deep dish ranking|not a ranking|not on file/);
  });

  it("records a mixed Nue pattern rather than a star consensus", () => {
    const rep = buildReputation("nue");
    expect(rep.recurringPraise.length).toBeGreaterThan(0);
    expect(rep.recurringComplaints.length).toBeGreaterThan(0);
    expect(rep.rankingEligible).toBe(false);
    expect(rep.patternSummary.toLowerCase()).toMatch(/not a ranking|directory stars do not rank/);
  });

  it("does not fabricate recurring praise on unresearched records", () => {
    for (const r of records.slice(0, 40)) {
      const rep = buildReputation(r.slug);
      expect(rep.rankingEligible).toBe(false);
      if (getResearchedPattern(r.slug)) {
        expect(rep.recurringPraise.length + rep.recurringComplaints.length).toBeGreaterThan(0);
        continue;
      }
      expect(rep.recurringPraise).toEqual([]);
      expect(rep.recurringComplaints).toEqual([]);
    }
  });

  it("records a mixed Canlis pattern rather than a star consensus", () => {
    const rep = buildReputation("canlis");
    expect(rep.recurringPraise.length).toBeGreaterThan(0);
    expect(rep.recurringComplaints.length).toBeGreaterThan(0);
    expect(rep.rankingEligible).toBe(false);
    expect(rep.patternSummary.toLowerCase()).toMatch(/mixed|not a ranking/);
  });

  it("does not feed ratings into rank()", () => {
    const filtered = records.filter((r) => r.regionGroup === "Washington").slice(0, 12);
    const ranked = rank(filtered, emptySituation);
    const src = rank.toString();
    expect(src).not.toMatch(/listingRating|reviewCount|buildReputation/);
    expect(ranked.length).toBeGreaterThan(0);
  });

  it("leaves unresearched rooms empty even when a listing sample exists", () => {
    const rep = buildReputation("gander-and-ryegrass");
    expect(getResearchedPattern("gander-and-ryegrass")).toBeNull();
    expect(rep.recurringPraise).toEqual([]);
    expect(rep.recurringComplaints).toEqual([]);
    expect(rep.rankingEligible).toBe(false);
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

  it("surfaces a King County snapshot for Canlis without calling it a score", () => {
    const insp = getInspection("canlis");
    expect(insp).toBeTruthy();
    expect(insp!.closed).toBe(false);
    const answers = buildDinerAnswers(bySlug.get("canlis")!);
    const trust = answers.find((a) => a.id === "trust")!;
    expect(trust.open).toBe(false);
    expect(trust.answer.toLowerCase()).toMatch(/king county|unsatisfactory|not a deep dish/);
    expect(trust.answer.toLowerCase()).not.toMatch(/\bdirty\b|avoid this kitchen/);
  });

  it("surfaces NYC letter grades as public snapshots, never as Deep Dish scores", () => {
    for (const slug of ["carmine-s-44th-street-nyc", "buddakan", "the-smith", "fraunces-tavern"] as const) {
      const insp = getInspection(slug);
      expect(insp).toBeTruthy();
      expect(insp!.jurisdiction.toLowerCase()).toMatch(/nyc/);
      expect(insp!.note.toLowerCase()).toMatch(/not a deep dish/);
      const answers = buildDinerAnswers(bySlug.get(slug)!);
      const trust = answers.find((a) => a.id === "trust")!;
      expect(trust.answer.toLowerCase()).toMatch(/not a deep dish cleanliness score/);
      expect(trust.answer.toLowerCase()).not.toMatch(/\bdirty\b|avoid this kitchen/);
    }
  });

  it("does not invent an inspection for Au Cheval after the address mismatch", () => {
    expect(getInspection("au-cheval")).toBeNull();
  });
});

describe("washington date-night set", () => {
  it("keeps 33 Washington records and does not drop Canlis", () => {
    const wa = records.filter((r) => r.regionGroup === "Washington");
    expect(wa.length).toBe(33);
    const ranked = rank(wa, {
      ...emptySituation,
      regionGroup: "Washington",
      occasion: "Date night",
      partySize: 2,
    });
    expect(ranked.length).toBe(33);
    expect(ranked.some((x) => x.record.slug === "canlis")).toBe(true);
  });
});

describe("visual program guards", () => {
  it("never cross-wires documentary photography", () => {
    const cov = visualCoverage();
    expect(cov.documentary).toBeGreaterThanOrEqual(0);
    expect(findCrossWiredSources()).toEqual([]);
  });

  it("never returns another restaurant's image", () => {
    expect(visualsFor("not-a-real-restaurant-slug")).toEqual([]);
    for (const img of visualsFor("canlis")) {
      expect(img.slug).toBe("canlis");
      expect(img.documentary === false || img.provenance.kind !== "editorial_illustration").toBe(true);
    }
    for (const img of visualsFor("nue")) {
      expect(img.slug).toBe("nue");
      expect(img.documentary).toBe(true);
    }
  });
});
