/**
 * Deterministic plate marks for listings.
 * No photographs, no stock imagery — pure SVG derived from first-party
 * cuisineTags, formalityBand, atmosphereSummary / energy signals, and slug.
 * Same inputs always produce the same mark.
 */

import type { RestaurantRecord } from "@/lib/dataset";
import type { ReactNode } from "react";

export type MarkFamily =
  | "plate"
  | "bowl"
  | "counter"
  | "tasting"
  | "grill"
  | "garden"
  | "bar"
  | "hearth"
  | "raw"
  | "default";

/** Map cuisine + formality + atmosphere signals → a mark family. */
export function markFamily(r: RestaurantRecord): MarkFamily {
  const tags = (r.cuisineTags ?? []).map((t) => t.toLowerCase());
  const form = (r.formalityBand ?? "").toLowerCase();
  const atmo = `${r.atmosphereSummary ?? ""} ${r.signals?.energy ?? ""}`.toLowerCase();
  const service = (r.serviceStyles ?? []).map((s) => s.toLowerCase()).join(" ");

  if (tags.some((t) => /omakase|tasting|kaiseki|degustation/.test(t)) || /tasting|immersive/.test(service))
    return "tasting";
  if (tags.some((t) => /sushi|sashimi|raw|oyster|crudo|ceviche/.test(t))) return "raw";
  if (tags.some((t) => /steak|grill|bbq|wood-fired|asador|churrasco/.test(t)) || /grill|hearth/.test(atmo))
    return "grill";
  if (tags.some((t) => /bar|cocktail|wine|tapas|small plate/.test(t)) || /bar-led|late/.test(service))
    return "bar";
  if (tags.some((t) => /garden|farm|vegetable|plant|green/.test(t)) || /garden|terrace/.test(atmo))
    return "garden";
  if (tags.some((t) => /ramen|noodle|pho|bowl|soup|stew/.test(t))) return "bowl";
  if (/counter|chef.?s counter|omakase/.test(service) || /counter/.test(atmo)) return "counter";
  if (/fine|formal|jacket|black-tie|white-table/.test(form) || /formal|quiet|calm/.test(atmo))
    return "plate";
  if (/hearth|fireplace|wood|rustic/.test(atmo)) return "hearth";
  return "default";
}

/** Stable numeric seed from slug (for variation inside a family). */
export function visualSeed(slug: string): number {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (Math.imul(31, h) + slug.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function markAccent(r: RestaurantRecord): string {
  const family = markFamily(r);
  switch (family) {
    case "tasting":
    case "plate":
      return "var(--color-gilt)";
    case "grill":
    case "hearth":
      return "var(--color-watch)";
    case "raw":
    case "bar":
      return "var(--color-primary)";
    case "garden":
      return "var(--color-verified)";
    case "bowl":
    case "counter":
      return "var(--color-unknown)";
    default:
      return "var(--color-gilt)";
  }
}

/**
 * Pure SVG plate mark. size controls the viewBox scale (default 96).
 * Renders a circular plate with a family-specific glyph.
 */
export function PlateMarkSvg({
  r,
  size = 96,
  className,
}: {
  r: RestaurantRecord;
  size?: number;
  className?: string;
}) {
  const family = markFamily(r);
  const seed = visualSeed(r.slug);
  const accent = markAccent(r);
  const rot = (seed % 24) - 12;

  const ring = (
    <>
      <circle cx="48" cy="48" r="44" fill="none" stroke="currentColor" strokeWidth="1.25" opacity="0.35" />
      <circle cx="48" cy="48" r="38" fill="none" stroke="currentColor" strokeWidth="0.75" opacity="0.18" />
    </>
  );

  let glyph: ReactNode;
  switch (family) {
    case "tasting":
      glyph = (
        <>
          <circle cx="48" cy="48" r="6" fill={accent} opacity="0.9" />
          <path d="M48 22 A26 26 0 0 1 74 48" fill="none" stroke={accent} strokeWidth="1.5" strokeLinecap="round" />
          <path d="M48 28 A20 20 0 0 1 68 48" fill="none" stroke={accent} strokeWidth="1.2" strokeLinecap="round" opacity="0.7" />
          <path d="M48 34 A14 14 0 0 1 62 48" fill="none" stroke={accent} strokeWidth="1" strokeLinecap="round" opacity="0.5" />
        </>
      );
      break;
    case "raw":
      glyph = (
        <>
          <rect x="32" y="36" width="32" height="20" rx="1.5" fill="none" stroke={accent} strokeWidth="1.5" />
          <line x1="28" y1="58" x2="68" y2="34" stroke={accent} strokeWidth="1.25" strokeLinecap="round" opacity="0.8" />
          <circle cx="48" cy="46" r="2.5" fill={accent} />
        </>
      );
      break;
    case "grill":
      glyph = (
        <>
          {[0, 1, 2, 3].map((i) => (
            <line
              key={i}
              x1="30"
              y1={34 + i * 8}
              x2="66"
              y2={34 + i * 8}
              stroke={accent}
              strokeWidth="2"
              strokeLinecap="round"
              opacity={0.85 - i * 0.12}
            />
          ))}
        </>
      );
      break;
    case "bar":
      glyph = (
        <>
          <path
            d="M36 30 L40 52 Q48 62 56 52 L60 30 Z"
            fill="none"
            stroke={accent}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <line x1="36" y1="30" x2="60" y2="30" stroke={accent} strokeWidth="1.5" />
          <line x1="48" y1="62" x2="48" y2="68" stroke={accent} strokeWidth="1.5" strokeLinecap="round" />
          <line x1="42" y1="68" x2="54" y2="68" stroke={accent} strokeWidth="1.5" strokeLinecap="round" />
        </>
      );
      break;
    case "garden":
      glyph = (
        <>
          <path
            d="M48 28 C60 36 66 48 48 68 C30 48 36 36 48 28 Z"
            fill="none"
            stroke={accent}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d="M48 34 L48 62" stroke={accent} strokeWidth="1" opacity="0.6" />
        </>
      );
      break;
    case "bowl":
      glyph = (
        <>
          <path
            d="M28 42 Q28 64 48 64 Q68 64 68 42"
            fill="none"
            stroke={accent}
            strokeWidth="1.75"
            strokeLinecap="round"
          />
          <ellipse cx="48" cy="42" rx="20" ry="5" fill="none" stroke={accent} strokeWidth="1.25" />
        </>
      );
      break;
    case "counter":
      glyph = (
        <>
          <line x1="24" y1="44" x2="72" y2="44" stroke={accent} strokeWidth="2" strokeLinecap="round" />
          <circle cx="34" cy="56" r="4" fill="none" stroke={accent} strokeWidth="1.25" />
          <circle cx="48" cy="56" r="4" fill="none" stroke={accent} strokeWidth="1.25" />
          <circle cx="62" cy="56" r="4" fill="none" stroke={accent} strokeWidth="1.25" />
        </>
      );
      break;
    case "hearth":
      glyph = (
        <>
          <path
            d="M48 68 C40 56 36 48 40 38 C44 30 48 28 48 28 C48 28 52 30 56 38 C60 48 56 56 48 68 Z"
            fill="none"
            stroke={accent}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path
            d="M48 60 C44 52 44 46 48 42"
            fill="none"
            stroke={accent}
            strokeWidth="1.1"
            opacity="0.65"
          />
        </>
      );
      break;
    case "plate":
    default:
      glyph = (
        <>
          <circle cx="48" cy="48" r="18" fill="none" stroke={accent} strokeWidth="1.5" />
          <circle cx="48" cy="48" r="4" fill={accent} opacity="0.85" />
          <line x1="48" y1="30" x2="48" y2="36" stroke={accent} strokeWidth="1.25" strokeLinecap="round" />
          <line x1="48" y1="60" x2="48" y2="66" stroke={accent} strokeWidth="1.25" strokeLinecap="round" />
          <line x1="30" y1="48" x2="36" y2="48" stroke={accent} strokeWidth="1.25" strokeLinecap="round" />
          <line x1="60" y1="48" x2="66" y2="48" stroke={accent} strokeWidth="1.25" strokeLinecap="round" />
        </>
      );
  }

  return (
    <svg
      viewBox="0 0 96 96"
      width={size}
      height={size}
      className={className}
      aria-hidden
      style={{ transform: `rotate(${rot}deg)` }}
    >
      {ring}
      <g transform={`rotate(${rot * 0.4} 48 48)`}>{glyph}</g>
    </svg>
  );
}
