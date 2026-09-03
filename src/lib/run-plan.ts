import { useCallback, useEffect, useState } from "react";

/**
 * A run plan is the operator's instruction to the expansion pipeline.
 * The browser composes this object and renders the exact instructions to execute it.
 */
export type RunPlan = {
  restaurantsPerRun: number;
  citiesPerRun: number;
  dailyCap: number;
  paused: boolean;
  pinnedCities: string[];
  cuisineFocus: string[];
  enrichAfterInsert: boolean;
};

export const CUISINE_FOCUS_OPTIONS = [
  "Mexican",
  "Sichuan Chinese",
  "Cantonese",
  "Japanese izakaya",
  "Korean",
  "Thai",
  "Vietnamese",
  "Indian",
  "Ethiopian",
  "Lebanese",
  "Filipino",
  "Peruvian",
  "Nigerian",
  "Polish",
  "Fine dining",
  "Wine bar",
  "Seafood",
] as const;

export const defaultRunPlan: RunPlan = {
  restaurantsPerRun: 5,
  citiesPerRun: 2,
  dailyCap: 200,
  paused: false,
  pinnedCities: [],
  cuisineFocus: [],
  enrichAfterInsert: true,
};

const KEY = "rih.run-plan.v1";

function sanitize(raw: unknown): RunPlan {
  const p = (raw ?? {}) as Partial<RunPlan>;
  return {
    restaurantsPerRun: clamp(Number(p.restaurantsPerRun) || 5, 1, 25),
    citiesPerRun: clamp(Number(p.citiesPerRun) || 2, 1, 12),
    dailyCap: clamp(Number(p.dailyCap) || 200, 10, 1000),
    paused: Boolean(p.paused),
    pinnedCities: Array.isArray(p.pinnedCities) ? p.pinnedCities.slice(0, 12) : [],
    cuisineFocus: Array.isArray(p.cuisineFocus) ? p.cuisineFocus.slice(0, 8) : [],
    enrichAfterInsert: p.enrichAfterInsert !== false,
  };
}

export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function useRunPlan() {
  const [plan, setPlan] = useState<RunPlan>(defaultRunPlan);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setPlan(sanitize(JSON.parse(raw)));
    } catch {
      /* corrupt or unavailable storage — fall back to the default plan */
    }
    setHydrated(true);
  }, []);

  const update = useCallback((patch: Partial<RunPlan>) => {
    setPlan((prev) => {
      const next = sanitize({ ...prev, ...patch });
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable — the plan still applies for this session */
      }
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* nothing to clear */
    }
    setPlan(defaultRunPlan);
  }, []);

  return { plan, update, reset, hydrated };
}

/**
 * The instruction line that executes this exact plan.
 *
 * This printed `node scripts/pipeline/discover.mjs --plan=run-plan.json …`
 * until now. discover.mjs has been a stub since Google Places was removed: it
 * prints a refusal and exits 1, so the "command of record" was a command that
 * could not run. The working path is the offline seed, which is what
 * discover.mjs itself directs you to, and it takes --cities.
 *
 * `restaurantsPerRun`, `citiesPerRun`, `dailyCap`, `paused` and `cuisineFocus`
 * have no flag on the seed scripts, so they are not smuggled into the command
 * line as though they did — planLimitsAreAdvisory() says so in the UI instead.
 */
export function planCommand(plan: RunPlan) {
  const script = plan.enrichAfterInsert
    ? "scripts/pipeline/seed-and-enrich.mjs"
    : "scripts/pipeline/seed-listings.mjs";
  const cities = plan.pinnedCities.length ? ` --cities="${plan.pinnedCities.join(",")}"` : "";
  return `node ${script}${cities}`;
}

/** What the command line cannot carry, said plainly rather than implied. */
export const PLAN_COMMAND_NOTE =
  "Google Places discovery is disabled in this project, so there is no discover run to dispatch. This seeds from the verified listing batches in src/data/seed-listings*.json. Batch size, cities per run, the daily cap and cuisine focus are planning figures only — the seed scripts take no flags for them.";

/** Hygiene before expansion: never-enriched, thin, site failures, review due. */
export function hygieneCommand(batch = 25) {
  return `node scripts/pipeline/enrich.mjs --hygiene --batch=${batch}`;
}

export function refreshQueueCommand() {
  return `node scripts/pipeline/refresh.mjs && node scripts/pipeline/report.mjs`;
}

export function planJson(plan: RunPlan) {
  return JSON.stringify(
    {
      restaurantsPerRun: plan.restaurantsPerRun,
      citiesPerRun: plan.citiesPerRun,
      dailyCap: plan.dailyCap,
      paused: plan.paused,
      pinnedCities: plan.pinnedCities,
      cuisineFocus: plan.cuisineFocus,
    },
    null,
    2,
  );
}

/** Records this plan would add if every target yields a full batch. */
export function projectedInserts(plan: RunPlan) {
  const cities = plan.pinnedCities.length || plan.citiesPerRun;
  return Math.min(cities * plan.restaurantsPerRun, plan.dailyCap);
}

/** Places text-search calls per run: one per seed per city. */
export function projectedSearchCalls(plan: RunPlan) {
  const cities = plan.pinnedCities.length || plan.citiesPerRun;
  const seeds = plan.cuisineFocus.length || 3;
  return cities * seeds;
}
