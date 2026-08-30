/**
 * Restaurant visual program with provenance and identity guards.
 *
 * A photo is shown only when visual.slug === record.slug.
 * Generated / editorial illustrations must set documentary: false
 * and must never be presented as a photograph of a real restaurant.
 * Deterministic plate marks remain the identity fallback.
 */
import visualRaw from "@/data/visual-program.json";
import type { RestaurantRecord } from "@/lib/dataset";
import { bySlug } from "@/lib/dataset";
import { markFamily, type MarkFamily } from "@/lib/listing-visual";

export type VisualKind =
  | "exterior"
  | "dining_room"
  | "signature_dish"
  | "representative_food"
  | "bar_lounge"
  | "patio_view"
  | "editorial_illustration"
  | "identity_mark";

export type VisualProvenance =
  | { kind: "restaurant_owned"; url: string; retrievedAt: string }
  | { kind: "licensed_media"; credit: string }
  | { kind: "editorial_illustration"; note: string }
  | { kind: "identity_mark"; note: "deterministic SVG plate mark" };

export type RestaurantVisual = {
  slug: string;
  kind: VisualKind;
  src: string;
  alt: string;
  provenance: VisualProvenance;
  documentary: boolean;
};

type VisualFile = {
  generatedAt?: string;
  note?: string;
  images: RestaurantVisual[];
};

const file = visualRaw as VisualFile;

const PRIORITY: VisualKind[] = [
  "signature_dish",
  "dining_room",
  "exterior",
  "representative_food",
  "bar_lounge",
  "patio_view",
];

export function allVisuals(): RestaurantVisual[] {
  return file.images;
}

/** Reject cross-wired photography — slug must match an existing record. */
export function assertVisualSafe(visual: RestaurantVisual, slug: string): boolean {
  if (visual.slug !== slug) return false;
  if (!bySlug.has(slug)) return false;
  if (visual.documentary && visual.provenance.kind === "editorial_illustration") return false;
  if (visual.documentary && visual.kind === "identity_mark") return false;
  if (visual.documentary && visual.kind === "editorial_illustration") return false;
  return true;
}

export function visualsFor(slug: string): RestaurantVisual[] {
  return file.images.filter((img) => assertVisualSafe(img, slug));
}

export function primaryVisual(slug: string): RestaurantVisual | null {
  const set = visualsFor(slug);
  for (const kind of PRIORITY) {
    const hit = set.find((v) => v.kind === kind);
    if (hit) return hit;
  }
  return set[0] ?? null;
}

export function identityCaption(record: RestaurantRecord): string {
  const family: MarkFamily = markFamily(record);
  return `Identity mark (${family}) derived from cuisine and room signals on this record — not a photograph of ${record.title}.`;
}

export function provenanceLabel(visual: RestaurantVisual): string {
  const p = visual.provenance;
  if (p.kind === "restaurant_owned") return `Restaurant-owned photography · ${p.retrievedAt.slice(0, 10)}`;
  if (p.kind === "licensed_media") return `Licensed media · ${p.credit}`;
  if (p.kind === "editorial_illustration")
    return `Editorial illustration — not a documentary photo. ${p.note}`;
  return "Identity mark — not a photograph.";
}

export function visualCoverage(): {
  totalImages: number;
  documentary: number;
  slugsWithPhoto: number;
} {
  const safe = file.images.filter((img) => assertVisualSafe(img, img.slug));
  const slugs = new Set(safe.filter((i) => i.documentary).map((i) => i.slug));
  return {
    totalImages: safe.length,
    documentary: safe.filter((i) => i.documentary).length,
    slugsWithPhoto: slugs.size,
  };
}

/** Guard used by tests and any future ingest: same src may not map to two slugs. */
export function findCrossWiredSources(images: RestaurantVisual[] = file.images): string[] {
  const bySrc = new Map<string, Set<string>>();
  for (const img of images) {
    if (!img.documentary) continue;
    const set = bySrc.get(img.src) ?? new Set();
    set.add(img.slug);
    bySrc.set(img.src, set);
  }
  const bad: string[] = [];
  for (const [src, slugs] of bySrc) {
    if (slugs.size > 1) bad.push(src);
  }
  return bad;
}
