/**
 * Serialise the atlas aggregates so the browser never loads the corpus.
 *
 * Run through vite-node, so this imports the real src/lib/atlas-compute.ts —
 * the same code that produced these numbers when /atlas computed them live.
 * There is no second implementation to drift.
 *
 * Record lists are projected down to the fields the page actually renders.
 * Shipping whole records here would put a large slice of the corpus back into
 * the payload, which is the thing this exists to prevent.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as atlas from "../src/lib/atlas-compute";
import type { RestaurantRecord } from "../src/lib/dataset";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Only what src/routes/atlas.tsx reads off a record. */
const slim = (r: RestaurantRecord) => ({
  slug: r.slug,
  title: r.title,
  region: r.region,
  recordId: r.recordId,
  depthLabel: r.depthLabel,
  unknownsCount: r.unknownsCount,
  thinFieldCount: r.thinFieldCount,
  reviewedAt: r.reviewedAt,
  nextReviewAt: r.nextReviewAt,
  conflict: r.conflict,
});

/** /guide renders more of a record than /atlas does, so its picks carry more. */
const pick = (r: RestaurantRecord) => ({
  ...slim(r),
  serviceSummary: r.serviceSummary,
  occasionFit: r.occasionFit,
  city: r.city,
  regionGroup: r.regionGroup,
  cuisineTags: r.cuisineTags,
  spendBands: r.spendBands,
  bookingPlatforms: r.bookingPlatforms,
});

const out = {
  generatedAt: new Date().toISOString(),
  corpus: atlas.corpus,
  caseDepth: atlas.caseDepth,
  byRegionGroup: atlas.byRegionGroup,
  byStateProvince: atlas.byStateProvince,
  byCity: atlas.byCity,
  thinnestMetros: atlas.thinnestMetros,
  densestMetros: atlas.densestMetros,
  byCuisine: atlas.byCuisine,
  byBookingPath: atlas.byBookingPath,
  bySpendBand: atlas.bySpendBand,
  byPlanningLoad: atlas.byPlanningLoad,
  byDaypart: atlas.byDaypart,
  byServiceStyle: atlas.byServiceStyle,
  byAccessibility: atlas.byAccessibility,
  byDietary: atlas.byDietary,
  byStrongestOccasion: atlas.byStrongestOccasion,
  gapMap: atlas.gapMap,
  conflictRecords: atlas.conflictRecords.map(slim),
  overdueRecords: atlas.overdueRecords.map(slim),
  dueSoonRecords: atlas.dueSoonRecords.map(slim),
  depthLeaders: atlas.depthLeaders.map(slim),
  thinnest: atlas.thinnest.map(slim),
  // Only ever read as .length, so a count is the whole requirement. Emitting
  // the arrays would put ~600 records back into the payload for two numbers.
  topPicksByOccasion: Object.fromEntries(
    Object.entries(atlas.topPicksByOccasion).map(([occasion, rows]) => [
      occasion,
      rows.map(({ r, score }) => ({ ...pick(r), score })),
    ]),
  ),
  unreachableCount: atlas.unreachable.length,
  fullCaseFileCount: atlas.fullCaseFiles.length,
};

const target = join(root, "src/data/atlas.json");
writeFileSync(target, JSON.stringify(out));
const kb = (JSON.stringify(out).length / 1024).toFixed(0);
console.log(`atlas aggregates -> src/data/atlas.json (${kb} KB, from a 6.6 MB corpus)`);
