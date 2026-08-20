import { Eyebrow, Field, Toggle } from "@/components/rih/bits";
import { GiltRule, Vitrine } from "@/components/rih/gilt";
import queue from "@/data/expansion-queue.json";
import {
  CUISINE_FOCUS_OPTIONS,
  REGION_OPTIONS,
  buildOwnedFetchCommand,
  buildPlanJson,
  type CuisineFocus,
  type RegionId,
} from "@/lib/run-plan";
import { useMemo, useState } from "react";

export function RunPlanner() {
  const [region, setRegion] = useState<RegionId>("chicago");
  const [cuisine, setCuisine] = useState<CuisineFocus>("any");
  const [limit, setLimit] = useState(12);
  const [includeClosed, setIncludeClosed] = useState(false);
  const [copied, setCopied] = useState<"cmd" | "json" | null>(null);

  const command = useMemo(
    () =>
      buildOwnedFetchCommand({
        region,
        cuisine,
        limit,
        includeClosed,
      }),
    [region, cuisine, limit, includeClosed],
  );

  const json = useMemo(
    () =>
      buildPlanJson({
        region,
        cuisine,
        limit,
        includeClosed,
        queueLength: Array.isArray(queue) ? queue.length : 0,
      }),
    [region, cuisine, limit, includeClosed],
  );

  const copy = async (text: string, which: "cmd" | "json") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      /* clipboard may be blocked */
    }
  };

  return (
    <Vitrine className="overflow-hidden">
      <div className="border-b border-border px-5 py-6 sm:px-8">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <div>
            <Eyebrow>Run planner</Eyebrow>
            <h2 className="mt-2 font-display text-2xl tracking-tight text-foreground sm:text-3xl">
              Instructions of record for the next owned-fetch pass
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Build a bounded command and a plan file from the same controls. Nothing runs from this
              page — you copy the command into your terminal, or keep the plan file as the record of
              what you intended.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 border-b border-border px-5 py-6 sm:grid-cols-2 sm:px-8 lg:grid-cols-4">
        <div>
          <Eyebrow>Hygiene first</Eyebrow>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Prefer open listings. Closed houses stay in the archive unless you explicitly include
            them.
          </p>
          <div className="mt-4">
            <Toggle
              checked={includeClosed}
              onChange={setIncludeClosed}
              label="Include closed"
            />
          </div>
        </div>
        <Field label="Region">
          <select
            className="w-full rounded-lg border border-border bg-surface-sunken px-3 py-2 text-sm text-foreground"
            value={region}
            onChange={(e) => setRegion(e.target.value as RegionId)}
          >
            {REGION_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Cuisine focus">
          <select
            className="w-full rounded-lg border border-border bg-surface-sunken px-3 py-2 text-sm text-foreground"
            value={cuisine}
            onChange={(e) => setCuisine(e.target.value as CuisineFocus)}
          >
            {CUISINE_FOCUS_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Limit">
          <input
            type="number"
            min={1}
            max={48}
            className="w-full rounded-lg border border-border bg-surface-sunken px-3 py-2 text-sm text-foreground"
            value={limit}
            onChange={(e) => setLimit(Math.max(1, Math.min(48, Number(e.target.value) || 1)))}
          />
        </Field>
      </div>

      <div className="grid gap-6 px-5 py-6 sm:px-8 lg:grid-cols-2">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Eyebrow>Command of record</Eyebrow>
            <button
              type="button"
              onClick={() => copy(command, "cmd")}
              className="tap rounded-full border border-border px-4 text-xs text-muted-foreground transition-colors hover:border-gilt hover:text-foreground"
            >
              {copied === "cmd" ? "Copied" : "Copy command"}
            </button>
          </div>
          <pre className="mt-2 overflow-x-auto rounded-lg border border-border bg-ink px-4 py-3 text-[12px] text-ink-foreground">
            <code>{command}</code>
          </pre>
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
