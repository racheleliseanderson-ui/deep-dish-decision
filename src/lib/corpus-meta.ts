/**
 * Slim corpus index — safe to import on home.
 * Does not load dataset.json or enrichment.json.
 */
import raw from "@/data/corpus-meta.json";

export type SlugIndexEntry = {
  slug: string;
  title: string;
  region: string;
  regionGroup: string;
  city: string;
};

export type CorpusOps = {
  overdue: number;
  dueSoon: number;
  current: number;
  officialConflicts: number;
  thinRecords: number;
  avgUnknowns: number;
  avgThinFields: number;
  lastReviewAt: string;
  reachableAtLastReview: number;
};

export type CorpusMeta = {
  generatedAt: string;
  builtAt?: string;
  count: number;
  regions: number;
  source?: string;
  ops: CorpusOps;
  fullCaseFiles?: number;
  listingOnly?: number;
  regionGroups: string[];
  regionsByGroup: Record<string, string[]>;
  regionToGroup: Record<string, string>;
  cuisineTagOptions: string[];
  bookingPlatformOptions: string[];
  spendBandOptions: string[];
  daypartOptions: string[];
  formalityOptions: string[];
  noiseBandOptions: string[];
  planningLoadOptions: string[];
  guestConstraintOptions: string[];
  slugIndex: SlugIndexEntry[];
};

export const corpusMeta = raw as CorpusMeta;

const slugSet = new Set(corpusMeta.slugIndex.map((e) => e.slug));
const entryBySlug = new Map(corpusMeta.slugIndex.map((e) => [e.slug, e]));

export function slugExists(slug: string): boolean {
  return slugSet.has(slug);
}

export function slugEntry(slug: string): SlugIndexEntry | undefined {
  return entryBySlug.get(slug);
}

export function titleForSlug(slug: string): string | undefined {
  return entryBySlug.get(slug)?.title;
}

export function groupForRegion(region: string): string | null {
  return corpusMeta.regionToGroup[region] ?? null;
}

export function regionGroupFileName(group: string): string {
  return group
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
