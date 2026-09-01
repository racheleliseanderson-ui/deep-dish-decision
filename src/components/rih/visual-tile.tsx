import { isArtwork, provenanceLabel, type RestaurantVisual } from "@/lib/visual-program";
import { cn } from "@/lib/utils";

/**
 * One image from the visual program, rendered honestly.
 *
 * A photograph of the room is cropped to fill its tile. A logo or a brand
 * composite is letterboxed on a neutral ground instead, because cropping a
 * 1500×367 wordmark into a circle produces an illegible smear and implies the
 * image is something it is not.
 *
 * Derivatives come from `scripts/build-image-derivatives.mjs`, so a 72px tile
 * fetches a 96px file rather than a 2048px original.
 */
export function VisualTile({
  visual,
  size,
  rounded = "full",
  priority = false,
  className,
}: {
  visual: RestaurantVisual;
  /** Rendered CSS size of the square tile, in px. */
  size: number;
  rounded?: "full" | "xl";
  /** Above the fold: load eagerly at high priority. */
  priority?: boolean;
  className?: string;
}) {
  const artwork = isArtwork(visual.kind);
  const sources = visual.sources ?? [];
  const srcSet = sources.length ? sources.map((s) => `${s.src} ${s.w}w`).join(", ") : undefined;
  // The tile is square and fixed, so one CSS pixel size covers every viewport;
  // the browser still picks a 2x file on a dense screen.
  const sizes = `${size}px`;
  const best = sources.find((s) => s.w >= size * 2) ?? sources.at(-1);

  return (
    <figure className={cn("relative", className)} style={{ width: size, height: size }}>
      <img
        src={best?.src ?? visual.src}
        {...(srcSet ? { srcSet, sizes } : {})}
        alt={visual.alt}
        width={size}
        height={size}
        loading={priority ? "eager" : "lazy"}
        decoding={priority ? "sync" : "async"}
        {...(priority ? { fetchPriority: "high" as const } : {})}
        className={cn(
          "size-full",
          rounded === "full" ? "rounded-full" : "rounded-xl",
          artwork ? "border border-border bg-surface-raised object-contain p-1.5" : "object-cover",
        )}
      />
      <figcaption className="sr-only">{provenanceLabel(visual)}</figcaption>
    </figure>
  );
}
