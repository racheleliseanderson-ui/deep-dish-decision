// UNREFERENCED as of 2026-09-02 — see DEAD-CODE.md
import { useMemo } from "react";
import type { RestaurantRecord } from "@/lib/dataset";
import {
  distanceBand,
  haversineMi,
  minutesToClock,
  openStateAtMoment,
  localNow,
  type LiveRow,
} from "@/lib/live";
import { cn } from "@/lib/utils";

/**
 * Does this night hold together?
 *
 * The shortlist was a list of records with a combined confirmation count. What
 * a person actually needs to know before they commit is whether the evening
 * works: what it costs for the party, whether the rooms are serving when they
 * mean to arrive, and how far apart they are. Every figure states whether it
 * is published or estimated, and a gap is shown as a gap.
 */

export type NightStop = {
  record: RestaurantRecord;
  live: LiveRow | undefined;
};

function Cell({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note?: string | undefined;
  tone?: "verified" | "watch" | "critical" | undefined;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-[0.14em] text-subtle">{label}</p>
      <p
        className={cn(
          "mt-1 font-display text-[22px] leading-none tracking-tight",
          tone === "verified" && "text-verified",
          tone === "watch" && "text-watch",
          tone === "critical" && "text-critical",
          !tone && "text-foreground",
        )}
      >
        {value}
      </p>
      {note ? <p className="mt-1.5 text-[11px] leading-relaxed text-subtle">{note}</p> : null}
    </div>
  );
}

export function NightSummary({
  stops,
  partySize,
  arriveAt,
  now,
}: {
  stops: NightStop[];
  partySize: number | null;
  /** "HH:MM" in each room's own timezone, or null for "now". */
  arriveAt: string | null;
  now: Date;
}) {
  const model = useMemo(() => {
    const party = partySize && partySize > 0 ? partySize : 2;

    /* Spend. Published figures and estimates are totalled separately so an
       estimate is never presented with the authority of a published price. */
    let publishedLow = 0;
    let publishedHigh = 0;
    let estimatedLow = 0;
    let estimatedHigh = 0;
    let priced = 0;
    for (const s of stops) {
      const pp = s.live?.pp;
      if (!pp) continue;
      priced++;
      if (s.live?.ppSource === "published") {
        publishedLow += pp[0];
        publishedHigh += pp[1];
      } else {
        estimatedLow += pp[0];
        estimatedHigh += pp[1];
      }
    }
    const low = (publishedLow + estimatedLow) * party;
    const high = (publishedHigh + estimatedHigh) * party;
    const round = (n: number) => (n >= 200 ? Math.round(n / 25) * 25 : Math.round(n / 5) * 5);

    /* Serving state at the arrival moment, per room's own clock. */
    let serving = 0;
    let notServing = 0;
    let unheld = 0;
    for (const s of stops) {
      if (!s.live?.hours) {
        unheld++;
        continue;
      }
      const here = localNow(s.live.tz, now);
      if (!here) {
        unheld++;
        continue;
      }
      let day = here.day;
      let minute = here.minute;
      if (arriveAt) {
        const m = /^(\d{1,2}):(\d{2})$/.exec(arriveAt);
        if (m) {
          minute = Number(m[1]) * 60 + Number(m[2]);
          if (minute < here.minute) day = (here.day + 1) % 7;
        }
      }
      const state = openStateAtMoment(s.live, day, minute);
      if (state.state === "open" || state.state === "closing-soon") serving++;
      else if (state.state === "unknown") unheld++;
      else notServing++;
    }

    /* How spread out the night is. */
    const points = stops.map((s) => s.live?.ll).filter((p): p is [number, number] => Boolean(p));
    let spread: number | null = null;
    let anyEstimatedPoint = false;
    if (points.length >= 2) {
      let max = 0;
      for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
          const d = haversineMi(points[i]!, points[j]!);
          if (Number.isFinite(d)) max = Math.max(max, d);
        }
      }
      spread = max;
      anyEstimatedPoint = stops.some((s) => s.live?.ll && s.live.llSource !== "exact");
    }

    /* Money that can be lost without eating. */
    const atRisk = stops.reduce((a, s) => {
      const r = s.live?.risk;
      if (!r) return a;
      const amount = r.cancelFee ?? r.deposit ?? 0;
      return a + (r.perGuest ? amount * party : amount);
    }, 0);

    return {
      party,
      priced,
      low: round(low),
      high: round(high),
      hasPublished: publishedLow > 0,
      hasEstimate: estimatedLow > 0,
      serving,
      notServing,
      unheld,
      spread,
      anyEstimatedPoint,
      atRisk,
    };
  }, [stops, partySize, arriveAt, now]);

  if (!stops.length) return null;

  const whenLabel = arriveAt
    ? `at ${minutesToClock(Number(arriveAt.slice(0, 2)) * 60 + Number(arriveAt.slice(3)))}`
    : "right now";

  return (
    <section
      aria-label="What this night looks like"
      className="rounded-2xl border border-border bg-surface-sunken/55 p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-eyebrow">What this night looks like</h2>
        <p className="text-[11px] text-subtle">
          {model.party} {model.party === 1 ? "guest" : "guests"} · read {whenLabel}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-5 sm:grid-cols-4">
        <Cell
          label="Rooms"
          value={String(stops.length)}
          note={
            model.spread === null
              ? "one stop"
              : model.anyEstimatedPoint
                ? `${distanceBand(model.spread)} at the widest, city centre to city centre. At least one stop has no address coordinate on file.`
                : model.spread < 1
                  ? "all within a mile of each other"
                  : `${Math.round(model.spread * 10) / 10} mi apart at the widest`
          }
        />

        <Cell
          label="Serving"
          value={`${model.serving} of ${stops.length}`}
          tone={
            model.serving === stops.length ? "verified" : model.serving === 0 ? "critical" : "watch"
          }
          note={
            model.unheld
              ? `${model.notServing} closed · ${model.unheld} with no schedule on file`
              : model.notServing
                ? `${model.notServing} closed ${whenLabel}`
                : `every room is open ${whenLabel}`
          }
        />

        <Cell
          label="Food, for the table"
          value={
            model.priced === 0
              ? "Not stated"
              : model.low === model.high
                ? `$${model.low}`
                : `$${model.low}–$${model.high}`
          }
          note={
            model.priced === 0
              ? "no per-guest figure on any room"
              : model.priced < stops.length
                ? `${model.priced} of ${stops.length} rooms priced${model.hasEstimate ? " · part estimated" : ""}`
                : model.hasEstimate && model.hasPublished
                  ? "published and estimated figures combined"
                  : model.hasPublished
                    ? "published per-guest prices"
                    : "estimated from price bands"
          }
        />

        <Cell
          label="At risk if you cancel"
          value={model.atRisk ? `$${model.atRisk}` : "Nothing stated"}
          tone={model.atRisk ? "watch" : undefined}
          note={
            model.atRisk
              ? "deposits and cancellation fees, separate from the meal"
              : "no deposit or fee on file"
          }
        />
      </div>

      <p className="mt-4 border-t border-border/60 pt-3 text-[11px] leading-relaxed text-subtle">
        Totals cover food only, before drinks, tax and tip, and assume one seating per room. Hours
        are read in each restaurant&rsquo;s own timezone. Nothing here is a booking.
      </p>
    </section>
  );
}
