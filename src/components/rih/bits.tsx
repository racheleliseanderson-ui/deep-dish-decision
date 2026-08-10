import { cn } from "@/lib/utils";
import type { FindingLayer } from "@/lib/intelligence";
import type { ReactNode } from "react";

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-eyebrow", className)}>{children}</p>;
}

export function Chip({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "critical" | "watch" | "unknown" | "verified";
  className?: string;
}) {
  const tones: Record<string, string> = {
    neutral: "border-border bg-surface-raised text-muted-foreground",
    accent: "border-primary/35 bg-primary/10 text-primary",
    critical: "border-critical/40 bg-critical-soft text-critical",
    watch: "border-watch/35 bg-watch-soft text-watch",
    unknown: "border-unknown/35 bg-unknown-soft text-unknown",
    verified: "border-verified/35 bg-verified-soft text-verified",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] leading-none tracking-wide",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function LayerDot({ layer }: { layer: FindingLayer }) {
  const map: Record<FindingLayer, string> = {
    critical: "bg-critical",
    watch: "bg-watch",
    unknown: "bg-unknown",
  };
  return <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", map[layer])} />;
}

export function Meter({
  value,
  label,
  tone = "primary",
  invert = false,
}: {
  value: number;
  label: string;
  tone?: "primary" | "critical" | "watch";
  invert?: boolean;
}) {
  const bar =
    tone === "critical" ? "bg-critical" : tone === "watch" ? "bg-watch" : "bg-primary";
  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-eyebrow">{label}</span>
        <span className="text-num text-sm text-foreground">{value}</span>
      </div>
      <div className="mt-1.5 h-[3px] w-full overflow-hidden rounded-full bg-surface-sunken">
        <div
          className={cn("h-full rounded-full transition-[width] duration-700 ease-instrument", bar)}
          style={{ width: `${invert ? 100 - value : value}%` }}
        />
      </div>
    </div>
  );
}

export function Stat({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: ReactNode;
  note?: string;
  tone?: "critical" | "watch" | "unknown" | "verified";
}) {
  const color =
    tone === "critical"
      ? "text-critical"
      : tone === "watch"
        ? "text-watch"
        : tone === "unknown"
          ? "text-unknown"
          : tone === "verified"
            ? "text-verified"
            : "text-foreground";
  return (
    <div className="min-w-0">
      <p className="text-eyebrow truncate">{label}</p>
      <p className={cn("text-num mt-1 text-2xl font-medium tracking-tight", color)}>{value}</p>
      {note ? <p className="mt-1 truncate text-xs text-subtle">{note}</p> : null}
    </div>
  );
}

export function Toggle({
  active,
  onClick,
  children,
  size = "md",
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  size?: "sm" | "md";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border text-left transition-all duration-300 ease-instrument",
        size === "sm" ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs",
        active
          ? "border-primary/50 bg-primary/12 text-primary shadow-[0_0_0_1px_var(--color-primary)_inset]"
          : "border-border bg-surface-raised/60 text-muted-foreground hover:border-border-strong hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-eyebrow">{label}</span>
        {hint ? <span className="text-[11px] text-subtle">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

export function Rule({ className }: { className?: string }) {
  return <div className={cn("hairline my-6", className)} />;
}
