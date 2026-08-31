/**
 * Matched public health-inspection snapshots.
 * Empty means not on file — never inferred from cuisine, stars, or reviews.
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
