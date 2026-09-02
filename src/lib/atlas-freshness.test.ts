import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import * as computed from "@/lib/atlas-compute";
import * as published from "@/lib/atlas";

/**
 * src/data/atlas.json is generated from the corpus. Two ways that quietly rots:
 *
 *   - the corpus changes and nobody re-runs build:atlas, so /atlas shows last
 *     month's counts with no sign anything is wrong
 *   - something imports atlas-compute from the browser again, putting the
 *     6.6 MB corpus back into the bundle
 *
 * Neither throws. The first is worse, because wrong numbers presented
 * confidently are the one thing this product is supposed not to do.
 */

const ROOT = resolve(process.cwd());

describe("the published aggregates match the corpus they claim to describe", () => {
  it("agrees with a fresh computation, facet for facet", () => {
    // Same function that generated the file — so this is an equality check,
    // not a reimplementation that could drift in its own direction.
    expect(published.corpus).toEqual(computed.corpus);
    expect(published.gapMap).toEqual(computed.gapMap);
    for (const key of [
      "byRegionGroup",
      "byStateProvince",
      "byCity",
      "thinnestMetros",
      "densestMetros",
      "byCuisine",
      "byBookingPath",
      "bySpendBand",
      "byPlanningLoad",
      "byDaypart",
      "byServiceStyle",
      "byAccessibility",
      "byDietary",
      "byStrongestOccasion",
    ] as const) {
      expect(published[key], `facet ${key} is stale — run npm run build:atlas`).toEqual(
        computed[key],
      );
    }
  });

  it("agrees on the record lists it publishes", () => {
    const slugs = (rows: ReadonlyArray<{ slug: string }>) => rows.map((r) => r.slug);
    expect(slugs(published.conflictRecords)).toEqual(slugs(computed.conflictRecords));
    expect(slugs(published.overdueRecords)).toEqual(slugs(computed.overdueRecords));
    expect(slugs(published.dueSoonRecords)).toEqual(slugs(computed.dueSoonRecords));
    expect(slugs(published.depthLeaders)).toEqual(slugs(computed.depthLeaders));
    expect(slugs(published.thinnest)).toEqual(slugs(computed.thinnest));
    expect(published.unreachableCount).toBe(computed.unreachable.length);
    expect(published.fullCaseFileCount).toBe(computed.fullCaseFiles.length);
  });
});

describe("the corpus stays out of the browser bundle", () => {
  it("is imported by nothing a route can reach", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = resolve(dir, entry.name);
        if (entry.isDirectory()) {
          walk(path);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry.name)) continue;
        if (/atlas-compute\.ts$|atlas-freshness\.test\.ts$/.test(entry.name)) continue;
        const body = readFileSync(path, "utf8");
        if (/^[ \t]*import\s[^;]*from\s+["']@\/lib\/atlas-compute["']/m.test(body)) {
          offenders.push(path.slice(ROOT.length + 1));
        }
      }
    };
    walk(resolve(ROOT, "src"));
    expect(offenders).toEqual([]);
  });

  it("keeps the published file small enough to be worth the trouble", () => {
    const atlas = readFileSync(resolve(ROOT, "src/data/atlas.json")).length;
    const corpus = readFileSync(resolve(ROOT, "src/data/dataset.json")).length;
    expect(atlas).toBeLessThan(corpus / 20);
  });
});

describe("the slug index can find every record", () => {
  it("maps every corpus slug to a region file that exists", async () => {
    const { records } = await import("@/lib/dataset");
    const idx = (await import("@/data/slug-index.json")).default as {
      groups: string[];
      slugs: Record<string, number>;
    };
    const missing = records.filter((r) => idx.slugs[r.slug] === undefined).map((r) => r.slug);
    expect(missing).toEqual([]);

    const files = new Set(readdirSync(resolve(ROOT, "src/data/by-region")).map((f) => f.replace(/\.json$/, "")));
    const danglingGroups = idx.groups.filter((g) => !files.has(g));
    expect(danglingGroups).toEqual([]);
  });

  it("actually resolves a record through the index, without the corpus", async () => {
    const { loadRecordBySlug } = await import("@/lib/region-load");
    // One from each of a few regions, so a broken filename mapping shows up.
    for (const slug of ["canlis", "kachka", "le-bernardin", "franklin-barbecue-austin"]) {
      const found = await loadRecordBySlug(slug);
      expect(found?.slug, `${slug} could not be resolved`).toBe(slug);
    }
    expect(await loadRecordBySlug("not-a-real-slug")).toBeNull();
  });
});
