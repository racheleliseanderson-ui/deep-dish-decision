import { Eyebrow, Field, Toggle } from "@/components/rih/bits";
import { GiltRule, Vitrine } from "@/components/rih/gilt";
import queue from "@/data/expansion-queue.json";
import {
  CUISINE_FOCUS_OPTIONS,
  clamp,
  hygieneCommand,
  planCommand,
  PLAN_COMMAND_NOTE,
  planJson,
  projectedInserts,
  projectedSearchCalls,
  refreshQueueCommand,
  useRunPlan,
} from "@/lib/run-plan";
import { useMemo, useState } from "react";

type QueueCity = {
  city: string;
  stateCode: string;
  priority: number;
  tier: string;
  status: string;
  inserted?: number;
};

const cities = (queue.cities as QueueCity[]) ?? [];

function Stepper({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (n: number) => void;
}) {
  return (
    <Field label={label} hint={suffix ?? ""}>
      <div className="flex items-stretch gap-2">
        <button
          type="button"
          onClick={() => onChange(clamp(value - step, min, max))}
          aria-label={`Decrease ${label}`}
          className="tap flex w-11 items-center justify-center rounded-lg border border-border bg-surface-raised text-foreground transition-colors hover:border-gilt"
        >
          −
        </button>
        <output className="text-num flex min-w-0 flex-1 items-center justify-center rounded-lg border border-border bg-surface-sunken/70 px-3 text-lg">
          {value}
        </output>
        <button
          type="button"
          onClick={() => onChange(clamp(value + step, min, max))}
          aria-label={`Increase ${label}`}
          className="tap flex w-11 items-center justify-center rounded-lg border border-border bg-surface-raised text-foreground transition-colors hover:border-gilt"
        >
          +
        </button>
      </div>
    </Field>
  );
}

export function RunPlanner() {
  const { plan, update, reset } = useRunPlan();
  const [cityQuery, setCityQuery] = useState("");
  const [copied, setCopied] = useState<"cmd" | "json" | null>(null);

  const matches = useMemo(() => {
    const q = cityQuery.trim().toLowerCase();
    return cities
      .filter((c) => !q || `${c.city} ${c.stateCode}`.toLowerCase().includes(q))
      .sort((a, b) => a.priority - b.priority)
      .slice(0, q ? 12 : 8);
  }, [cityQuery]);

  const pinnedSet = new Set(plan.pinnedCities);
  const label = (c: QueueCity) => `${c.city}, ${c.stateCode}`;

  const togglePin = (l: string) =>
    update({
      pinnedCities: pinnedSet.has(l)
        ? plan.pinnedCities.filter((x) => x !== l)
        : [...plan.pinnedCities, l],
    });

  const move = (i: number, dir: -1 | 1) => {
    const next = [...plan.pinnedCities];
    const j = i + dir;
    const a = next[i];
    const b = next[j];
    if (a === undefined || b === undefined) return;
    next[i] = b;
    next[j] = a;
    update({ pinnedCities: next });
  };

  const newStates = useMemo(() => {
    const represented = new Set(
      cities.filter((c) => (c.inserted ?? 0) > 0).map((c) => c.stateCode),
    );
    return [
      ...new Set(
        plan.pinnedCities
          .map((l) => l.split(",")[1]?.trim() ?? "")
          .filter((s) => s.length > 0 && !represented.has(s)),
      ),
    ];
  }, [plan.pinnedCities]);

  const command = planCommand(plan);
  const json = planJson(plan);

  const copy = async (text: string, which: "cmd" | "json") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      setCopied(null);
    }
  };

  return (
    <Vitrine className="overflow-hidden">
      <div className="border-b border-border px-5 py-6 sm:px-8">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <div className="min-w-0">
            <Eyebrow>Run planner</Eyebrow>
            <h2 className="display-chapter mt-3">Compose the next expansion run.</h2>
            <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">
              Nothing on this page launches a run — you take the command or plan file out and run it
              yourself. This panel composes the plan, projects its cost, and gives you the exact
              command and file to execute unchanged. Hygiene runs ahead of expansion whenever the
              refresh queue is non-empty.
            </p>
            <div className="mt-4 rounded-xl border border-border bg-surface-sunken/50 px-4 py-3">
              <Eyebrow>Hygiene first</Eyebrow>
              <p className="mt-1.5 font-mono text-[11px] leading-relaxed text-foreground">
                {hygieneCommand(25)}
              </p>
              <p className="mt-1 font-mono text-[11px] text-subtle">{refreshQueueCommand()}</p>
              <p className="mt-2 text-[12px] text-muted-foreground">
                Rebuilds the stale-by-tier queue, then enriches existing slugs only: never enriched,
                thin, site-failure and review-due.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={reset}
            className="tap shrink-0 rounded-full border border-border px-4 text-xs text-muted-foreground transition-colors hover:border-gilt hover:text-foreground"
          >
            Reset plan
          </button>
        </div>
      </div>

      <div className="grid gap-8 px-5 py-7 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-7">
          <div className="grid gap-5 sm:grid-cols-2">
            <Stepper
              label="Restaurants per city"
              value={plan.restaurantsPerRun}
              min={1}
              max={25}
              suffix="1–25"
              onChange={(n) => update({ restaurantsPerRun: n })}
            />
            <Stepper
              label="Cities per run"
              value={plan.citiesPerRun}
              min={1}
              max={12}
              suffix="unpinned fallback"
              onChange={(n) => update({ citiesPerRun: n })}
            />
          </div>

          <Field label="Daily insert cap" hint={`${plan.dailyCap} records`}>
            <input
              type="range"
              min={10}
              max={600}
              step={10}
              value={plan.dailyCap}
              onChange={(e) => update({ dailyCap: Number(e.target.value) })}
              className="tap w-full accent-[var(--color-gilt)]"
              aria-label="Daily insert cap"
            />
            <div className="mt-1 flex justify-between text-[10px] text-subtle">
              <span>10</span>
              <span>600</span>
            </div>
          </Field>

          <Field label="Run state">
            <div className="flex flex-wrap gap-2">
              <Toggle active={!plan.paused} onClick={() => update({ paused: false })}>
                Active
              </Toggle>
              <Toggle active={plan.paused} onClick={() => update({ paused: true })}>
                Paused
              </Toggle>
              <Toggle
                active={plan.enrichAfterInsert}
                onClick={() => update({ enrichAfterInsert: !plan.enrichAfterInsert })}
              >
                Enrich after insert
              </Toggle>
            </div>
          </Field>

          <Field label="Cuisine focus" hint="becomes the search seeds">
            <div className="flex flex-wrap gap-1.5">
              {CUISINE_FOCUS_OPTIONS.map((c) => (
                <Toggle
                  key={c}
                  size="sm"
                  active={plan.cuisineFocus.includes(c)}
                  onClick={() =>
                    update({
                      cuisineFocus: plan.cuisineFocus.includes(c)
                        ? plan.cuisineFocus.filter((x) => x !== c)
                        : [...plan.cuisineFocus, c],
                    })
                  }
                >
                  {c}
                </Toggle>
              ))}
            </div>
          </Field>
        </div>

        <div className="space-y-7">
          <Field label="Pinned cities" hint={`${plan.pinnedCities.length} pinned`}>
            <input
              value={cityQuery}
              onChange={(e) => setCityQuery(e.target.value)}
              type="search"
              autoComplete="off"
              placeholder="Search the queue — city or state code"
              aria-label="Search queued cities"
              className="tap w-full rounded-lg border border-input bg-surface-raised px-3 py-2 text-[13px] text-foreground placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <ul className="mt-3 divide-y divide-border">
              {matches.map((c) => {
                const l = label(c);
                const on = pinnedSet.has(l);
                return (
                  <li key={l}>
                    <button
                      type="button"
                      onClick={() => togglePin(l)}
                      aria-pressed={on}
                      className="tap flex w-full items-center justify-between gap-3 py-2 text-left"
                    >
                      <span className="min-w-0 truncate text-[13px] text-foreground">{c.city}</span>
                      <span className="text-num shrink-0 text-[11px] text-subtle">
                        {c.stateCode} · #{c.priority} · {c.status}
                      </span>
                      <span
                        className={`size-2 shrink-0 rounded-full ${on ? "bg-gilt" : "bg-border-strong"}`}
                        aria-hidden
                      />
                    </button>
                  </li>
                );
              })}
              {!matches.length ? (
                <li className="py-3 text-[13px] text-muted-foreground">
                  No queued city matches that search.
                </li>
              ) : null}
            </ul>
          </Field>

          {plan.pinnedCities.length ? (
            <Field label="Run order" hint="first pinned runs first">
              <ol className="divide-y divide-border">
                {plan.pinnedCities.map((l, i) => (
                  <li key={l} className="flex items-center gap-2 py-2">
                    <span className="text-num w-6 shrink-0 text-[11px] text-gilt">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px]">{l}</span>
                    <button
                      type="button"
                      onClick={() => move(i, -1)}
                      aria-label={`Move ${l} earlier`}
                      className="tap w-9 rounded-md border border-border text-xs text-subtle hover:text-foreground"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => move(i, 1)}
                      aria-label={`Move ${l} later`}
                      className="tap w-9 rounded-md border border-border text-xs text-subtle hover:text-foreground"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => togglePin(l)}
                      aria-label={`Unpin ${l}`}
                      className="tap w-9 rounded-md border border-border text-xs text-subtle hover:text-critical"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ol>
            </Field>
          ) : null}

          <div className="rounded-xl border border-border bg-surface-sunken/70 p-4">
            <Eyebrow>Projection</Eyebrow>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
              <dt className="text-muted-foreground">Records added</dt>
              <dd className="text-num text-right">up to {projectedInserts(plan)}</dd>
              <dt className="text-muted-foreground">Places searches</dt>
              <dd className="text-num text-right">{projectedSearchCalls(plan)}</dd>
              <dt className="text-muted-foreground">Share of daily cap</dt>
              <dd className="text-num text-right">
                {Math.round((projectedInserts(plan) / plan.dailyCap) * 100)}%
              </dd>
              <dt className="text-muted-foreground">States moved off zero</dt>
              <dd className="text-num text-right">{newStates.length || "—"}</dd>
            </dl>
            <p className="mt-3 text-[12px] leading-relaxed text-subtle">
              A projection, not a promise: duplicates, thin listings and unmatched candidates all
              reduce the real insert count.{" "}
              {plan.paused ? "The plan is paused, so run nothing until you unpause it." : ""}
            </p>
          </div>
        </div>
      </div>

      <GiltRule />

      <div className="space-y-4 px-5 py-6 sm:px-8">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Eyebrow>Command of record</Eyebrow>
            <button
              type="button"
              onClick={() => copy(command, "cmd")}
              className="tap rounded-full border border-gilt/50 px-4 text-xs text-gilt transition-colors hover:bg-gilt-soft"
            >
              {copied === "cmd" ? "Copied" : "Copy command"}
            </button>
          </div>
          <pre className="mt-2 overflow-x-auto rounded-lg border border-border bg-ink px-4 py-3 text-[12px] text-ink-foreground">
            <code>{command}</code>
          </pre>
          <p className="mt-2 text-[12px] leading-relaxed text-subtle">{PLAN_COMMAND_NOTE}</p>
        </div>
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Eyebrow>Plan file</Eyebrow>
            <button
              type="button"
              onClick={() => copy(json, "json")}
              className="tap rounded-full border border-border px-4 text-xs text-muted-foreground transition-colors hover:border-gilt hover:text-foreground"
            >
              {copied === "json" ? "Copied" : "Copy plan file"}
            </button>
          </div>
          <pre className="scroll-slim mt-2 max-h-56 overflow-auto rounded-lg border border-border bg-surface-sunken/70 px-4 py-3 text-[12px] text-muted-foreground">
            <code>{json}</code>
          </pre>
        </div>
      </div>
    </Vitrine>
  );
}
