/**
 * The atlas aggregates, as data.
 *
 * /atlas used to import src/lib/atlas-compute.ts, which imports the whole
 * corpus — so opening the page downloaded a 5.4 MB JavaScript chunk to render
 * a few hundred counts and averages. The numbers are deterministic and change
 * only when the corpus does, so they are computed once at build time
 * (scripts/build-atlas.ts) and read here: 101 KB instead of 5.4 MB.
 *
 * Same export names as before, so the page did not have to be rewritten around
 * this. The two exceptions are `unreachable` and `fullCaseFiles`, which were
 * only ever read for their length — they are counts now, because serialising
 * ~600 records to render two numbers would have undone the point.
 */
import raw from "@/data/atlas.json";

export type Facet = {
  label: string;
  count: number;
  share: number;
  thin: number;
  conflicts: number;
  avgUnknowns: number;
  reachable: number;
};

/** The fields src/routes/atlas.tsx renders off a record. */
export type AtlasRecord = {
  slug: string;
  title: string;
  region: string;
  recordId: string;
  depthLabel: string;
  unknownsCount: number;
  thinFieldCount: number;
  reviewedAt: string;
  nextReviewAt: string;
  conflict: string;
};

type AtlasFile = {
  generatedAt: string;
  corpus: {
    count: number;
    regions: number;
    regionGroups: number;
    cuisines: number;
    bookingPaths: number;
    reachable: number;
    fullCaseFiles: number;
    conflicts: number;
    avgDepth: number;
    totalUnknowns: number;
    totalThin: number;
    generatedAt: string;
    sourceSync: string;
  };
  caseDepth: {
    totalFields: number;
    avgUnstated: number;
    completeCaseFiles: number;
  };
  gapMap: { field: string; missing: number; share: number }[];
  unreachableCount: number;
  fullCaseFileCount: number;
} & Record<string, unknown>;

const data = raw as unknown as AtlasFile;
const facets = (key: string) => (data[key] ?? []) as Facet[];
const rows = (key: string) => (data[key] ?? []) as AtlasRecord[];

export const corpus = data.corpus;
export const gapMap = data.gapMap;

/** The field-level reading of the corpus. See atlas-compute.ts. */
export const caseDepth = data.caseDepth;

export const byRegionGroup = facets("byRegionGroup");
export const byStateProvince = facets("byStateProvince");
export const byCity = facets("byCity");
export const thinnestMetros = facets("thinnestMetros");
export const densestMetros = facets("densestMetros");
export const byCuisine = facets("byCuisine");
export const byBookingPath = facets("byBookingPath");
export const bySpendBand = facets("bySpendBand");
export const byPlanningLoad = facets("byPlanningLoad");
export const byDaypart = facets("byDaypart");
export const byServiceStyle = facets("byServiceStyle");
export const byAccessibility = facets("byAccessibility");
export const byDietary = facets("byDietary");
export const byStrongestOccasion = facets("byStrongestOccasion");

export const conflictRecords = rows("conflictRecords");
export const overdueRecords = rows("overdueRecords");
export const dueSoonRecords = rows("dueSoonRecords");
export const depthLeaders = rows("depthLeaders");
export const thinnest = rows("thinnest");

export const unreachableCount = data.unreachableCount;
export const fullCaseFileCount = data.fullCaseFileCount;

/** The five strongest records per occasion, precomputed. See atlas-compute.ts. */
export type AtlasPick = AtlasRecord & {
  serviceSummary: string;
  occasionFit: string;
  city: string;
  regionGroup: string;
  cuisineTags: string[];
  spendBands: string[];
  bookingPlatforms: string[];
};
export const topPicksByOccasion = (data["topPicksByOccasion"] ?? {}) as Record<
  string,
  (AtlasPick & { score: number })[]
>;

/** When these numbers were last computed from the corpus. */
export const atlasGeneratedAt = data.generatedAt;
