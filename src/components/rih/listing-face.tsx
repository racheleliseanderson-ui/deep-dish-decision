import { PlateMarkSvg } from "@/lib/listing-visual";
import type { RestaurantRecord } from "@/lib/dataset";
import { cn } from "@/lib/utils";

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

/** Left-column face for listings: plate mark + rank + fit/burden gauges. */
export function ListingFace({
  r,
  rank,
  fit,
  burden,
  size = 72,
  className,
}: {
  r: RestaurantRecord;
  rank?: number;
  fit?: number;
  burden?: number;
  size?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex shrink-0 flex-col items-start gap-3", className)}>
      <div className="relative">
        <div className="plate flex items-center justify-center overflow-hidden text-foreground" style={{ width: size, height: size }}>
          <PlateMarkSvg r={r} size={size - 12} />
        </div>
        {rank != null ? (
          <span className="text-num absolute -left-1 -top-1 rounded-full bg-surface px-1.5 py-0.5 text-[11px] font-medium text-primary shadow-sm">
            {String(rank).padStart(2, "0")}
          </span>
        ) : null}
      </div>
      {fit != null && burden != null ? (
        <FitBurden fit={fit} burden={burden} className="w-full max-w-[88px]" />
      ) : null}
    </div>
  );
}
