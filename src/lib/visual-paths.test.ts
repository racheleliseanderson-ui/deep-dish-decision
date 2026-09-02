import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import visualProgram from "@/data/visual-program.json";

/**
 * The full-size originals moved out of public/ — 6.7 MB that shipped in every
 * deploy and was served to nobody, because every tile renders from a
 * derivative. Moving them created one hazard worth pinning: a path in the
 * manifest that no longer resolves.
 *
 * VisualTile falls back to `src` when an image has no `sources`, so a stale
 * `src` is a broken image that appears only for whichever image is added next
 * without derivatives. That is exactly the kind of thing that ships.
 */

const ROOT = resolve(process.cwd());

type ManifestImage = {
  src: string;
  original?: string;
  sources?: Array<{ w: number; src: string; bytes: number }>;
};
const images = (visualProgram as { images: ManifestImage[] }).images;

describe("every path the browser can request is actually served", () => {
  it("resolves each image's src under public/", () => {
    const missing = images
      .map((img) => img.src)
      .filter((src) => !existsSync(resolve(ROOT, "public", src.replace(/^\//, ""))));
    expect(missing).toEqual([]);
  });

  it("resolves every responsive source under public/", () => {
    const missing: string[] = [];
    for (const img of images) {
      for (const s of img.sources ?? []) {
        if (!existsSync(resolve(ROOT, "public", s.src.replace(/^\//, "")))) missing.push(s.src);
      }
    }
    expect(missing).toEqual([]);
  });

  it("keeps the originals out of public/, where they would be deployed", () => {
    const leaked = images
      .map((img) => img.original ?? "")
      .filter(Boolean)
      .filter((p) => existsSync(resolve(ROOT, "public", p.replace(/^\//, ""))));
    expect(leaked).toEqual([]);
  });

  it("still keeps the originals somewhere, so derivatives can be rebuilt", () => {
    const gone = images
      .map((img) => img.original ?? "")
      .filter(Boolean)
      .filter((p) => !existsSync(resolve(ROOT, p.replace(/^\//, ""))));
    expect(gone).toEqual([]);
  });
});
