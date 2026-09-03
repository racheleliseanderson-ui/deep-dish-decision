import { useMemo } from "react";
import type { Contribution, Scored } from "@/lib/intelligence";
import { cn } from "@/lib/utils";

/**
 * Why this room ranked where it did.
 *
 * A ranked list that will not show its working is asking to be trusted. This
 * is the actual arithmetic: the occasion baseline, then every term that moved
 * the score, drawn to scale. It is generated from the same `contributions`
 * array the scorer produced, so it cannot drift away from the real ordering.
 */

const GROUP_LABEL: Record<Contribution["group"], string> = {
  occasion: "Occasion",
  location: "Where you are",
  timing: "When you are going",
  party: "Party",
  spend: "Spend",
  booking: "Booking",
  constraint: "Stated needs",
  evidence: "Evidence",
};

/* Direction carries three signals, not one.
 *
 * Colour was the whole signal here, and the bar is aria-hidden, so a reader
 * who cannot separate the two hues had nothing. The CVD palettes now split
 * verified and critical by lightness rather than hue, but a palette is a
 * setting and this chart should not depend on one: gains are drawn solid and
 * losses hatched, and each bar carries a caret at its outer end pointing the
 * way it moved. Any one of the three is enough to read it.
 */
const GAIN = "var(--verified)";
const LOSS = "var(--critical)";
const GAIN_FILL = GAIN;
const LOSS_FILL = `repeating-linear-gradient(135deg, ${LOSS} 0 3px, color-mix(in oklab, ${LOSS} 40%, transparent) 3px 6px)`;

export function WhyThisRank({ sc, className }: { sc: Scored; className?: string }) {
  const model = useMemo(() => {
    const items = sc.contributions;
    if (!items.length) return null;
    const max = Math.max(...items.map((c) => Math.abs(c.delta)), 1);
    const ups = items.filter((c) => c.delta > 0).reduce((a, c) => a + c.delta, 0);
    const downs = items.filter((c) => c.delta < 0).reduce((a, c) => a + c.delta, 0);
    return { items, max, ups, downs };
  }, [sc.contributions]);

  if (!model) return null;

  return (
    <section className={cn("rounded-2xl border border-border bg-surface-sunken/45 p-5", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-eyebrow">Why it ranked here</h3>
        <p className="text-[10px] uppercase tracking-[0.12em] text-subtle">Fit {sc.fit} of 100</p>
      </div>

      {/* The running total, as a sentence people can check. */}
      <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
        Started at <span className="text-num text-foreground">{Math.round(sc.fitBase)}</span> for
        the occasion, gained{" "}
        <span className="text-num text-verified">+{Math.round(model.ups)}</span>, lost{" "}
        <span className="text-num text-critical">{Math.round(model.downs)}</span>.
      </p>

      <ul className="mt-4 space-y-2">
        {model.items.map((c) => {
          const pct = (Math.abs(c.delta) / model.max) * 50; // half-width max, either side
          const positive = c.delta > 0;
          return (
            <li
              key={`${c.group}-${c.label}`}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3"
            >
              <div className="min-w-0">
                <p className="truncate text-[13px] text-foreground" title={c.label}>
                  {c.label}
                </p>
                <p className="text-[10px] uppercase tracking-[0.12em] text-subtle">
                  {GROUP_LABEL[c.group]}
                </p>
              </div>
              <div className="flex w-[140px] shrink-0 items-center gap-2 sm:w-[200px]">
                {/* Diverging bar: losses left of centre, gains right. */}
                <div className="relative h-3 flex-1">
                  <div className="absolute inset-y-0 left-1/2 w-px bg-border-strong" aria-hidden />
                  <div
                    className="absolute inset-y-[3px] rounded-full"
                    style={{
                      background: positive ? GAIN_FILL : LOSS_FILL,
                      left: positive ? "50%" : `${50 - pct}%`,
                      width: `${pct}%`,
                      opacity: 0.85,
                    }}
                    aria-hidden
                  />
                  <span
                    className="absolute top-1/2 -translate-y-1/2 text-[9px] leading-none"
                    style={
                      positive
                        ? { left: `${50 + pct}%`, color: GAIN }
                        : { right: `${50 + pct}%`, color: LOSS }
                    }
                    aria-hidden
                  >
                    {positive ? "\u25B8" : "\u25C2"}
                  </span>
                </div>
                <span
                  className={cn(
                    "text-num w-9 shrink-0 text-right text-[12px]",
                    positive ? "text-verified" : "text-critical",
                  )}
                >
                  {positive ? "+" : ""}
                  {Math.round(c.delta)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mt-4 border-t border-border/60 pt-3 text-[11px] leading-relaxed text-subtle">
        Every term is drawn to the same scale. Solid bars point right and gained points; hatched
        bars point left and lost them.
      </p>
    </section>
  );
}
