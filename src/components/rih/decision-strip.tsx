import type { Scored, Situation } from "@/lib/intelligence";
import {
  bookingRiskLine,
  formatDistance,
  hoursProvenance,
  openLabel,
  partyTotal,
  spendLine,
} from "@/lib/live";
import { cn } from "@/lib/utils";

/**
 * The four facts a person actually weighs before they commit to a room:
 * how far, whether it is serving, what it costs, and what to order.
 *
 * Each cell states its own provenance. An estimate is never printed in the
 * same voice as a published figure, and a fact that is not on file says so
 * rather than being quietly omitted.
 */

const TONE: Record<string, string> = {
  verified: "text-verified",
  watch: "text-watch",
  critical: "text-critical",
  unknown: "text-subtle",
};

function Cell({
  label,
  value,
  note,
  tone = "unknown",
}: {
  label: string;
  value: string;
  note?: string;
  tone?: keyof typeof TONE | string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-[0.14em] text-subtle">{label}</p>
      <p className={cn("mt-0.5 truncate text-[13px] font-medium", TONE[tone] ?? "text-foreground")}>
        {value}
      </p>
      {note ? <p className="mt-0.5 truncate text-[11px] text-subtle">{note}</p> : null}
    </div>
  );
}

export function DecisionStrip({ sc, situation }: { sc: Scored; situation: Situation }) {
  const live = sc.live;
  const open = openLabel(sc.open, Boolean(situation.arriveAt));
  const spend = spendLine(live);
  const total = partyTotal(live, situation.partySize);
  const dish = live?.dishes?.[0];
  const risk = bookingRiskLine(live);
  const dishCount = live?.dishes?.length ?? 0;

  return (
    <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-border bg-surface-sunken/40 px-4 py-3 sm:grid-cols-4">
      <Cell
        label="Distance"
        value={
          sc.distanceMi !== null
            ? formatDistance(sc.distanceMi, sc.distanceExact)
            : situation.origin
              ? "No coordinate"
              : "Set a location"
        }
        {...(sc.distanceMi !== null
          ? {
              note: sc.distanceExact ? (live?.hood ?? "Exact point") : "City-level estimate",
              tone: sc.distanceMi <= 3 ? "verified" : "unknown",
            }
          : { note: situation.origin ? "Not on file" : "to see distance" })}
      />

      <Cell
        label={situation.arriveAt ? "At your time" : "Right now"}
        value={open.text}
        tone={open.tone}
        note={hoursProvenance(live) ?? "No schedule on file"}
      />

      <Cell
        label="Typical spend"
        value={spend ? spend.text.replace(/^About /, "") : live?.band ? live.band : "Not stated"}
        {...(spend
          ? {
              note: risk ? `${total ?? spend.source} · ${risk}` : (total ?? spend.source),
              tone: "unknown",
            }
          : { note: risk ?? "No per-guest figure on file", tone: risk ? "watch" : "unknown" })}
      />

      <Cell
        label="Known for"
        value={dish ? dish.name : "No dish named"}
        {...(dish
          ? {
              note:
                dishCount > 1
                  ? `+${dishCount - 1} more · ${dish.source === "first-party" ? "the restaurant" : "recurring in reviews"}`
                  : dish.source === "first-party"
                    ? "Named by the restaurant"
                    : "Recurring in reviews",
              tone: "verified",
            }
          : { note: "Nothing repeats across sources" })}
      />
    </div>
  );
}
