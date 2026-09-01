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
