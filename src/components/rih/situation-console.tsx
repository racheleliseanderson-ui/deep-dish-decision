import { Chip, Eyebrow, Field, Toggle } from "@/components/rih/bits";
import { CopyNightLink } from "@/components/rih/copy-night-link";
import { dataset, records } from "@/lib/dataset";
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
  const regionChoices = Array.from(
    new Set(
      records
        .filter((r) => !s.regionGroup || r.regionGroup === s.regionGroup)
        .map((r) => r.region)
        .filter(Boolean),
    ),
  ).sort();

  return (
    <section
      aria-label="What works for tonight"
      className="plate grain-veil overflow-hidden"
      id="situation"
    >
      <div className="relative border-b border-border px-4 py-5 sm:px-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div className="min-w-0">
            <Eyebrow>What works for tonight</Eyebrow>
            <h2 className="mt-2 font-display text-[1.35rem] leading-tight tracking-tight sm:text-[27px]">
              Describe the night, not just the cuisine.
            </h2>
            <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted-foreground sm:text-sm">
              Occasion and guest needs weigh most. Party size, lead time, spend and neighborhood
              then reshape the list. Partial input is fine — unanswered fields stay visible rather
              than being filled in.
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
            <CopyNightLink situation={s} />
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

          <Field label="Guest needs" hint="never assumed satisfied — we'll hold rather than guess">
            <div className="flex flex-wrap gap-1.5">
              {CONSTRAINTS.map((c) => (
                <Toggle key={c} active={s.constraints.includes(c)} onClick={() => toggleConstraint(c)}>
                  {c}
                </Toggle>
              ))}
            </div>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Party size" hint="guests">
              <div className="flex flex-wrap gap-1.5">
                {[1, 2, 3, 4, 5, 6, 8, 10, 12].map((n) => (
                  <Toggle
                    key={n}
                    active={s.partySize === n}
                    onClick={() => set("partySize", s.partySize === n ? null : n)}
                  >
                    {n}
                  </Toggle>
                ))}
              </div>
            </Field>

            <Field label="Lead time" hint="days until the night">
              <div className="flex flex-wrap gap-1.5">
                {[0, 1, 2, 3, 5, 7, 14, 21, 30].map((n) => (
                  <Toggle
                    key={n}
                    active={s.leadDays === n}
                    onClick={() => set("leadDays", s.leadDays === n ? null : n)}
                  >
                    {n === 0 ? "tonight" : n}
                  </Toggle>
                ))}
              </div>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Daypart">
              <div className="flex flex-wrap gap-1.5">
                {DAYPARTS.map((d) => (
                  <Toggle
                    key={d}
                    active={s.daypart === d}
                    onClick={() => set("daypart", s.daypart === d ? null : d)}
                  >
                    {d}
                  </Toggle>
                ))}
              </div>
            </Field>

            <Field label="Spend band">
              <div className="flex flex-wrap gap-1.5">
                {SPEND_BANDS.map((b) => (
                  <Toggle
                    key={b}
                    active={s.spendBand === b}
                    onClick={() => set("spendBand", s.spendBand === b ? null : b)}
                  >
                    {b}
                  </Toggle>
                ))}
              </div>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Max commitment">
              <div className="flex flex-wrap gap-1.5">
                {COMMITMENT_LEVELS.map((c) => (
                  <Toggle
                    key={c}
                    active={s.maxCommitment === c}
                    onClick={() => set("maxCommitment", s.maxCommitment === c ? null : c)}
                  >
                    {c}
                  </Toggle>
                ))}
              </div>
            </Field>

            <Field label="Max planning load">
              <div className="flex flex-wrap gap-1.5">
                {PLANNING_LEVELS.map((p) => (
                  <Toggle
                    key={p}
                    active={s.maxPlanningLoad === p}
                    onClick={() => set("maxPlanningLoad", s.maxPlanningLoad === p ? null : p)}
                  >
                    {p}
                  </Toggle>
                ))}
              </div>
            </Field>
          </div>
        </div>

        <div className="space-y-6 sm:space-y-7">
          <Field label="Region group">
            <select
              value={s.regionGroup ?? ""}
              onChange={(e) =>
                onChange({
                  ...s,
                  regionGroup: e.target.value || null,
                  region: null,
                })
              }
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            >
              <option value="">Any region group</option>
              {dataset.regionGroups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Region">
            <select
              value={s.region ?? ""}
              onChange={(e) => set("region", e.target.value || null)}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            >
              <option value="">Any region</option>
              {regionChoices.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Cuisine focus">
            <input
              type="text"
              value={s.cuisine ?? ""}
              onChange={(e) => set("cuisine", e.target.value || null)}
              placeholder="e.g. French, tasting, wine"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            />
          </Field>

          <Field label="Search">
            <input
              type="search"
              value={s.query}
              onChange={(e) => set("query", e.target.value)}
              placeholder="Title, city, signal…"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            />
          </Field>

          <div className="flex flex-wrap gap-2">
            <Toggle
              active={s.preferNoConflicts}
              onClick={() => set("preferNoConflicts", !s.preferNoConflicts)}
            >
              Prefer no conflicts
            </Toggle>
            <Toggle active={s.preferWalkIn} onClick={() => set("preferWalkIn", !s.preferWalkIn)}>
              Prefer walk-in
            </Toggle>
            <Toggle active={s.wineForward} onClick={() => set("wineForward", !s.wineForward)}>
              Wine-forward
            </Toggle>
          </div>

          <div className="shrink-0 sm:ml-auto sm:self-end sm:pb-0.5">
            <Chip tone={inViewCount === totalCount ? "neutral" : "accent"}>
              <span className="text-num">{inViewCount}</span> of {totalCount} records ranked live
            </Chip>
          </div>
        </div>
      </div>
    </section>
  );
}
