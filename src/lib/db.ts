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
 * Credentials come from the environment. The anon key is publishable by
 * design and is guarded by row-level security; the service key is never
 * imported here and never reaches the client.
 */

const URL_KEY = "VITE_SUPABASE_URL";
const ANON_KEY = "VITE_SUPABASE_ANON_KEY";

type Env = Record<string, string | undefined>;

function readEnv(): { url: string; key: string } | null {
  // import.meta.env in the browser and in Vite's SSR; process.env in node.
  const meta = (import.meta as unknown as { env?: Env }).env ?? {};
  const proc = typeof process !== "undefined" && process.env ? (process.env as Env) : ({} as Env);
  const url = meta[URL_KEY] ?? proc[URL_KEY];
  const key = meta[ANON_KEY] ?? proc[ANON_KEY];
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
  const created = await rest<SavedPlan[]>("night_plans", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      id,
      slugs: input.slugs,
      situation,
      origin_label: input.originLabel ?? null,
      title: input.title ?? null,
      note: input.note ?? null,
    }),
  });
  return created?.[0]?.id ?? null;
}

export async function loadPlan(id: string, signal?: AbortSignal): Promise<SavedPlan | null> {
  if (!/^[0-9A-Za-z]{16,40}$/.test(id)) return null;
  const rows = await rest<SavedPlan[]>(
    `night_plans?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
    signal ? { signal } : {},
  );
  return rows?.[0] ?? null;
}
