import { useMemo } from "react";
import type { LiveRow } from "@/lib/live";
import type { RestaurantRecord } from "@/lib/dataset";

/**
 * What this instrument can actually tell you tonight.
 *
 * This band replaced a stock photograph of wine glasses in bokeh — an image
 * that carried no information about anything. In its place: a live read of how
 * much of the evidence floor is filled for the region you have chosen, stated
 * as coverage rather than as a score, so a gap is visible instead of hidden.
 *
 * With no region chosen it describes the corpus as a whole.
 */

type Facet = { label: string; have: number; total: number; note: string };

export function EvidenceBand({
  records,
  live,
  regionLabel,
  corpusCount,
}: {
  records: RestaurantRecord[] | null;
  live: Record<string, LiveRow> | null;
  regionLabel: string | null;
  corpusCount: number;
}) {
  const facets = useMemo<Facet[] | null>(() => {
    if (!records?.length || !live) return null;
    const n = records.length;
    const count = (fn: (r: RestaurantRecord) => boolean) => records.filter(fn).length;
    return [
      {
        label: "Where it is",
        have: count((r) => live[r.slug]?.llSource === "exact"),
        total: n,
        note: "exact coordinate",
      },
      {
        label: "When it serves",
        have: count((r) => Boolean(live[r.slug]?.hours)),
        total: n,
        note: "published schedule",
      },
      {
        label: "What it costs",
        have: count((r) => Boolean(live[r.slug]?.pp)),
        total: n,
        note: "per-guest figure",
      },
      {
        label: "What to order",
        have: count((r) => Boolean(live[r.slug]?.dishes?.length)),
        total: n,
        note: "a named dish",
      },
    ];
  }, [records, live]);

  return (
    <section
      aria-label="Evidence coverage"
      className="border-b border-border-strong bg-surface-sunken/60"
    >
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <p className="text-eyebrow text-gilt">
            {regionLabel ? `What is on file for ${regionLabel}` : "What is on file"}
          </p>
          <p className="text-[12px] text-subtle">
            {regionLabel
              ? "A gap is shown as a gap."
              : `${corpusCount.toLocaleString()} records. Choose a region to see its coverage.`}
          </p>
        </div>

        {facets ? (
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
            {facets.map((f) => {
              const pct = f.total ? Math.round((f.have / f.total) * 100) : 0;
              return (
                <div key={f.label}>
                  <dt className="text-[11px] uppercase tracking-[0.14em] text-subtle">{f.label}</dt>
                  <dd className="mt-1">
                    <span className="text-num text-[22px] leading-none text-foreground">
                      {f.have}
                    </span>
                    <span className="text-num ml-1 text-[13px] text-subtle">/ {f.total}</span>
                    <div
                      className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-surface"
                      role="progressbar"
                      aria-label={`${f.label}: ${f.have} of ${f.total} records have ${f.note}`}
                      aria-valuenow={pct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div
                        className="h-full rounded-full bg-primary transition-[width] duration-700 ease-instrument"
                        style={{ width: `${Math.max(2, pct)}%` }}
                      />
                    </div>
                    <p className="mt-1.5 text-[11px] text-subtle">{f.note}</p>
                  </dd>
                </div>
              );
            })}
          </dl>
        ) : (
          <p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-muted-foreground">
            Every record carries the same twelve-field floor. Coordinates, published hours,
            per-guest spend and named dishes are held where a source states them — and marked open
            where none does.
          </p>
        )}
      </div>
    </section>
  );
}
