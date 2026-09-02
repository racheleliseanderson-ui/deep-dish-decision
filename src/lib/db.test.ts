import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { dbConfigured, loadPlan, newPlanId, savePlan, searchCorpus } from "@/lib/db";
import { DEFAULT_SUPABASE_PUBLISHABLE_KEY, DEFAULT_SUPABASE_URL } from "@/lib/db-config";

/**
 * Two guarantees, and they are not the same one.
 *
 * The app now ships pointed at a database, because a publishable key is public
 * wherever you put it and making it a deploy setting only produced a build that
 * silently ran without one. So "configured" is the shipped state.
 *
 * "Reachable" is a separate question, and the answer must never be an error the
 * UI has to branch on. Down, blocked, slow, rate-limited, misconfigured — every
 * one of those returns an empty result, because the corpus ships as JSON and
 * the ranked list does not need Postgres to be correct.
 */

afterEach(() => vi.unstubAllGlobals());

describe("the shipped configuration", () => {
  it("points at a database with no environment set", () => {
    expect(dbConfigured).toBe(true);
    expect(DEFAULT_SUPABASE_URL).toMatch(/^https:\/\/[a-z0-9-]+\.supabase\.co$/);
  });

  it("ships a publishable key and nothing that bypasses row-level security", () => {
    const source = readFileSync(resolve(process.cwd(), "src/lib/db-config.ts"), "utf8");
    // Publishable keys are `sb_publishable_...`; the old anon key is a JWT
    // whose payload declares its role. Either is fine. A service key is not.
    expect(DEFAULT_SUPABASE_PUBLISHABLE_KEY).toMatch(/^sb_publishable_|^eyJ/);
    expect(source).not.toMatch(/service_role|sb_secret_|SERVICE_KEY\s*=/);
    expect(DEFAULT_SUPABASE_PUBLISHABLE_KEY).not.toContain("service");
  });

  it("asks for nothing from the person using it", () => {
    // No sign-in, no account, no identity. If a token, session or user ever
    // appears in this module, that assumption has quietly changed.
    const source = readFileSync(resolve(process.cwd(), "src/lib/db.ts"), "utf8");
    expect(source).not.toMatch(/signIn|signUp|getSession|auth\.|currentUser/);
  });
});

describe("an unreachable database is a normal state, not an error", () => {
  const down = () => {
    const spy = vi.fn(() => Promise.reject(new Error("network down")));
    vi.stubGlobal("fetch", spy);
    return spy;
  };

  it("returns empty results rather than throwing", async () => {
    down();
    await expect(searchCorpus("canlis")).resolves.toEqual([]);
    await expect(loadPlan("aaaaaaaaaaaaaaaaaa")).resolves.toBeNull();
    await expect(savePlan({ slugs: ["canlis"], situation: {} })).resolves.toBeNull();
  });

  it("survives a server error as calmly as an outage", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(new Response("boom", { status: 500 })));
    await expect(searchCorpus("canlis")).resolves.toEqual([]);
    await expect(savePlan({ slugs: ["canlis"], situation: {} })).resolves.toBeNull();
  });

  it("refuses a query too short to be meaningful, without calling out", async () => {
    const spy = down();
    await expect(searchCorpus("a")).resolves.toEqual([]);
    await expect(searchCorpus("   ")).resolves.toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it("refuses a malformed plan id without calling out", async () => {
    const spy = down();
    for (const bad of ["", "short", "../../etc/passwd", "a".repeat(80), "has spaces"]) {
      await expect(loadPlan(bad)).resolves.toBeNull();
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it("refuses a plan that is empty or larger than a night, without calling out", async () => {
    const spy = down();
    await expect(savePlan({ slugs: [], situation: {} })).resolves.toBeNull();
    await expect(
      savePlan({ slugs: Array.from({ length: 13 }, (_, i) => `r${i}`), situation: {} }),
    ).resolves.toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("plan ids", () => {
  it("are long and unguessable", () => {
    expect(newPlanId()).toMatch(/^[0-9A-Za-z]{22}$/);
  });

  it("do not repeat", () => {
    const ids = new Set(Array.from({ length: 500 }, newPlanId));
    expect(ids.size).toBe(500);
  });

  it("avoid characters that are misread when typed out", () => {
    const joined = Array.from({ length: 200 }, newPlanId).join("");
    // no 0/O/1/l/I — a plan id gets read aloud and copied by hand
    expect(joined).not.toMatch(/[0O1lI]/);
  });
});

describe("when a database is configured", () => {
  const URL = "https://pqbqvrmhbxowpqzcenod.supabase.co";

  async function withDb(handler: (input: string, init: RequestInit) => Response) {
    vi.resetModules();
    vi.stubEnv("VITE_SUPABASE_URL", URL);
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal("fetch", (input: string, init: RequestInit = {}) => {
      calls.push({ url: String(input), init });
      return Promise.resolve(handler(String(input), init));
    });
    const mod = await import("@/lib/db");
    return { mod, calls };
  }

  const json = (body: unknown) =>
    new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("reads a plan through the capability function, never the table", async () => {
    const { mod, calls } = await withDb(() => json([{ id: "aaaaaaaaaaaaaaaaaaaaaa", slugs: ["canlis"] }]));
    const plan = await mod.loadPlan("aaaaaaaaaaaaaaaaaaaaaa");
    expect(plan?.slugs).toEqual(["canlis"]);

    const call = calls.at(-1)!;
    expect(call.url).toBe(`${URL}/rest/v1/rpc/get_night_plan`);
    // No query against the table itself — that path returns nothing to anon now,
    // and asking would mean the id had stopped being the capability.
    expect(call.url).not.toMatch(/night_plans\?/);
    expect(JSON.parse(String(call.init.body))).toEqual({ plan_id: "aaaaaaaaaaaaaaaaaaaaaa" });
  });

  it("saves without asking for the row back, and returns the id it minted", async () => {
    const { mod, calls } = await withDb(() => new Response(null, { status: 201 }));
    const id = await mod.savePlan({ slugs: ["canlis", "revel"], situation: { occasion: "Date night" } });
    expect(id).toMatch(/^[0-9A-Za-z]{22}$/);

    const call = calls.at(-1)!;
    const prefer = new Headers(call.init.headers).get("Prefer");
    expect(prefer).toBe("return=minimal");
    expect(prefer).not.toMatch(/representation/);
    expect(JSON.parse(String(call.init.body)).id).toBe(id);
  });

  it("does not send the reader's coordinates to a shared plan", async () => {
    const { mod, calls } = await withDb(() => new Response(null, { status: 201 }));
    await mod.savePlan({
      slugs: ["canlis"],
      situation: { occasion: "Date night", origin: [47.6062, -122.3321], originLabel: "Seattle" },
      originLabel: "Seattle",
    });
    const body = JSON.parse(String(calls.at(-1)!.init.body));
    expect(body.situation.origin).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("47.6");
    expect(body.origin_label).toBe("Seattle");
  });

  it("reports a rejected save as a failure rather than a fake id", async () => {
    const { mod } = await withDb(() => new Response("nope", { status: 401 }));
    await expect(mod.savePlan({ slugs: ["canlis"], situation: {} })).resolves.toBeNull();
  });

  it("searches through the RPC and survives an outage", async () => {
    const hits = [{ slug: "the-pink-door", title: "The Pink Door", score: 1 }];
    const { mod, calls } = await withDb((url) =>
      url.endsWith("rpc/search_restaurants") ? json(hits) : new Response(null, { status: 500 }),
    );
    await expect(mod.searchCorpus("pink door")).resolves.toHaveLength(1);
    expect(calls.at(-1)!.url).toBe(`${URL}/rest/v1/rpc/search_restaurants`);

    const down = await withDb(() => new Response("boom", { status: 503 }));
    await expect(down.mod.searchCorpus("pink door")).resolves.toEqual([]);
  });

  it("refuses a hostile url outright rather than falling back to the default", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_SUPABASE_URL", "https://evil.example.com");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const mod = await import("@/lib/db");
    // An override that is not a supabase.co host is a misconfiguration, and the
    // safe response is no database at all. Quietly reverting to the built-in
    // project would send someone's plan somewhere they did not choose.
    expect(mod.dbConfigured).toBe(false);
    await mod.searchCorpus("canlis");
    await mod.savePlan({ slugs: ["canlis"], situation: {} });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("coverage is reported, not assumed", () => {
  const URL = "https://pqbqvrmhbxowpqzcenod.supabase.co";

  async function withDb(handler: () => Response) {
    vi.resetModules();
    vi.stubEnv("VITE_SUPABASE_URL", URL);
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
    vi.stubGlobal("fetch", () => Promise.resolve(handler()));
    return import("@/lib/db");
  }

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("does not call a partial index complete", async () => {
    const mod = await withDb(
      () =>
        new Response(JSON.stringify([{ seeded: 258, regions: 57, with_prose: 17, last_seeded_at: null }]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    const c = await mod.corpusCoverage();
    expect(c?.seeded).toBe(258);
    // 258 of 1094 is a partial index. Treating it as the corpus would turn
    // "not seeded yet" into "no such restaurant".
    expect(mod.coverageIsComplete(c)).toBe(false);
  });

  it("treats an unreachable coverage check as unknown, never as complete", async () => {
    const mod = await withDb(() => new Response("boom", { status: 500 }));
    const c = await mod.corpusCoverage();
    expect(c).toBeNull();
    expect(mod.coverageIsComplete(c)).toBe(false);
  });
});

describe("search results carry why they matched", () => {
  const URL = "https://pqbqvrmhbxowpqzcenod.supabase.co";

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("passes a dish attribution through untouched", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_SUPABASE_URL", URL);
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
    vi.stubGlobal("fetch", () =>
      Promise.resolve(
        new Response(
          JSON.stringify([
            { slug: "dooky", title: "Dooky Chase's", score: 1, matched_dish: "gumbo" },
            { slug: "pink", title: "The Pink Door", score: 1, matched_dish: null },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const mod = await import("@/lib/db");
    const hits = await mod.searchCorpus("gumbo");
    expect(hits[0]?.matched_dish).toBe("gumbo");
    // A name match must not be dressed up as a dish match.
    expect(hits[1]?.matched_dish).toBeNull();
  });
});
