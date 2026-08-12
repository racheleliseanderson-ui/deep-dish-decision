import { Chip, Eyebrow, Field, Toggle } from "@/components/rih/bits";
import { dataset } from "@/lib/dataset";
import {
  COMMITMENT_LEVELS,
  CONSTRAINTS,
  DAYPARTS,
  OCCASIONS,
  PLANNING_LEVELS,
  SITUATION_SLOTS,
  SPEND_BANDS,
  emptySituation,
  situationDepth,
  type Constraint,
  type Occasion,
  type Situation,
} from "@/lib/intelligence";
import { cn } from "@/lib/utils";

type Props = {
  situation: Situation;
  onChange: (next: Situation) => void;
  inViewCount: number;
  totalCount: number;
};

export function SituationConsole({ situation: s, onChange, inViewCount, totalCount }: Props) {
  const set = <K extends keyof Situation>(k: K, v: Situation[K]) => onChange({ ...s, [k]: v });
  const toggleConstraint = (c: Constraint) =>
    set(
      "constraints",
      s.constraints.includes(c) ? s.constraints.filter((x) => x !== c) : [...s.constraints, c],
    );
  const depth = situationDepth(s);

  return (
    <section
      aria-label="Situation console"
      className="plate grain-veil overflow-hidden"
      id="situation"
    >
      <div className="relative border-b border-border px-4 py-5 sm:px-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div className="min-w-0">
            <Eyebrow>Situation console</Eyebrow>
            <h2 className="mt-2 font-display text-[1.35rem] leading-tight tracking-tight sm:text-[27px]">
              Describe the night, not just the cuisine.
            </h2>
            <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted-foreground sm:text-sm">
              Occasion and guest constraints weigh more heavily on depth and ranking. Party size, lead
              time, planning tolerance, daypart and spend band further reshape which findings rise
              first. Partial input is fine — unknowns stay visible rather than being filled in.
            </p>
          </div>
          <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
            <div className="text-left sm:text-right">
              <p className="text-eyebrow">Situation depth</p>
              <p className="text-num mt-1 text-sm">
                {depth}/{SITUATION_SLOTS}
              </p>
            </div>
            <div className="flex h-9 items-end gap-[3px]" aria-hidden>
              {Array.from({ length: SITUATION_SLOTS }).map((_, i) => (
                <span
                  key={i}
                  className={cn(
                    "w-[3px] rounded-full transition-all duration-500 ease-instrument",
                    i < depth ? "bg-primary" : "bg-border-strong",
                  )}
                  style={{ height: `${30 + i * 6}%` }}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => onChange({ ...emptySituation })}
              className="tap min-h-11 rounded-full border border-border px-4 py-2 text-xs text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground sm:min-h-0 sm:px-3 sm:py-1.5"
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-6 px-4 py-5 sm:gap-7 sm:px-7 sm:py-6 lg:grid-cols-[1.35fr_1fr]">
        <div className="space-y-6 sm:space-y-7">
          <Field label={`Occasion (${OCCASIONS.length})`} hint="one at a time">
            <div className="flex flex-wrap gap-1.5">
              {OCCASIONS.map((o) => (
                <Toggle
                  key={o}
                  active={s.occasion === o}
                  onClick={() => set("occasion", s.occasion === o ? null : (o as Occasion))}
                >
                  {o}
                </Toggle>
              ))}
            </div>
          </Field>

          <Field label="Guest constraint matrix" hint="fail-closed — never assumed satisfied">
            <div className="grid gap-1.5 sm:grid-cols-2">
              {CONSTRAINTS.map((c) => {
                const active = s.constraints.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => toggleConstraint(c)}
                    aria-pressed={active}
                    className={cn(
                      "tap flex min-h-11 items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-xs transition-all duration-300 ease-instrument sm:min-h-0 sm:py-2",
                      active
                        ? "border-critical/45 bg-critical-soft text-foreground"
                        : "border-border bg-surface-raised/50 text-muted-foreground hover:border-border-strong hover:text-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        active ? "bg-critical" : "bg-border-strong",
                      )}
                    />
                    <span className="min-w-0 leading-snug">{c}</span>
                  </button>
                );
              })}
            </div>
          </Field>
        </div>

        <div className="space-y-5 sm:space-y-6">
          {/* Stack sliders on phones — two-up is too tight for the unset label */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Party size" hint={s.partySize !== null ? `${s.partySize}` : "unset"}>
              <input
                type="range"
                min={1}
                max={14}
                value={s.partySize ?? 2}
                onChange={(e) => set("partySize", Number(e.target.value))}
                className={cn(
                  "range-touch w-full accent-[var(--color-primary)] transition-opacity",
                  s.partySize === null ? "opacity-40" : "opacity-100",
                )}
                aria-label="Party size"
                aria-valuetext={s.partySize === null ? "unset" : String(s.partySize)}
              />
              <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px] text-subtle">
                <span className="shrink-0">solo</span>
                {s.partySize === null ? (
                  <span className="min-w-0 truncate text-center text-unknown">
                    <span className="sm:hidden">not set — move</span>
                    <span className="hidden sm:inline">not set — move to apply</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => set("partySize", null)}
                    className="tap min-h-8 shrink-0 px-1 text-subtle underline-offset-2 hover:text-foreground hover:underline sm:min-h-0"
                  >
                    clear
                  </button>
                )}
                <span className="shrink-0">14+</span>
              </div>
            </Field>
            <Field
              label="Days until dinner"
              hint={s.leadDays === null ? "unset" : `${s.leadDays}d`}
            >
              <input
                type="range"
                min={0}
                max={60}
                value={s.leadDays ?? 14}
                onChange={(e) => set("leadDays", Number(e.target.value))}
                className={cn(
                  "range-touch w-full accent-[var(--color-primary)] transition-opacity",
                  s.leadDays === null ? "opacity-40" : "opacity-100",
                )}
                aria-label="Days until dinner"
                aria-valuetext={s.leadDays === null ? "unset" : `${s.leadDays} days`}
              />
              <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px] text-subtle">
                <span className="shrink-0">tonight</span>
                {s.leadDays === null ? (
                  <span className="min-w-0 truncate text-center text-unknown">
                    <span className="sm:hidden">not set — move</span>
                    <span className="hidden sm:inline">not set — move to apply</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => set("leadDays", null)}
                    className="tap min-h-8 shrink-0 px-1 text-subtle underline-offset-2 hover:text-foreground hover:underline sm:min-h-0"
                  >
                    clear
                  </button>
                )}
                <span className="shrink-0">60</span>
              </div>
            </Field>
          </div>

          <Field label="Max format commitment">
            <div className="flex flex-wrap gap-1.5">
              {COMMITMENT_LEVELS.map((l) => (
                <Toggle
                  key={l}
                  size="sm"
                  active={s.maxCommitment === l}
                  onClick={() => set("maxCommitment", s.maxCommitment === l ? null : l)}
                >
                  {l}
                </Toggle>
              ))}
            </div>
          </Field>

          <Field label="Max planning load">
            <div className="flex flex-wrap gap-1.5">
              {PLANNING_LEVELS.map((l) => (
                <Toggle
                  key={l}
                  size="sm"
                  active={s.maxPlanningLoad === l}
                  onClick={() => set("maxPlanningLoad", s.maxPlanningLoad === l ? null : l)}
                >
                  {l}
                </Toggle>
              ))}
            </div>
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Daypart">
              <div className="flex flex-wrap gap-1.5">
                {DAYPARTS.map((d) => (
                  <Toggle
                    key={d}
                    size="sm"
                    active={s.daypart === d}
                    onClick={() => set("daypart", s.daypart === d ? null : d)}
                  >
                    {d.replace(" language", "")}
                  </Toggle>
                ))}
              </div>
            </Field>
            <Field label="Spend band">
              <div className="flex flex-wrap gap-1.5">
                {SPEND_BANDS.map((b) => (
                  <Toggle
                    key={b}
                    size="sm"
                    active={s.spendBand === b}
                    onClick={() => set("spendBand", s.spendBand === b ? null : b)}
                  >
                    {b.replace(" band", "")}
                  </Toggle>
                ))}
              </div>
            </Field>
          </div>

          <Field label="Priorities">
            <div className="flex flex-wrap gap-1.5">
              <Toggle
                size="sm"
                active={s.preferNoConflicts}
                onClick={() => set("preferNoConflicts", !s.preferNoConflicts)}
              >
                Prefer no open conflicts
              </Toggle>
              <Toggle
                size="sm"
                active={s.preferWalkIn}
                onClick={() => set("preferWalkIn", !s.preferWalkIn)}
              >
                Walk-in path required
              </Toggle>
              <Toggle
                size="sm"
                active={s.wineForward}
                onClick={() => set("wineForward", !s.wineForward)}
              >
                Wine-forward
              </Toggle>
            </div>
          </Field>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-border bg-surface-sunken/60 px-4 py-4 sm:flex-row sm:flex-wrap sm:items-end sm:gap-3 sm:px-7">
        <Field label="Geography">
          <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
            <select
              value={s.regionGroup ?? ""}
              onChange={(e) => onChange({ ...s, regionGroup: e.target.value || null, region: null })}
              className="tap w-full rounded-lg border border-input bg-surface-raised px-3 py-2.5 text-xs text-foreground sm:w-auto sm:py-2"
              aria-label="Region group"
            >
              <option value="">All states / provinces</option>
              {dataset.regionGroups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
            <select
              value={s.region ?? ""}
              onChange={(e) => set("region", e.target.value || null)}
              className="tap w-full rounded-lg border border-input bg-surface-raised px-3 py-2.5 text-xs text-foreground sm:w-auto sm:py-2"
              aria-label="Region"
            >
              <option value="">All regions</option>
              {(dataset.taxOptions.ri_region ?? [])
                .filter((r) => !s.regionGroup || r.endsWith(s.regionGroup))
                .map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
            </select>
            <select
              value={s.cuisine ?? ""}
              onChange={(e) => set("cuisine", e.target.value || null)}
              className="tap w-full rounded-lg border border-input bg-surface-raised px-3 py-2.5 text-xs text-foreground sm:w-auto sm:py-2"
              aria-label="Cuisine or style"
            >
              <option value="">Any cuisine / style</option>
              {dataset.cuisineTagOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              value={s.bookingPath ?? ""}
              onChange={(e) => set("bookingPath", e.target.value || null)}
              className="tap w-full rounded-lg border border-input bg-surface-raised px-3 py-2.5 text-xs text-foreground sm:w-auto sm:py-2"
              aria-label="Booking pathway"
            >
              <option value="">Any pathway</option>
              {dataset.bookingPlatformOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <div className="relative min-w-0 w-full sm:min-w-[220px] sm:flex-1">
              <input
                value={s.query}
                onChange={(e) => set("query", e.target.value)}
                type="search"
                enterKeyHint="search"
                autoComplete="off"
                spellCheck={false}
                aria-label="Search records, cities, signals"
                placeholder="Search records, cities, signals"
                className="tap w-full rounded-lg border border-input bg-surface-raised px-3 py-2.5 pr-10 text-xs text-foreground placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-ring sm:py-2"
              />
              {s.query ? (
                <button
                  type="button"
                  onClick={() => set("query", "")}
                  aria-label="Clear search"
                  className="absolute right-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-subtle transition-colors hover:text-foreground"
                >
                  ×
                </button>
              ) : null}
            </div>
          </div>
        </Field>
        <div className="shrink-0 sm:ml-auto sm:self-end sm:pb-0.5">
          <Chip tone={inViewCount === totalCount ? "neutral" : "accent"}>
            <span className="text-num">{inViewCount}</span> of {totalCount} records ranked live
          </Chip>
        </div>
      </div>
    </section>
  );
}
