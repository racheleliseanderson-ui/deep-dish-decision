import { Chip, Eyebrow, Field, Input, Select } from "@/components/ui";
import {
  COMMITMENT_LEVELS,
  CONSTRAINTS,
  DAYPARTS,
  OCCASIONS,
  PLANNING_LEVELS,
  SPEND_BANDS,
  type Constraint,
  type Occasion,
  type Situation,
} from "@/lib/types";
import { PLAYBOOKS, applyPlaybook } from "@/lib/playbooks";
import { REGION_GROUPS, CUISINE_OPTIONS } from "@/data/restaurants";
import { situationDepth, SITUATION_SLOTS } from "@/lib/intelligence";
import { addDaysIso } from "@/lib/utils";

export function SituationForm({
  situation,
  onChange,
  mode,
  onMode,
}: {
  situation: Situation;
  onChange: (s: Situation) => void;
  mode: "guided" | "advanced";
  onMode: (m: "guided" | "advanced") => void;
}) {
  const depth = situationDepth(situation);
  const set = (patch: Partial<Situation>) => onChange({ ...situation, ...patch });
  const toggleConstraint = (c: Constraint) => {
    const has = situation.constraints.includes(c);
    set({
      constraints: has ? situation.constraints.filter((x) => x !== c) : [...situation.constraints, c],
    });
  };

  return (
    <section className="plate p-5 sm:p-6" aria-labelledby="situation-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Eyebrow>Describe the night</Eyebrow>
          <h2 id="situation-heading" className="mt-1 font-display text-2xl tracking-tight">
            What has to be true for this evening?
          </h2>
          <p className="mt-1 max-w-xl text-[13px] text-muted-foreground">
            Cuisine is the last filter. Occasion and guest constraints decide whether a room can hold
            the night at all. Partial input is fine — unknowns stay visible.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-num text-xs text-subtle" aria-hidden>
            {depth}/{SITUATION_SLOTS}
          </span>
          <div
            className="h-1.5 w-28 overflow-hidden rounded-full bg-surface-sunken"
            role="meter"
            aria-label="Situation depth"
            aria-valuemin={0}
            aria-valuemax={SITUATION_SLOTS}
            aria-valuenow={depth}
            aria-valuetext={`${depth} of ${SITUATION_SLOTS} slots filled`}
          >
            <div
              className="h-full bg-primary transition-[width] duration-300"
              style={{ width: `${(depth / SITUATION_SLOTS) * 100}%` }}
            />
          </div>
        </div>
      </div>

      <div className="mt-4 flex gap-2" role="radiogroup" aria-label="Entry mode">
        <Chip active={mode === "guided"} onClick={() => onMode("guided")} aria-label="Guided entry">
          Guided
        </Chip>
        <Chip active={mode === "advanced"} onClick={() => onMode("advanced")} aria-label="Advanced entry">
          Advanced
        </Chip>
      </div>

      <div className="mt-5">
        <Eyebrow>Starting points</Eyebrow>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {PLAYBOOKS.filter((p) => p.chapter === "night" || p.chapter === "constraint").map((p) => (
            <Chip
              key={p.id}
              active={situation.occasion === p.apply.occasion && (p.apply.constraints ?? []).every((c) => situation.constraints.includes(c))}
              onClick={() => onChange(applyPlaybook(p))}
            >
              {p.title}
            </Chip>
          ))}
        </div>
      </div>

      <fieldset className="mt-6">
        <legend className="text-[12px] font-medium">Occasion</legend>
        <p className="mt-0.5 text-[12px] text-subtle">One at a time. This reshapes ranking more than cuisine.</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {OCCASIONS.map((o) => (
            <Chip key={o} active={situation.occasion === o} onClick={() => set({ occasion: situation.occasion === o ? null : (o as Occasion) })}>
              {o}
            </Chip>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-6">
        <legend className="text-[12px] font-medium">Hard constraints</legend>
        <p className="mt-0.5 text-[12px] text-subtle">
          Fail-closed — never assumed satisfied. If the record cannot show it, the booking is held.
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {CONSTRAINTS.map((c) => (
            <Chip key={c} active={situation.constraints.includes(c)} onClick={() => toggleConstraint(c)}>
              {c}
            </Chip>
          ))}
        </div>
      </fieldset>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Field label="Party size" hint="How many seats.">
          <Select
            value={situation.partySize ?? ""}
            onChange={(e) => set({ partySize: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">I don’t know yet</option>
            {[1, 2, 3, 4, 5, 6, 8, 10, 12].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="When" hint="Lead time, or pick a date.">
          <Select
            value={situation.leadDays ?? ""}
            onChange={(e) => {
              const lead = e.target.value === "" ? null : Number(e.target.value);
              set({ leadDays: lead, nightDate: lead === null ? situation.nightDate : addDaysIso(lead) });
            }}
          >
            <option value="">Not set</option>
            <option value={0}>Tonight</option>
            <option value={1}>Tomorrow</option>
            <option value={2}>In 2 days</option>
            <option value={3}>In 3 days</option>
            <option value={5}>This week</option>
            <option value={7}>In a week</option>
            <option value={14}>In 2 weeks</option>
            <option value={21}>In 3 weeks</option>
            <option value={30}>In a month</option>
          </Select>
        </Field>
        <Field label="Date" hint="Used in the confirmation script.">
          <Input
            type="date"
            value={situation.nightDate ?? ""}
            onChange={(e) => set({ nightDate: e.target.value || null })}
          />
        </Field>
      </div>

      {mode === "advanced" ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Time">
            <Input
              type="time"
              value={situation.nightTime ?? ""}
              onChange={(e) => set({ nightTime: e.target.value || null })}
            />
          </Field>
          <Field label="Daypart">
            <Select value={situation.daypart ?? ""} onChange={(e) => set({ daypart: e.target.value || null })}>
              <option value="">Any</option>
              {DAYPARTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Spend band" hint="Published language, not a guess.">
            <Select value={situation.spendBand ?? ""} onChange={(e) => set({ spendBand: e.target.value || null })}>
              <option value="">Any</option>
              {SPEND_BANDS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Max commitment">
            <Select
              value={situation.maxCommitment ?? ""}
              onChange={(e) => set({ maxCommitment: e.target.value || null })}
            >
              <option value="">No ceiling</option>
              {COMMITMENT_LEVELS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Max planning load">
            <Select
              value={situation.maxPlanningLoad ?? ""}
              onChange={(e) => set({ maxPlanningLoad: e.target.value || null })}
            >
              <option value="">No ceiling</option>
              {PLANNING_LEVELS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Region">
            <Select
              value={situation.regionGroup ?? ""}
              onChange={(e) => set({ regionGroup: e.target.value || null })}
            >
              <option value="">All regions</option>
              {REGION_GROUPS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Cuisine focus">
            <Select value={situation.cuisine ?? ""} onChange={(e) => set({ cuisine: e.target.value || null })}>
              <option value="">Any</option>
              {CUISINE_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Search">
            <Input
              value={situation.query}
              placeholder="Name, neighborhood, word"
              onChange={(e) => set({ query: e.target.value })}
            />
          </Field>
          <div className="flex flex-col justify-end gap-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={situation.preferWalkIn}
                onChange={(e) => set({ preferWalkIn: e.target.checked })}
              />
              Prefer walk-in
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={situation.wineForward}
                onChange={(e) => set({ wineForward: e.target.checked })}
              />
              Wine-forward
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={situation.preferNoConflicts}
                onChange={(e) => set({ preferNoConflicts: e.target.checked })}
              />
              Prefer no official conflicts
            </label>
          </div>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Field label="Where">
            <Select
              value={situation.regionGroup ?? ""}
              onChange={(e) => set({ regionGroup: e.target.value || null })}
            >
              <option value="">All regions in this working set</option>
              {REGION_GROUPS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Time (optional)">
            <Input
              type="time"
              value={situation.nightTime ?? ""}
              onChange={(e) => set({ nightTime: e.target.value || null })}
            />
          </Field>
        </div>
      )}
    </section>
  );
}
