import { CASE_FIELDS, isUnstated } from "@/lib/case-depth";
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

/**
 * A record counts as thin at four or more unstated core slots. Kept in step
 * with THIN_FIELD_THRESHOLD in scripts/pipeline/level-format.mjs, which the
 * browser bundle cannot import; the pipeline counts ops.thinRecords with the
 * same number so the Atlas columns and the ops block agree.
 */
export const THIN_FIELD_THRESHOLD = 4;

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
    thin: rows.filter((r) => r.thinFieldCount >= THIN_FIELD_THRESHOLD).length,
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

/**
 * Fields that are most often unstated across the corpus — the real gap map.
 *
 * Counted with the same isUnstated() over the same CASE_FIELDS the record page
 * renders, so the map and the page cannot disagree. It used to count each
 * record's stored `thinFields`, which is derived from the pipeline's 12-slot
 * CORE_SLOTS: beverage, meal length and parking/transit are not in that list,
 * so the map reported parking at 2%, meal length at 0% and beverage not at all
 * while the record page held all three open on nearly every record.
 */
export const gapMap: { field: string; missing: number; share: number }[] = (() => {
  const counts = new Map<string, number>();
  for (const r of records) {
    for (const f of CASE_FIELDS) {
      if (isUnstated(r[f.key] as string | null | undefined)) {
        counts.set(f.label, (counts.get(f.label) ?? 0) + 1);
      }
    }
  }
  return Array.from(counts.entries())
    .map(([field, missing]) => ({
      field,
      missing,
      share: Math.round((missing / records.length) * 100),
    }))
    .sort((a, b) => b.missing - a.missing || a.field.localeCompare(b.field));
})();

/**
 * The field-level reading of the same corpus, and the honest companion to
 * `corpus.avgDepth`.
 *
 * `avgDepth` is a schema check: level-format.mjs counts a core slot as filled
 * unless emptyish() matches a short token like "n/a", and the leveling floor
 * sentence ("Not stated on the restaurant's own pages...") is neither short nor
 * matched, so a record whose twelve core fields all say nothing still scores
 * 12 / 12. It measures whether the slot carries text, not whether the
 * restaurant published anything.
 *
 * This measures the second thing, with the same isUnstated() over the same
 * CASE_FIELDS the record page renders -- so /atlas and a record page cannot
 * report opposite readings of the same file.
 */
export const caseDepth = (() => {
  const totalFields = CASE_FIELDS.length;
  let unstated = 0;
  let complete = 0;
  for (const r of records) {
    const missing = CASE_FIELDS.filter((f) =>
      isUnstated(r[f.key] as string | null | undefined),
    ).length;
    unstated += missing;
    if (missing === 0) complete += 1;
  }
  return {
    totalFields,
    avgUnstated: records.length ? Math.round((unstated / records.length) * 100) / 100 : 0,
    completeCaseFiles: complete,
  };
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
