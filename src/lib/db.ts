/**
 * Supabase, held at arm's length.
 *
 * The instrument works without a database and must keep working without one.
 * The corpus ships as per-region JSON so the ranked list is instant, offline
 * and unaffected by an outage; Postgres is additive. Every function here
 * returns null or an empty result when the database is absent or fails, and
 * no caller may treat that as an error state — it is the normal state.
 *
 * What the database is actually for:
 *   - search across all 167 regions without shipping them to the browser
 *   - night plans that survive the browser they were made in
 *   - enrichment history the pipeline can accumulate and query
 *
 * No sign-in, ever. Every visitor is the same anonymous role, and row-level
 * security decides what that role may do. Connection details come from
 * src/lib/db-config.ts, overridable by environment; see that file for why a
 * publishable key is checked in rather than configured. The service key
 * bypasses RLS, is never imported here, and never reaches the client.
 */

import { DEFAULT_SUPABASE_PUBLISHABLE_KEY, DEFAULT_SUPABASE_URL } from "@/lib/db-config";

const URL_KEY = "VITE_SUPABASE_URL";
const ANON_KEY = "VITE_SUPABASE_ANON_KEY";

type Env = Record<string, string | undefined>;

function readEnv(): { url: string; key: string } | null {
  // import.meta.env in the browser and in Vite's SSR; process.env in node.
  const meta = (import.meta as unknown as { env?: Env }).env ?? {};
  const proc = typeof process !== "undefined" && process.env ? (process.env as Env) : ({} as Env);
  // Environment first so a fork or a local stack can redirect it, then the
  // checked-in default so the shipped app needs no configuration at all.
  const url = meta[URL_KEY] || proc[URL_KEY] || DEFAULT_SUPABASE_URL;
  const key = meta[ANON_KEY] || proc[ANON_KEY] || DEFAULT_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url)) return null;
  return { url: url.replace(/\/$/, ""), key };
}

const env = readEnv();

/** Whether a database is configured at all. Never throws. */
export const dbConfigured = env !== null;

type RestOpts = { signal?: AbortSignal | undefined; timeoutMs?: number };

/**
 * One thin REST call against PostgREST.
 *
 * Deliberately not the @supabase/supabase-js client: this needs three
 * endpoints, and the app must not gain a dependency — or a bundle cost — for a
 * feature that is optional by design.
 */
async function rest<T>(path: string, init: RequestInit & RestOpts = {}): Promise<T | null> {
  if (!env) return null;
  const { timeoutMs = 6000, signal, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  signal?.addEventListener("abort", () => controller.abort(), { once: true });
  try {
    const res = await fetch(`${env.url}/rest/v1/${path}`, {
      ...rest,
      signal: controller.signal,
      headers: {
        apikey: env.key,
        Authorization: `Bearer ${env.key}`,
        "Content-Type": "application/json",
        ...(rest.headers ?? {}),
      },
    });
    if (!res.ok) return null;
    if (res.status === 204) return null;
    return (await res.json()) as T;
  } catch {
    // Offline, blocked, timed out, or misconfigured. The caller carries on.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A write whose only interesting answer is "did it land".
 *
 * night_plans has no SELECT policy — the id is the capability — so a save
 * cannot ask PostgREST to hand the row back. It returns the id it minted, and
 * needs to know whether the insert was accepted.
 */
async function restOk(path: string, init: RequestInit & RestOpts = {}): Promise<boolean> {
  if (!env) return false;
  const { timeoutMs = 6000, signal, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  signal?.addEventListener("abort", () => controller.abort(), { once: true });
  try {
    const res = await fetch(`${env.url}/rest/v1/${path}`, {
      ...rest,
      signal: controller.signal,
      headers: {
        apikey: env.key,
        Authorization: `Bearer ${env.key}`,
        "Content-Type": "application/json",
        ...(rest.headers ?? {}),
      },
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/* ── search ───────────────────────────────────────────────────────────────
 * The one thing JSON genuinely cannot do: look across all 1094 records
 * without loading them. Falls back to the loaded region when unavailable.
 */

export type SearchHit = {
  slug: string;
  title: string;
  region: string;
  region_group: string;
  cuisine_tags: string[];
  lat: number | null;
  lng: number | null;
  score: number;
};

export async function searchCorpus(
  query: string,
  opts: { limit?: number; signal?: AbortSignal } = {},
): Promise<SearchHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const body = JSON.stringify({ q, limit_n: Math.min(opts.limit ?? 20, 50) });
  const rows = await rest<SearchHit[]>("rpc/search_restaurants", {
    method: "POST",
    body,
    ...(opts.signal ? { signal: opts.signal } : {}),
  });
  return rows ?? [];
}

/* ── night plans ─────────────────────────────────────────────────────────── */

export type SavedPlan = {
  id: string;
  slugs: string[];
  situation: Record<string, unknown>;
  origin_label: string | null;
  title: string | null;
  note: string | null;
  created_at: string;
};

/** Unguessable, short enough to paste. The id is the capability. */
export function newPlanId(): string {
  const alphabet = "23456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
  const bytes = new Uint8Array(22);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

/**
 * Save a plan and return its id, or null when there is no database.
 *
 * The situation is stored without coordinates: a shared link carries the shape
 * of the ask and a city label, never where the sender was standing.
 */
export async function savePlan(input: {
  slugs: string[];
  situation: Record<string, unknown>;
  originLabel?: string | null;
  title?: string | null;
  note?: string | null;
}): Promise<string | null> {
  if (!env) return null;
  if (!input.slugs.length || input.slugs.length > 12) return null;

  const { origin: _drop, ...situation } = input.situation as Record<string, unknown>;
  const id = newPlanId();
  // return=minimal, not representation: the table is write-only to the
  // publishable key, so asking for the row back would fail the very insert
  // that succeeded. We minted the id; we do not need to be told it.
  const ok = await restOk("night_plans", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      id,
      slugs: input.slugs,
      situation,
      origin_label: input.originLabel ?? null,
      title: input.title ?? null,
      note: input.note ?? null,
    }),
  });
  return ok ? id : null;
}

/**
 * Fetch a plan by its id.
 *
 * Through the `get_night_plan` function rather than the table: night_plans
 * carries no SELECT policy, so there is no query — no bare select, no LIKE, no
 * prefix walk — that returns a plan to someone who does not already hold its
 * full id. That is what makes the id a capability rather than a courtesy.
 */
export async function loadPlan(id: string, signal?: AbortSignal): Promise<SavedPlan | null> {
  if (!/^[0-9A-Za-z]{16,40}$/.test(id)) return null;
  const rows = await rest<SavedPlan[]>("rpc/get_night_plan", {
    method: "POST",
    body: JSON.stringify({ plan_id: id }),
    ...(signal ? { signal } : {}),
  });
  return rows?.[0] ?? null;
}

/* ── coverage ─────────────────────────────────────────────────────────────
 * Seeding is incremental, so the database usually holds less than the JSON.
 * A half-seeded corpus is worse than an empty one if nobody says so: search
 * returns results, and a restaurant that simply has not been pushed yet reads
 * as one Deep Dish has never heard of. Anything rendering database-backed
 * search should say what that search covers.
 */

export type CorpusCoverage = {
  seeded: number;
  regions: number;
  with_prose: number;
  last_seeded_at: string | null;
};

/** Total records in the shipped JSON corpus — the denominator for coverage. */
export const CORPUS_TOTAL = 1094;

export async function corpusCoverage(signal?: AbortSignal): Promise<CorpusCoverage | null> {
  const rows = await rest<CorpusCoverage[]>(
    "corpus_coverage?select=*&limit=1",
    signal ? { signal } : {},
  );
  const row = rows?.[0];
  if (!row || typeof row.seeded !== "number") return null;
  return row;
}

/**
 * Whether database search can stand in for the whole corpus.
 *
 * Below the threshold the caller should present it as a partial index and keep
 * the local region as the authority, rather than letting an empty result mean
 * "no such restaurant".
 */
export function coverageIsComplete(c: CorpusCoverage | null): boolean {
  return c !== null && c.seeded >= CORPUS_TOTAL;
}
