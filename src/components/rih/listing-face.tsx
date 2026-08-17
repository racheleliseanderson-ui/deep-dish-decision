import { PlateMarkSvg } from "@/lib/listing-visual";
import type { RestaurantRecord } from "@/lib/dataset";
import { cn } from "@/lib/utils";

/** Compact fit / burden meters for the plate column. */
export function MiniMeter({
  label,
  value,
  tone = "primary",
}: {
  label: string;
  value: number;
  tone?: "primary" | "critical" | "watch";
}) {
  const bar =
    tone === "critical" ? "bg-critical" : tone === "watch" ? "bg-watch" : "bg-primary";
  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between gap-1">
        <span className="text-[10px] uppercase tracking-[0.14em] text-subtle">{label}</span>
        <span className="text-num text-[11px] text-foreground">{value}</span>
      </div>
      <div className="mt-1 h-[2px] w-full overflow-hidden rounded-full bg-surface-sunken">
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
      <MiniMeter label="Fit" value={fit} />
      <MiniMeter
        label="Burden"
        value={burden}
        tone={burden >= 70 ? "critical" : burden >= 45 ? "watch" : "primary"}
      />
    </div>
  );
}

/**
 * Left-column face of a listing: deterministic plate mark + optional gauges.
 * Never uses photographs or stock imagery.
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
  return (
    <div className={cn("flex shrink-0 flex-col items-center gap-3", className)}>
      <div className="relative">
        {rank != null ? (
          <span className="text-num absolute -left-1 -top-1 z-10 text-2xl font-medium leading-none text-primary">
            {String(rank).padStart(2, "0")}
          </span>
        ) : null}
        <div className="plate flex items-center justify-center p-2 text-muted-foreground">
          <PlateMarkSvg r={record} size={size} />
        </div>
      </div>
      {showGauges && fit != null && burden != null ? (
        <FitBurden fit={fit} burden={burden} className="w-[88px]" />
      ) : null}
    </div>
  );
}
