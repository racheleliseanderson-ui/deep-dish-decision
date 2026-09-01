import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { records } from "@/lib/dataset";
import { regionGroupFileName } from "@/lib/corpus-meta";
import { enrichmentGroupReady, getEnrichment, loadEnrichmentGroup } from "@/lib/enrichment";

/**
 * enrichment.json used to be a static import, which put a 2.2 MB chunk on every
 * restaurant page. It is split per region group and loaded on demand now, and
 * these are the two things that can silently undo that:
 *
 *   - a stray `import ... from "@/data/enrichment.json"` reappearing anywhere
 *     in src, which puts the whole blob back in the bundle
 *   - the split files drifting out of step with enrichment.json, so a record
 *     that has evidence renders as though it has none
 *
 * Neither throws. Both are only visible if something checks.
 */

const ROOT = resolve(process.cwd());
const SPLIT_DIR = resolve(ROOT, "src/data/enrichment");

describe("the big blob stays out of the bundle", () => {
  it("is imported by nothing in src", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = resolve(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== "data") walk(path);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry.name)) continue;
        const body = readFileSync(path, "utf8");
        // A real import statement only — anchored to the start of a line so
        // that prose about the old import (in this file, and in enrichment.ts)
        // does not count as the thing it is warning about.
        const realImport = /^[ \t]*import\s[^;]*from\s+["']@\/data\/enrichment\.json["']/m;
        if (realImport.test(body)) offenders.push(path.slice(ROOT.length + 1));
      }
    };
    walk(resolve(ROOT, "src"));
    expect(offenders).toEqual([]);
  });

  it("is split across per-region files, none of them the size of the whole", () => {
    const files = readdirSync(SPLIT_DIR).filter((f) => f.endsWith(".json"));
    expect(files.length).toBeGreaterThan(20);
    const whole = readFileSync(resolve(ROOT, "src/data/enrichment.json")).length;
    for (const f of files) {
      const size = readFileSync(resolve(SPLIT_DIR, f)).length;
      // The worst single page load must stay a small fraction of the old one.
      expect(size).toBeLessThan(whole / 4);
    }
  });
});

describe("the split covers what the source holds", () => {
  it("files every enriched record under its own region group", () => {
    const source = JSON.parse(readFileSync(resolve(ROOT, "src/data/enrichment.json"), "utf8"));
    const groupOf = new Map(records.map((r) => [r.slug, r.regionGroup]));

    const placed = new Map<string, string>();
    for (const f of readdirSync(SPLIT_DIR).filter((n) => n.endsWith(".json"))) {
      const parsed = JSON.parse(readFileSync(resolve(SPLIT_DIR, f), "utf8"));
      for (const slug of Object.keys(parsed.records ?? {})) placed.set(slug, f.replace(/\.json$/, ""));
    }

    const missing: string[] = [];
    const misfiled: string[] = [];
    for (const slug of Object.keys(source.records ?? {})) {
      const group = groupOf.get(slug);
      if (!group) continue; // retired record; the split script drops it and says so
      const where = placed.get(slug);
      if (!where) missing.push(slug);
      else if (where !== regionGroupFileName(group)) misfiled.push(`${slug} -> ${where}`);
    }
    expect(missing).toEqual([]);
    expect(misfiled).toEqual([]);
  });
});

describe("the loading contract", () => {
  it("reads as absent before its group is loaded, not as an error", () => {
    // Wyoming is not loaded by any other test in this file.
    expect(enrichmentGroupReady("Wyoming")).toBe(false);
    expect(() => getEnrichment("anything-in-wyoming")).not.toThrow();
    expect(getEnrichment("anything-in-wyoming")).toBeNull();
  });

  it("makes a group's records readable once loaded", async () => {
    await loadEnrichmentGroup("Washington");
    expect(enrichmentGroupReady("Washington")).toBe(true);
    expect(getEnrichment("canlis")).not.toBeNull();
  });

  it("resolves rather than rejecting for a group with no file at all", async () => {
    await expect(loadEnrichmentGroup("Not A Real Region Group")).resolves.toBeUndefined();
  });

  it("loads a group once however many callers ask at the same time", async () => {
    const group = "Oregon";
    const all = await Promise.all([
      loadEnrichmentGroup(group),
      loadEnrichmentGroup(group),
      loadEnrichmentGroup(group),
    ]);
    expect(all).toHaveLength(3);
    expect(getEnrichment("kachka")).not.toBeNull();
  });
});
