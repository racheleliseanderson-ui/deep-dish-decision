import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { dataset, records } from "@/lib/dataset";
import { emptySituation } from "@/lib/intelligence";

const ROOT = resolve(import.meta.dirname, "../..");
const FLOOR = 800;

describe("corpus invariants", () => {
  it("keeps the recovered 836-record hub above the floor", () => {
    expect(dataset.count).toBe(records.length);
    expect(records.length).toBeGreaterThanOrEqual(FLOOR);
    expect(records.length).toBeGreaterThanOrEqual(836);
    expect(dataset.regions).toBeGreaterThanOrEqual(50);
    expect(dataset.generatedAt).toBeTruthy();
  });

  it("does not auto-select Denver or any city on a blank night", () => {
    expect(emptySituation.region).toBeNull();
    expect(emptySituation.regionGroup).toBeNull();
    expect(emptySituation.occasion).toBeNull();
    expect(emptySituation.query).toBe("");
    expect(emptySituation.constraints).toEqual([]);
  });

  it("covers the regions used in QA, not a Denver-only demo", () => {
    const groups = new Set(records.map((r) => r.regionGroup));
    for (const need of [
      "Colorado",
      "Montana",
      "Washington",
      "Oregon",
      "California",
      "Texas",
      "New York",
      "Massachusetts",
      "Georgia",
      "Illinois",
    ]) {
      expect(groups.has(need)).toBe(true);
    }
  });

  it("keeps hero assets and the canonical dataset file", () => {
    expect(existsSync(resolve(ROOT, "src/data/dataset.json"))).toBe(true);
    expect(existsSync(resolve(ROOT, "src/data/by-region/washington.json"))).toBe(true);
    expect(existsSync(resolve(ROOT, "src/data/corpus-meta.json"))).toBe(true);
    // The hero original lives in assets-src/ with the other originals, so it
    // is neither deployed nor bundled; what the page imports are the WebP
    // widths built from it. Both halves have to exist or the home page loses
    // its hero — the original silently, at the next rebuild.
    expect(existsSync(resolve(ROOT, "assets-src/hero-pass.jpg"))).toBe(true);
    for (const w of [480, 768, 1200, 1800]) {
      expect(existsSync(resolve(ROOT, `src/assets/hero-pass-${w}.webp`))).toBe(true);
    }
    expect(existsSync(resolve(ROOT, "src/assets/fig-gold.jpg"))).toBe(true);
    expect(existsSync(resolve(ROOT, "src/routes/index.tsx"))).toBe(true);
    expect(existsSync(resolve(ROOT, "src/routes/record.$slug.tsx"))).toBe(true);
    expect(existsSync(resolve(ROOT, "src/routes/atlas.tsx"))).toBe(true);
    expect(existsSync(resolve(ROOT, "scripts/pipeline/report.mjs"))).toBe(true);
  });

  it("keeps required first-party fields on every record", () => {
    const required = [
      "slug",
      "title",
      "region",
      "regionGroup",
      "cuisineContext",
      "menuSummary",
      "priceDetails",
      "dietaryDetails",
      "atmosphereSummary",
      "reservationDetails",
    ] as const;
    for (const r of records) {
      expect(r.slug.length).toBeGreaterThan(1);
      expect(r.title.length).toBeGreaterThan(1);
      for (const key of required) {
        expect(r[key]).toBeTypeOf("string");
      }
    }
  });
});
