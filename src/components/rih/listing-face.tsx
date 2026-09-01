import { PlateMarkSvg } from "@/lib/listing-visual";
import { identityCaption, primaryVisual } from "@/lib/visual-program";
import { VisualTile } from "@/components/rih/visual-tile";
import type { RestaurantRecord } from "@/lib/dataset";
import { cn } from "@/lib/utils";

/** Compact fit / burden meters for the plate column. */
export function MiniMeter({
  label,
  value,
  tone = "primary",
  hint,
}: {
  label: string;
  value: number;
  tone?: "primary" | "critical" | "watch";
  hint?: string;
}) {
  const bar = tone === "critical" ? "bg-critical" : tone === "watch" ? "bg-watch" : "bg-primary";
  return (
    <div className="w-full" title={hint}>
      <div className="flex items-baseline justify-between gap-1">
        <span className="text-[10px] uppercase tracking-[0.14em] text-subtle">{label}</span>
        <span className="text-num text-[11px] text-foreground">{value}</span>
      </div>
      <div
        className="mt-1 h-[2px] w-full overflow-hidden rounded-full bg-surface-sunken"
        role="progressbar"
        aria-label={hint ?? label}
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-700 ease-instrument", bar)}
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  );
}

export function FitBurden({
  fit,
  burden,
  className,
}: {
  fit: number;
  burden: number;
  className?: string;
}) {
  return (
    <div className={cn("w-full space-y-2", className)}>
      <MiniMeter
        label="Fit"
        value={fit}
        hint={`Fit ${fit} of 100 — how well this room matches the night you described. Higher is better.`}
      />
      <MiniMeter
        label="To confirm"
        value={burden}
        tone={burden >= 70 ? "critical" : burden >= 45 ? "watch" : "primary"}
        hint={`Confirmation burden ${burden} of 100 — how much you still have to verify yourself before booking. Lower is better.`}
      />
    </div>
  );
}

/**
 * Left-column face of a listing: proven photography when the slug matches,
 * otherwise the deterministic plate mark. Cross-wired photos cannot render.
 */
export function ListingFace({
  record,
  fit,
  burden,
  rank,
  size = 88,
  showGauges = true,
  className,
}: {
  record: RestaurantRecord;
  fit?: number;
  burden?: number;
  rank?: number;
  size?: number;
  showGauges?: boolean;
  className?: string;
}) {
  const visual = primaryVisual(record.slug);
  return (
    <div
      className={cn(
        "flex shrink-0 flex-row items-center gap-4 sm:flex-col sm:items-center sm:gap-3",
        className,
      )}
    >
      <div className="relative">
        {rank != null ? (
          <span className="text-num absolute -left-1 -top-1 z-10 text-2xl font-medium leading-none text-primary">
            {String(rank).padStart(2, "0")}
          </span>
        ) : null}
        {visual ? (
          <VisualTile visual={visual} size={size} priority={rank != null && rank <= 2} />
        ) : (
          <figure className="plate flex items-center justify-center p-2 text-muted-foreground">
            <PlateMarkSvg r={record} size={size} />
            <figcaption className="sr-only">{identityCaption(record)}</figcaption>
          </figure>
        )}
      </div>
      {showGauges && fit != null && burden != null ? (
        <FitBurden fit={fit} burden={burden} className="w-[100px] sm:w-[88px]" />
      ) : null}
    </div>
  );
}
