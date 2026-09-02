import { dataset, records, type RestaurantRecord } from "@/lib/dataset";
import { OCCASIONS, occasionScore, topOccasion, type Occasion } from "@/lib/intelligence";

/**
 * Derived corpus intelligence — BUILD TIME ONLY.
 *
 * Nothing here invents evidence: every number is counted or averaged from
 * fields already recorded on the case files, and an unstated field is counted
 * as unstated, never inferred.
 *
 * This module imports the whole 6.6 MB corpus, which is why the browser must
 * never reach it. /atlas used to import it directly and shipped a 5.4 MB chunk
 * to render a few hundred aggregate numbers. scripts/build-atlas.ts runs this
 * at build time and serialises the result to src/data/atlas.json; src/lib/atlas.ts
 * reads that file and is what the page imports.
 *
 * The split exists so the numbers are produced by exactly one implementation.
 * A hand-written .mjs generator would have had to reimplement occasionScore,
 * and a second copy of scoring logic is a drift bug with a long fuse.
 */

export type Facet = {
  label: string;
  count: number;
  share: number;
  thin: number;
  conflicts: number;
  avgUnknowns: number;
  reachable: number;
};

function facet(label: string, rows: RestaurantRecord[], total: number): Facet {
  const unknowns = rows.reduce((a, r) => a + r.unknownsCount, 0);
  return {
    label,
    count: rows.length,
    share: total ? Math.round((rows.length / total) * 100) : 0,
    thin: rows.filter((r) => r.thinFieldCount >= 4).length,
    conflicts: rows.filter((r) => r.hasOfficialConflict).length,
    avgUnknowns: rows.length ? Math.round((unknowns / rows.length) * 10) / 10 : 0,
    reachable: rows.filter((r) => r.hasPhone).length,
  };
}

function groupBy(key: (r: RestaurantRecord) => string[]): Facet[] {
  const map = new Map<string, RestaurantRecord[]>();
  for (const r of records) {
    const keys = key(r);
    for (const k of keys.length ? keys : ["Unstated"]) {
      const list = map.get(k) ?? [];
      list.push(r);
      map.set(k, list);
    }
  }
  return Array.from(map.entries())
    .map(([label, rows]) => facet(label, rows, records.length))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export const byRegionGroup = groupBy((r) => [r.regionGroup || r.region]);
export const byStateProvince = groupBy((r) => [r.stateProvince || "Unstated"]);
export const byCity = groupBy((r) => {
  const city = (r.city || "").trim();
  const state = (r.stateProvince || "").trim();
  if (!city) return ["Unstated city"];
  return [state ? `${city}, ${state}` : city];
});
export const thinnestMetros = [...byCity].sort(
  (a, b) => a.count - b.count || a.label.localeCompare(b.label),
);
export const densestMetros = byCity;
export const byCuisine = groupBy((r) => r.cuisineTags);
export const byBookingPath = groupBy((r) => r.bookingPlatforms);
export const bySpendBand = groupBy((r) => r.spendBands ?? []);
export const byPlanningLoad = groupBy((r) => (r.planningLoad ? [r.planningLoad] : []));
export const byDaypart = groupBy((r) => r.daypartTags ?? []);
export const byServiceStyle = groupBy((r) => r.serviceStyles);
export const byAccessibility = groupBy((r) => r.accessibilityTags);
export const byDietary = groupBy((r) => r.dietaryTags);

/** Which occasion each record reads strongest for, on its own evidence. */
export const byStrongestOccasion = (() => {
  const map = new Map<string, RestaurantRecord[]>();
  for (const r of records) {
    const k = topOccasion(r).occasion;
    const list = map.get(k) ?? [];
    list.push(r);
    map.set(k, list);
  }
  return Array.from(map.entries())
    .map(([label, rows]) => facet(label, rows, records.length))
    .sort((a, b) => b.count - a.count);
})();

/** Fields that are most often unstated across the corpus — the real gap map. */
export const gapMap: { field: string; missing: number; share: number }[] = (() => {
  const counts = new Map<string, number>();
  for (const r of records) {
    for (const f of r.thinFields) counts.set(f, (counts.get(f) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([field, missing]) => ({
      field,
      missing,
      share: Math.round((missing / records.length) * 100),
    }))
    .sort((a, b) => b.missing - a.missing);
})();

export const conflictRecords = records.filter((r) => r.hasOfficialConflict);
export const overdueRecords = records.filter((r) => r.reviewStatus === "overdue");
export const dueSoonRecords = records.filter((r) => r.reviewDueSoon);
export const fullCaseFiles = records.filter((r) => r.isFullCaseFile);
export const unreachable = records.filter((r) => !r.hasPhone);

export const depthLeaders = [...records]
  .sort((a, b) => b.depthFilled - a.depthFilled || a.unknownsCount - b.unknownsCount)
  .slice(0, 8);

export const thinnest = [...records]
  .sort((a, b) => b.thinFieldCount - a.thinFieldCount || b.unknownsCount - a.unknownsCount)
  .slice(0, 8);

export const corpus = {
  count: records.length,
  regions: dataset.regions,
  regionGroups: byRegionGroup.length,
  cuisines: byCuisine.length,
  bookingPaths: byBookingPath.length,
  reachable: records.filter((r) => r.hasPhone).length,
  fullCaseFiles: fullCaseFiles.length,
  conflicts: conflictRecords.length,
  avgDepth:
    Math.round(
      (records.reduce((a, r) => a + r.depthFilled / Math.max(1, r.depthTotal), 0) /
        records.length) *
        100,
    ) || 0,
  totalUnknowns: records.reduce((a, r) => a + r.unknownsCount, 0),
  totalThin: records.reduce((a, r) => a + r.thinFieldCount, 0),
  generatedAt: dataset.generatedAt,
  sourceSync: dataset.sourceSync,
};

/**
 * The five strongest records for each occasion.
 *
 * /guide scored the whole corpus in the browser to show five rows, which is
 * why it imported the dataset. There are only a handful of occasions and the
 * scores move only when the corpus does, so the whole table is a few KB
 * precomputed — and it is computed by the same occasionScore the app uses,
 * not a copy of it.
 */
export const topPicksByOccasion: Record<Occasion, { r: RestaurantRecord; score: number }[]> =
  Object.fromEntries(
    OCCASIONS.map((occasion) => [
      occasion,
      [...records]
        .map((r) => ({ r, score: occasionScore(r, occasion) }))
        .sort((a, b) => b.score - a.score || a.r.unknownsCount - b.r.unknownsCount)
        .slice(0, 5),
    ]),
  ) as Record<Occasion, { r: RestaurantRecord; score: number }[]>;
