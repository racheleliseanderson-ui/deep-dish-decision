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
  // Originals live in assets-src/, outside public/, so they are never deployed.
  // 6.7 MB of them were being copied into every build and served to nobody:
  // the tiles all render from public/visuals/r/, and the originals existed
  // only as inputs to this script.
  const abs = join(root, "assets-src/visuals", basename(img.original ?? img.src));
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
  // `src` must be something the browser can actually fetch. It is the
  // last-resort fallback in VisualTile, and pointing it at an original that no
  // longer ships would be a 404 waiting for the first image without sources.
  img.original = `/assets-src/visuals/${basename(abs)}`;
  const biggest = sources.at(-1);
  if (biggest) img.src = biggest.src;
  const largest = sources.at(-1);
  if (largest) savedBytes += originalSize - largest.bytes;
}

manifest.derivativesAt = new Date().toISOString();
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`${made} derivatives written to public/visuals/r (originals stay in assets-src/, undeployed)`);
console.log(`largest-derivative saving vs originals: ${(savedBytes / 1024 / 1024).toFixed(2)} MB`);

/* ── full-bleed art ────────────────────────────────────────────────────────
 * The hero is not part of the visual program — it is a backdrop, not evidence
 * about a restaurant — so it never went through the loop above. It was a plain
 * <img> with no srcset and fetchPriority="high", which meant every phone
 * downloaded the full 1800px JPEG to fill a 390px screen: 237 KB, above the
 * fold, ahead of everything else. It was larger than all 29 restaurant tiles
 * put together.
 *
 * It is also a backdrop under a heavy dark gradient with text over it, so it
 * can carry a lower quality than a photograph the reader is meant to study.
 */
// The original is in assets-src/ with the rest, so it is neither deployed nor
// bundled. There is no JPEG fallback: every restaurant tile is already
// WebP-only, so one for the hero would protect a browser the rest of the page
// has already lost.
const FULL_BLEED = [{ file: "hero-pass.jpg", widths: [480, 768, 1200, 1800], quality: 68 }];

for (const art of FULL_BLEED) {
  const src = join(root, "assets-src", art.file);
  if (!existsSync(src)) {
    console.warn("missing full-bleed source:", art.file);
    continue;
  }
  const stem = basename(src, extname(src));
  const [w] = execFileSync("identify", ["-format", "%w %h", `${src}[0]`]).toString().trim().split(" ");
  const originalBytes = statSync(src).size;
  let made = [];
  for (const target of art.widths) {
    if (target > Number(w)) continue;
    const out = join(root, "src/assets", `${stem}-${target}.webp`);  // imported, so Vite hashes it
    execFileSync("convert", [
      `${src}[0]`,
      "-resize", `${target}x>`,
      "-strip",
      "-quality", String(art.quality),
      "-define", "webp:method=6",
      out,
    ]);
    made.push({ w: target, bytes: statSync(out).size });
  }
  console.log(`\n${art.file} -> ${made.length} widths (full-bleed, srcset in the route)`);
  console.log(`  original      ${(originalBytes / 1024).toFixed(0)} KB (what every device used to fetch)`);
  for (const m of made) console.log(`  ${String(m.w).padStart(5)}w        ${(m.bytes / 1024).toFixed(0)} KB`);
}
