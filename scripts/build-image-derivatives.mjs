#!/usr/bin/env node
/**
 * Responsive derivatives for the visual program.
 *
 * The listing face renders a 72px tile; before this, it downloaded a 2048px,
 * 1.3 MB JPEG to do it. Each source now gets 96 / 192 / 384 / 768 wide WebP
 * derivatives, and the component picks with srcset/sizes.
 *
 * Artwork (logos, brand composites) keeps its own aspect ratio and is
 * letterboxed by CSS; photography is cropped to fill by CSS. Neither is
 * re-cropped here, so nothing is silently mis-framed at build time.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, basename, extname } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const manifestPath = join(root, "src/data/visual-program.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

const WIDTHS = [96, 192, 384, 768];
const outDir = join(root, "public/visuals/r");
mkdirSync(outDir, { recursive: true });

let made = 0;
let savedBytes = 0;

for (const img of manifest.images) {
  const srcRel = img.src.replace(/^\//, "");
  const srcPath = join(root, "public", srcRel.replace(/^visuals\//, "visuals/"));
  const abs = existsSync(srcPath) ? srcPath : join(root, "public", srcRel);
  if (!existsSync(abs)) {
    console.warn("missing source:", img.src);
    continue;
  }
  const stem = basename(abs, extname(abs));
  const originalSize = statSync(abs).size;

  // Intrinsic size, so the component can reserve the right box and avoid CLS.
  const id = execFileSync("identify", ["-format", "%w %h", `${abs}[0]`])
    .toString()
    .trim()
    .split(" ");
  const w = Number(id[0]);
  const h = Number(id[1]);
  img.width = w;
  img.height = h;

  const sources = [];
  for (const target of WIDTHS) {
    if (target > w * 1.5) continue; // never upscale beyond a sane point
    const out = join(outDir, `${stem}-${target}.webp`);
    execFileSync("convert", [
      `${abs}[0]`,
      "-resize",
      `${target}x>`,
      "-strip",
      "-quality",
      "82",
      "-define",
      "webp:method=6",
      out,
    ]);
    sources.push({
      w: target,
      src: `/visuals/r/${stem}-${target}.webp`,
      bytes: statSync(out).size,
    });
    made++;
  }
  img.sources = sources;
  const largest = sources.at(-1);
  if (largest) savedBytes += originalSize - largest.bytes;
}

manifest.derivativesAt = new Date().toISOString();
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`${made} derivatives written to public/visuals/r`);
console.log(`largest-derivative saving vs originals: ${(savedBytes / 1024 / 1024).toFixed(2)} MB`);
