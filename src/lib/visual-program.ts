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
import { slugExists } from "@/lib/corpus-meta";
import { markFamily, type MarkFamily } from "@/lib/listing-visual";

export type VisualKind =
  | "exterior"
  | "dining_room"
  | "signature_dish"
  | "representative_food"
  | "bar_lounge"
  | "patio_view"
  | "portrait"
  /** The restaurant's own logo, wordmark or crest. Not a photograph. */
  | "identity_logo"
  /** A composite of photography and logotype, published as brand artwork. */
  | "branded_graphic"
  | "editorial_illustration"
  | "identity_mark";

/** Kinds that depict the real place, as opposed to its branding. */
export const PHOTOGRAPHIC_KINDS: readonly VisualKind[] = [
  "dining_room",
  "exterior",
  "portrait",
  "signature_dish",
  "representative_food",
  "bar_lounge",
  "patio_view",
];

/** Artwork is letterboxed on a neutral tile; a photograph is cropped to fill. */
export function isArtwork(kind: VisualKind): boolean {
  return (
    kind === "identity_logo" || kind === "branded_graphic" || kind === "editorial_illustration"
  );
}

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
  /** Intrinsic pixel size of the source, for reserving the box. */
  width?: number;
  height?: number;
  /** Responsive derivatives, narrowest first. */
  sources?: { w: number; src: string; bytes: number }[];
};

type VisualFile = {
  generatedAt?: string;
  note?: string;
  images: RestaurantVisual[];
};

const file = visualRaw as VisualFile;

/* A photograph of the room always beats brand artwork; artwork beats nothing. */
const PRIORITY: VisualKind[] = [
  "signature_dish",
  "dining_room",
  "exterior",
  "representative_food",
  "bar_lounge",
  "patio_view",
  "portrait",
  "branded_graphic",
  "identity_logo",
  "editorial_illustration",
];

export function allVisuals(): RestaurantVisual[] {
  return file.images;
}

/** Reject cross-wired photography — slug must match an existing record. */
export function assertVisualSafe(visual: RestaurantVisual, slug: string): boolean {
  if (visual.slug !== slug) return false;
  if (!slugExists(slug)) return false;
  if (visual.provenance.kind === "editorial_illustration" && visual.documentary) return false;
  // Only a photographic kind may claim to document the place.
  if (visual.documentary && !PHOTOGRAPHIC_KINDS.includes(visual.kind)) return false;
  // ...and a photographic kind that denies being documentary is mislabelled.
  if (!visual.documentary && PHOTOGRAPHIC_KINDS.includes(visual.kind)) return false;
  return true;
}

/* Indexed once rather than scanned per card — this runs on every paint. */
const bySlug: Map<string, RestaurantVisual[]> = (() => {
  const map = new Map<string, RestaurantVisual[]>();
  for (const img of file.images) {
    if (!assertVisualSafe(img, img.slug)) continue;
    const list = map.get(img.slug) ?? [];
    list.push(img);
    map.set(img.slug, list);
  }
  return map;
})();

export function visualsFor(slug: string): RestaurantVisual[] {
  return bySlug.get(slug) ?? [];
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
  return `Identity mark (${family}), drawn from cuisine and room signals recorded for ${record.title}.`;
}

export function provenanceLabel(visual: RestaurantVisual): string {
  const p = visual.provenance;
  if (p.kind === "restaurant_owned") {
    const what =
      visual.kind === "identity_logo"
        ? "Restaurant's own logo"
        : visual.kind === "branded_graphic"
          ? "Restaurant-published brand artwork"
          : "Restaurant-owned photograph";
    return `${what} · ${p.retrievedAt.slice(0, 10)}`;
  }
  if (p.kind === "licensed_media") return `Licensed media · ${p.credit}`;
  if (p.kind === "editorial_illustration")
    return `Editorial illustration. ${p.note}`;
  return "Identity mark, drawn from the record.";
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
