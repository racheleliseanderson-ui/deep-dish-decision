/**
 * Per-slug first-party completeness — slim enough for home ranking cards.
 * Replaces a full enrichment.json import on the ranked list.
 */
import raw from "@/data/completeness.json";

export type CompletenessRow = {
  completeness: number | null;
  hasSite: boolean;
  hasGoogle: boolean;
  quoteCount: number;
};

const file = raw as { generatedAt?: string; records: Record<string, CompletenessRow> };

export function getCompleteness(slug: string): CompletenessRow | null {
  return file.records[slug] ?? null;
}

export function isReadyRecord(slug: string, floor = 70): boolean {
  const row = file.records[slug];
  return (row?.completeness ?? 0) >= floor;
}
