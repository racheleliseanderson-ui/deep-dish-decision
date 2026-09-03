// UNREFERENCED as of 2026-09-02 — see DEAD-CODE.md
import { useMemo } from "react";
import type { Situation } from "@/lib/intelligence";
import type { Origin, OriginState } from "@/lib/origin";
import { minutesToClock } from "@/lib/live";
import { cn } from "@/lib/utils";

/**
 * Where you are and when you want to sit down.
 *
 * These two facts change the answer more than any taxonomy filter, and until
 * now the instrument never asked for either. Location is opt-in and never
 * assumed; the arrival time defaults to "now" so the list is live on arrival.
 */

const RADII = [1, 3, 5, 10, 25] as const;

/** Arrival slots people actually book, in minutes from midnight. */
const SLOTS = [
  11 * 60,
  12 * 60,
  17 * 60,
  17.5 * 60,
  18 * 60,
  18.5 * 60,
  19 * 60,
  19.5 * 60,
  20 * 60,
  21 * 60,
  22 * 60,
];

function Pill({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={cn(
        "tap inline-flex items-center rounded-full border px-3 py-1.5 text-xs transition-colors",
        active
          ? "border-primary bg-primary/12 text-foreground"
          : "border-border text-muted-foreground hover:border-border-strong hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function WhereAndWhen({
  situation,
  patch,
  originState,
  cityOptions,
  inRadius,
  total,
}: {
  situation: Situation;
  patch: (next: Partial<Situation>) => void;
  originState: OriginState;
  /** Cities in the loaded region, for a manual origin. */
  cityOptions: { label: string; ll: [number, number] }[];
  inRadius: number | null;
  total: number;
}) {
  const { origin, status, request, setCity, clear } = originState;

  const originLine = useMemo(() => {
    if (status === "asking") return "Locating…";
    if (!origin) return null;
    if (origin.kind === "device") {
      const acc = origin.accuracyMi;
      return acc && acc > 1 ? `Your location · ±${Math.round(acc)} mi` : "Your location";
    }
    return origin.label;
  }, [origin, status]);

  const setOrigin = (o: Origin) => {
    patch({
      origin: o ? o.ll : null,
      originLabel: o ? o.label : null,
      ...(o ? {} : { radiusMi: null }),
    });
  };

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {/* ── Where ─────────────────────────────────────────────── */}
      <div>
        <p className="text-eyebrow">Where you are</p>

        {origin ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary bg-primary/12 px-3 py-1.5 text-xs text-foreground">
              <span aria-hidden className="size-1.5 rounded-full bg-primary" />
              {originLine}
            </span>
            <button
              type="button"
              onClick={() => {
                clear();
                setOrigin(null);
              }}
              className="tap rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
            >
              Clear
            </button>
          </div>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={request}
              disabled={status === "asking"}
              className="tap inline-flex items-center gap-2 rounded-full border border-border bg-surface-raised/60 px-3 py-1.5 text-xs text-foreground transition-colors hover:border-border-strong disabled:opacity-60"
            >
              <span aria-hidden>◎</span>
              {status === "asking" ? "Locating…" : "Use my location"}
            </button>
            {cityOptions.length ? (
              <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <span className="sr-only">Or pick a city as your starting point</span>
                <select
                  value=""
                  onChange={(e) => {
                    const c = cityOptions.find((x) => x.label === e.target.value);
                    if (!c) return;
                    setCity(c.label, c.ll);
                    setOrigin({ kind: "city", ll: c.ll, label: c.label });
                  }}
                  className="tap rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-muted-foreground"
                >
                  <option value="">or start from a city…</option>
                  {cityOptions.map((c) => (
                    <option key={c.label} value={c.label}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        )}

        {status === "denied" ? (
          <p className="mt-2 text-[12px] leading-relaxed text-subtle">
            Location permission was declined. Pick a city instead — distance stays approximate but
            the ordering still works.
          </p>
        ) : status === "unavailable" ? (
          <p className="mt-2 text-[12px] leading-relaxed text-subtle">
            This browser does not offer location. Pick a city instead.
          </p>
        ) : null}

        {origin ? (
          <div className="mt-3">
            <p className="text-[11px] uppercase tracking-[0.14em] text-subtle">Within</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {RADII.map((r) => (
                <Pill
                  key={r}
                  active={situation.radiusMi === r}
                  onClick={() => patch({ radiusMi: situation.radiusMi === r ? null : r })}
                >
                  {r} mi
                </Pill>
              ))}
              <Pill active={situation.radiusMi === null} onClick={() => patch({ radiusMi: null })}>
                Any distance
              </Pill>
            </div>
            {situation.radiusMi !== null && inRadius !== null ? (
              <p className="mt-2 text-[12px] text-subtle">
                <span className="text-num text-foreground">{inRadius}</span> of {total} rooms inside{" "}
                {situation.radiusMi} miles.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* ── When ──────────────────────────────────────────────── */}
      <div>
        <p className="text-eyebrow">When you want to sit down</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Pill
            active={situation.arriveAt === null}
            onClick={() => patch({ arriveAt: null })}
            title="Score against the current moment in each room's own timezone"
          >
            Now
          </Pill>
          {SLOTS.map((m) => {
            const value = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
            return (
              <Pill
                key={value}
                active={situation.arriveAt === value}
                onClick={() => patch({ arriveAt: situation.arriveAt === value ? null : value })}
              >
                {minutesToClock(m)}
              </Pill>
            );
          })}
        </div>
        <div className="mt-3">
          <Pill
            active={situation.openOnly}
            onClick={() => patch({ openOnly: !situation.openOnly })}
            title="Drop rooms whose published hours do not cover your arrival"
          >
            {situation.openOnly ? "✓ " : ""}Only rooms serving then
          </Pill>
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-subtle">
          Hours are read in the restaurant&rsquo;s own timezone. Holidays and private buyouts are
          not in the published schedule — reconfirm on the day.
        </p>
      </div>
    </div>
  );
}
