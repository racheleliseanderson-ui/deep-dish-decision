/**
 * Matched public health-inspection snapshots.
 * Empty means not on file. Nothing here is inferred from cuisine, stars, or reviews.
 */
import raw from "@/data/health-inspections.json";

export type HealthInspection = {
  jurisdiction: string;
  programName: string;
  address: string;
  latestInspectionDate: string | null;
  latestResult: string | null;
  latestScore: number | null;
  grade: string | null;
  closed: boolean;
  redViolations: string[];
  blueViolations: string[];
  sourceUrl: string;
  dataset: string;
  retrievedAt: string;
  matchConfidence: string;
  note: string;
  slug: string;
};

const file = raw as {
  generatedAt?: string;
  note?: string;
  records: Record<string, HealthInspection>;
};

export function getInspection(slug: string): HealthInspection | null {
  return file.records[slug] ?? null;
}

export function inspectionCoverage(): number {
  return Object.keys(file.records).length;
}

/**
 * Whether this build carries an inspection layer at all.
 *
 * Two different facts kept wearing the same sentence. `getInspection` returning
 * null means "nothing matched this restaurant" only when the layer holds
 * records; when the layer is empty — which is what happened on 2026-09-03, when
 * scripts/build-consumer-layers.py ran with its source directory cleared and
 * overwrote 31 matched inspections with `{}` — it means the restaurant was
 * never checked. The first is a finding about the room. The second is a fact
 * about the build, and saying it as the first is a lie the reader cannot see.
 *
 * Every consumer asks this rather than counting records itself.
 */
export function inspectionLayerLoaded(): boolean {
  return Object.keys(file.records).length > 0;
}
