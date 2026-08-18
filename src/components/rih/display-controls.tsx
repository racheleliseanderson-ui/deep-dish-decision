import { ThemeToggle } from "@/components/rih/theme-toggle";
import { useEnrichmentSignals } from "@/lib/prefs";
import { cn } from "@/lib/utils";

const SEG =
  "min-h-11 min-w-11 rounded-full px-3 text-[11px] uppercase tracking-[0.14em] transition-colors duration-300 ease-instrument sm:min-h-9";

/**
 * Appearance (dark / light / colorblind) and whether labeled third-party
 * listing signals are shown. Language is English only.
 */
export function DisplayControls({ className }: { className?: string }) {
  const enrichment = useEnrichmentSignals();

  return (
    <div className={cn("no-print flex flex-wrap items-center gap-2", className)}>
      <ThemeToggle />
      <div
        className="inline-flex items-center gap-0.5 rounded-full border border-border bg-surface-raised/70 p-0.5 backdrop-blur"
        role="group"
        aria-label="Listing signals"
      >
        {(
          [
            [true, "All sources"],
            [false, "First-party only"],
          ] as const
        ).map(([on, label]) => (
          <button
            key={label}
            type="button"
            onClick={() => enrichment.set(on)}
            aria-pressed={enrichment.enabled === on}
            className={cn(
              SEG,
              enrichment.enabled === on
                ? "bg-primary/15 text-primary"
                : "text-subtle hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
