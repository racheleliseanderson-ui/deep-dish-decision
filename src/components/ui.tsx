import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";
import type { ConfirmStatus, FindingLayer, Freshness, PassStatus } from "@/lib/types";

export function Button({
  className,
  variant = "primary",
  asChild = false,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "outline" | "critical";
  asChild?: boolean;
}) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(
        "tap inline-flex min-w-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
        variant === "primary" && "bg-primary text-primary-foreground hover:opacity-90",
        variant === "ghost" && "text-muted-foreground hover:text-foreground",
        variant === "outline" &&
          "border border-border-strong bg-surface text-foreground hover:border-primary/50",
        variant === "critical" && "bg-critical text-primary-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function Chip({
  children,
  active,
  tone,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  tone?: "critical" | "watch" | "unknown" | "verified" | "gilt";
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "tap inline-flex min-w-11 items-center rounded-full border px-3 text-xs transition-colors",
        active
          ? "border-primary/60 bg-primary/12 text-primary"
          : "border-border text-muted-foreground hover:border-border-strong hover:text-foreground",
        tone === "critical" && "border-critical/40 text-critical",
        tone === "watch" && "border-watch/40 text-watch",
        tone === "unknown" && "border-unknown/40 text-unknown",
        tone === "verified" && "border-verified/40 text-verified",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("text-eyebrow", className)}>{children}</p>;
}

export function LayerBadge({ layer }: { layer: FindingLayer | PassStatus | ConfirmStatus | Freshness }) {
  const map: Record<string, string> = {
    critical: "bg-critical-soft text-critical",
    hold: "bg-critical-soft text-critical",
    denied: "bg-critical-soft text-critical",
    conflicting: "bg-critical-soft text-critical",
    watch: "bg-watch-soft text-watch",
    "review-due": "bg-watch-soft text-watch",
    stale: "bg-watch-soft text-watch",
    unknown: "bg-unknown-soft text-unknown",
    open: "bg-unknown-soft text-unknown",
    "still-unknown": "bg-unknown-soft text-unknown",
    incomplete: "bg-unknown-soft text-unknown",
    "in-progress": "bg-unknown-soft text-unknown",
    verified: "bg-verified-soft text-verified",
    confirmed: "bg-verified-soft text-verified",
    current: "bg-verified-soft text-verified",
    "not-applicable": "bg-muted text-muted-foreground",
    abandoned: "bg-muted text-muted-foreground",
    "under-review": "bg-watch-soft text-watch",
  };
  // Badge wording is the whole state model in two words. A room nobody has
  // asked about yet is "Not asked yet", never a failure; "On hold" is only ever
  // said once a stated requirement is genuinely unresolved or refused.
  const label: Record<string, string> = {
    critical: "Must resolve",
    watch: "Worth asking",
    unknown: "Not stated",
    hold: "On hold",
    denied: "They said no",
    open: "Not asked yet",
    "in-progress": "In progress",
    "still-unknown": "Still unknown",
    "not-applicable": "Not applicable",
    "review-due": "Review due soon",
    "under-review": "Being rechecked",
    incomplete: "Not fully published",
    conflicting: "Sources disagree",
    stale: "Past its recheck date",
    abandoned: "Set aside",
    confirmed: "Confirmed",
    verified: "Verified",
    current: "Current",
  };
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.12em]",
        map[layer] ?? "bg-muted text-muted-foreground",
      )}
    >
      {label[layer] ?? layer.replace(/-/g, " ")}
    </span>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[12px] font-medium text-foreground">{label}</span>
      {hint ? <span className="mt-0.5 block text-[12px] text-subtle">{hint}</span> : null}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

export function Select({
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "tap w-full rounded-xl border border-input bg-surface px-3 text-base text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "tap w-full rounded-xl border border-input bg-surface px-3 text-base text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-20 w-full rounded-xl border border-input bg-surface px-3 py-2 text-base text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      {...props}
    />
  );
}
