import { afterEach, describe, expect, it, vi } from "vitest";
import { dbConfigured, loadPlan, newPlanId, savePlan, searchCorpus } from "@/lib/db";

/**
 * The database is optional. These tests assert the thing that actually
 * matters: with no credentials configured — the state this repo ships in — the
 * module is inert, makes no network calls, and hands every caller a value they
 * can render without a branch for "the database is down".
 */

afterEach(() => vi.unstubAllGlobals());

describe("a missing database is the normal state", () => {
  it("reports itself unconfigured rather than throwing", () => {
    expect(dbConfigured).toBe(false);
  });

  it("never reaches the network when unconfigured", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await searchCorpus("canlis");
    await loadPlan("aaaaaaaaaaaaaaaaaa");
    await savePlan({ slugs: ["canlis"], situation: {} });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns empty results, not errors", async () => {
    await expect(searchCorpus("canlis")).resolves.toEqual([]);
    await expect(loadPlan("aaaaaaaaaaaaaaaaaa")).resolves.toBeNull();
    await expect(savePlan({ slugs: ["canlis"], situation: {} })).resolves.toBeNull();
  });

  it("refuses a query too short to be meaningful", async () => {
    await expect(searchCorpus("a")).resolves.toEqual([]);
    await expect(searchCorpus("   ")).resolves.toEqual([]);
  });

  it("refuses a malformed plan id without calling out", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    for (const bad of ["", "short", "../../etc/passwd", "a".repeat(80), "has spaces"]) {
      await expect(loadPlan(bad)).resolves.toBeNull();
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses a plan that is empty or larger than a night", async () => {
    await expect(savePlan({ slugs: [], situation: {} })).resolves.toBeNull();
    await expect(
      savePlan({ slugs: Array.from({ length: 13 }, (_, i) => `r${i}`), situation: {} }),
    ).resolves.toBeNull();
  });
});

describe("plan ids", () => {
  it("are long and unguessable", () => {
    const id = newPlanId();
    expect(id).toMatch(/^[0-9A-Za-z]{22}$/);
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

/**
 * With credentials present, the shape of the request matters as much as the
 * result. night_plans has no SELECT policy — the id is the capability — so a
 * read must go through get_night_plan and a save must not ask for the row back.
 * These assert the wire, because a regression here is a privacy leak, not a bug
 * anyone would see on screen.
 */
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

  it("refuses a hostile url instead of trusting it", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_SUPABASE_URL", "https://evil.example.com");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const mod = await import("@/lib/db");
    expect(mod.dbConfigured).toBe(false);
    await mod.searchCorpus("canlis");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
