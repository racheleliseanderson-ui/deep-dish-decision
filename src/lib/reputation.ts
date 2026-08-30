/**
 * Public reputation evidence — separately sourced from first-party facts.
 *
 * Directory star ratings may appear as context (sample size + recency).
 * They never enter ranking, fail-closed paths, or first-party fields.
 * Recurring praise/complaint language is shown only when a research pass
 * has populated reputation-patterns.json. We do not fabricate consensus.
 */
import patternsRaw from "@/data/reputation-patterns.json";
import { getEnrichment } from "@/lib/enrichment";

export type EvidenceStrength =
  | "none"
  | "listing_sample_only"
  | "thin"
  | "mixed"
  | "strong_but_mixed";

export type ResearchedPattern = {
  sampleSize?: number;
  sourceMix?: string[];
  recency?: string;
  recurringPraise?: string[];
  recurringComplaints?: string[];
  consistencySignal?: string;
  servicePattern?: string;
  portionValuePattern?: string;
  foodQualityPattern?: string;
  dishesRecommended?: string[];
  dishesCriticized?: string[];
  waitPattern?: string;
  cleanlinessPattern?: string;
  localsVisitorPattern?: string;
  patternSummary?: string;
  researchedAt?: string;
};

export type PublicReputationEvidence = {
  slug: string;
  layer: "publicReputationEvidence";
  sourceMix: string[];
  sampleSize: number | null;
  listingRating: number | null;
  recency: string | null;
  retrievedAt: string | null;
  directoryBlurb: string | null;
  recurringPraise: string[];
  recurringComplaints: string[];
  consistencySignal: string | null;
  dishesRecommended: string[];
  dishesCriticized: string[];
  evidenceStrength: EvidenceStrength;
  patternSummary: string;
  rankingEligible: false;
};

type PatternFile = {
  records: Record<string, ResearchedPattern>;
};

const patterns = patternsRaw as PatternFile;

export function getResearchedPattern(slug: string): ResearchedPattern | null {
  return patterns.records[slug] ?? null;
}

export function buildReputation(slug: string): PublicReputationEvidence {
  const researched = getResearchedPattern(slug);
  const google = getEnrichment(slug)?.google;
  const sampleSize = researched?.sampleSize ?? google?.reviewCount ?? null;
  const listingRating = google?.rating ?? null;
  const retrievedAt = google?.retrievedAt ?? researched?.researchedAt ?? null;
  const blurb = (google?.editorialSummary ?? "").trim() || null;

  const praise = researched?.recurringPraise ?? [];
  const complaints = researched?.recurringComplaints ?? [];
  const hasResearch = Boolean(
    researched &&
      (praise.length ||
        complaints.length ||
        researched.patternSummary ||
        researched.foodQualityPattern),
  );

  let evidenceStrength: EvidenceStrength = "none";
  if (hasResearch && (praise.length || complaints.length)) {
    evidenceStrength = complaints.length && praise.length ? "strong_but_mixed" : "mixed";
    if ((sampleSize ?? 0) < 40) evidenceStrength = "thin";
  } else if (listingRating != null || sampleSize != null) {
    evidenceStrength = "listing_sample_only";
  }

  const sourceMix = unique([
    ...(researched?.sourceMix ?? []),
    google ? "Google listing (third-party directory)" : "",
  ]);

  return {
    slug,
    layer: "publicReputationEvidence",
    sourceMix,
    sampleSize,
    listingRating,
    recency: researched?.recency ?? (retrievedAt ? retrievedAt.slice(0, 10) : null),
    retrievedAt,
    directoryBlurb: blurb,
    recurringPraise: praise,
    recurringComplaints: complaints,
    consistencySignal: researched?.consistencySignal ?? null,
    dishesRecommended: researched?.dishesRecommended ?? [],
    dishesCriticized: researched?.dishesCriticized ?? [],
    evidenceStrength,
    patternSummary: patternLine({
      hasResearch,
      researched,
      sampleSize,
      listingRating,
      retrievedAt,
    }),
    rankingEligible: false,
  };
}

function patternLine(args: {
  hasResearch: boolean;
  researched: ResearchedPattern | null;
  sampleSize: number | null;
  listingRating: number | null;
  retrievedAt: string | null;
}): string {
  if (args.hasResearch && args.researched?.patternSummary) return args.researched.patternSummary;
  if (args.listingRating != null && args.sampleSize != null) {
    const when = args.retrievedAt ? ` Retrieved ${args.retrievedAt.slice(0, 10)}.` : "";
    return `Public listing sample (Google): ${args.sampleSize.toLocaleString()} reviews, ${args.listingRating} listed as context. This is not a Deep Dish ranking and is not a review-pattern consensus.${when}`;
  }
  if (args.listingRating != null) {
    return `Google lists a ${args.listingRating} rating as a directory signal. Recurring praise and complaint patterns are not on file. This is not a ranking.`;
  }
  return "No public-review pattern is on file. Deep Dish will not invent a consensus.";
}

function unique(items: string[]): string[] {
  return [...new Set(items.map((s) => s.trim()).filter(Boolean))];
}

export function reputationCoverage(): {
  listingSample: number;
  researchedPatterns: number;
} {
  return {
    listingSample: 0, // filled by tests via records walk
    researchedPatterns: Object.keys(patterns.records).length,
  };
}
