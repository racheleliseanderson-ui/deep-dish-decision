import { cn } from "@/lib/utils";
import type { FindingLayer } from "@/lib/intelligence";
import { Children, cloneElement, isValidElement, useId, type ReactNode } from "react";

/**
 * The small letterspaced label that titles most sections in this app.
 *
 * It defaulted to a <p>, which left `/atlas`, `/console` and `/packet` with an
 * <h1> and then no headings at all — every data table on those pages was
 * titled by a paragraph, so there was no structure to navigate by. Pass `as`
 * to give a section title its real level.
 */
export function Eyebrow({
  children,
  className,
  as: As = "p",
  id,
}: {
  children: ReactNode;
  className?: string;
  as?: "p" | "h2" | "h3" | "h4";
  id?: string;
}) {
  return (
    <As id={id} className={cn("text-eyebrow", className)}>
      {children}
    </As>
  );
}

export function Chip({
  children,
  tone = "neutral",
  className,
  title,
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "critical" | "watch" | "unknown" | "verified";
  className?: string;
  /** Optional hover/AT explanation for a chip whose short label needs one. */
  title?: string;
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
      title={title}
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
  const bar = tone === "critical" ? "bg-critical" : tone === "watch" ? "bg-watch" : "bg-primary";
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
      <p className="text-eyebrow text-balance">{label}</p>
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
        /* Mobile: ≥44px touch; desktop keeps the denser instrument density */
        size === "sm"
          ? "min-h-10 px-3 py-2 text-[11px] sm:min-h-0 sm:px-2.5 sm:py-1"
          : "min-h-11 px-3.5 py-2.5 text-xs sm:min-h-0 sm:px-3 sm:py-1.5",
        active
          ? "border-primary/50 bg-primary/12 text-primary shadow-[0_0_0_1px_var(--color-primary)_inset]"
          : "border-border bg-surface-raised/60 text-muted-foreground hover:border-border-strong hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/**
 * A labelled field.
 *
 * The label used to be a `<span>` next to the control and nothing else — no
 * `<label>`, no `htmlFor`, no `aria-labelledby` — so every select and input in
 * the situation console and the run planner reached a screen reader as
 * "combobox" and "edit text", with the one word that says what they are
 * sitting a node away and unreachable. There is no way to answer "region or
 * cuisine?" from that.
 *
 * So the label is a real `<label>` now, and the id it points at is generated
 * here and handed to the control. When the child is a single form element it
 * gets the id directly; anything else (a row of two inputs, a slider plus its
 * readout) is named as a group instead, which is the honest description of it.
 */
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  const controlId = useId();
  const labelId = `${controlId}-label`;
  const only = Children.count(children) === 1 ? Children.only(children) : null;
  const labelable =
    isValidElement(only) &&
    typeof only.type === "string" &&
    ["input", "select", "textarea"].includes(only.type) &&
    !(only.props as { id?: string }).id;
  const body = labelable
    ? cloneElement(only as React.ReactElement<{ id?: string }>, { id: controlId })
    : children;
  return (
    <div
      className="min-w-0"
      {...(labelable ? {} : { role: "group", "aria-labelledby": labelId })}
    >
      <div className="mb-2 flex items-baseline justify-between gap-3">
        {labelable ? (
          <label id={labelId} className="text-eyebrow" htmlFor={controlId}>
            {label}
          </label>
        ) : (
          <span id={labelId} className="text-eyebrow">
            {label}
          </span>
        )}
        {hint ? <span className="shrink-0 text-[11px] text-subtle">{hint}</span> : null}
      </div>
      {body}
    </div>
  );
}

export function Rule({ className }: { className?: string }) {
  return <div className={cn("hairline my-6", className)} />;
}
