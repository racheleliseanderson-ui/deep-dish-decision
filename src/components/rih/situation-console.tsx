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
      <div className="relative border-b border-border px-5 py-5 sm:px-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <Eyebrow>Situation console</Eyebrow>
            <h2 className="mt-2 font-display text-2xl leading-tight tracking-tight sm:text-[27px]">
              Describe the night, not just the cuisine.
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Occasion, party composition, guest constraints, lead time, planning tolerance,
              daypart and spend band all reshape ranking order and which findings rise first.
              Partial input is fine — unknowns stay visible rather than being filled in.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
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
              className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-7 px-5 py-6 sm:px-7 lg:grid-cols-[1.35fr_1fr]">
        <div className="space-y-7">
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
                      "flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-xs transition-all duration-300 ease-instrument",
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
                    {c}
                  </button>
                );
              })}
            </div>
          </Field>
        </div>

        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-5">
            <Field label="Party size" hint={s.partySize ? `${s.partySize}` : "unset"}>
              <input
                type="range"
                min={1}
                max={14}
                value={s.partySize ?? 2}
                onChange={(e) => set("partySize", Number(e.target.value))}
                className="w-full accent-[var(--color-primary)]"
                aria-label="Party size"
              />
              <div className="mt-1 flex justify-between text-[10px] text-subtle">
                <span>solo</span>
                <span>14+</span>
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
                className="w-full accent-[var(--color-primary)]"
                aria-label="Days until dinner"
              />
              <div className="mt-1 flex justify-between text-[10px] text-subtle">
                <span>tonight</span>
                <span>60</span>
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

      <div className="flex flex-wrap items-center gap-3 border-t border-border bg-surface-sunken/60 px-5 py-4 sm:px-7">
        <Field label="Geography">
          <div className="flex flex-wrap gap-2">
            <select
              value={s.regionGroup ?? ""}
              onChange={(e) => onChange({ ...s, regionGroup: e.target.value || null, region: null })}
              className="rounded-lg border border-input bg-surface-raised px-3 py-2 text-xs text-foreground"
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
              className="rounded-lg border border-input bg-surface-raised px-3 py-2 text-xs text-foreground"
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
              className="rounded-lg border border-input bg-surface-raised px-3 py-2 text-xs text-foreground"
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
              className="rounded-lg border border-input bg-surface-raised px-3 py-2 text-xs text-foreground"
              aria-label="Booking pathway"
            >
              <option value="">Any pathway</option>
              {dataset.bookingPlatformOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              value={s.query}
              onChange={(e) => set("query", e.target.value)}
              placeholder="Search records, cities, signals"
              className="min-w-[200px] flex-1 rounded-lg border border-input bg-surface-raised px-3 py-2 text-xs text-foreground placeholder:text-subtle"
            />
          </div>
        </Field>
        <div className="ml-auto shrink-0">
          <Chip tone={inViewCount === totalCount ? "neutral" : "accent"}>
            <span className="text-num">{inViewCount}</span> of {totalCount} records ranked live
          </Chip>
        </div>
      </div>
    </section>
  );
}
