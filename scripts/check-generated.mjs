#!/usr/bin/env node
/**
 * Two directories in this repo are generated, and both went missing from main
 * once already. When they are absent nothing throws: `import.meta.glob` simply
 * matches nothing, `loadLiveGroup` returns `{}`, and every distance, opening
 * time, spend line and map marker quietly disappears. The site builds green and
 * ships an instrument with its dynamic layer switched off. That is the worst
 * possible failure mode, so it gets a guard.
 *
 * The two are not symmetrical:
 *
 *   src/data/live/    pure Node, offline, deterministic. If it is missing we
 *                     can just build it, so we do.
 *   src/data/enrichment/  same — a split of enrichment.json. If it is missing,
 *                     every restaurant page silently loses its evidence panel,
 *                     and the old 2.9 MB blob is not there to fall back on.
 *   public/visuals/r/ needs ImageMagick, which is not on the deploy machine.
 *                     It cannot be rebuilt here, so its absence is a hard stop
 *                     and the fix is to commit the files.
 *
 * Runs as `prebuild`, so a deploy from a fresh clone either self-heals or
 * refuses — never silently degrades.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const liveDir = join(root, "src/data/live");
const enrichmentDir = join(root, "src/data/enrichment");
const visualDir = join(root, "public/visuals/r");
const count = (d) => (existsSync(d) ? readdirSync(d).filter((f) => !f.startsWith(".")).length : 0);

let live = count(liveDir);
if (live === 0) {
  console.warn("live index missing — rebuilding it (offline, deterministic)");
  execFileSync(process.execPath, [join(root, "scripts/pipeline/build-live-index.mjs")], {
    stdio: "inherit",
  });
  live = count(liveDir);
}
if (live === 0) {
  console.error("live index is still empty after a rebuild. The dynamic layer would be dark.");
  process.exit(1);
}

let enriched = count(enrichmentDir);
if (enriched === 0) {
  console.warn("enrichment split missing — rebuilding it (offline, deterministic)");
  execFileSync(process.execPath, [join(root, "scripts/pipeline/split-enrichment.mjs")], {
    stdio: "inherit",
  });
  enriched = count(enrichmentDir);
}
if (enriched === 0) {
  console.error("enrichment split is still empty. Every evidence panel would be blank.");
  process.exit(1);
}

const visuals = count(visualDir);
if (visuals === 0) {
  const manifest = JSON.parse(readFileSync(join(root, "src/data/visual-program.json"), "utf8"));
  console.error(
    [
      "public/visuals/r/ is empty, so every image would be served at full size.",
      `The manifest lists ${manifest.images.length} sources needing derivatives.`,
      "",
      "These cannot be rebuilt here: scripts/build-image-derivatives.mjs shells out to",
      "ImageMagick (identify / convert), which is not installed on the deploy machine.",
      "Generate them where ImageMagick exists and commit the result:",
      "",
      "  node scripts/build-image-derivatives.mjs",
      "  git add public/visuals/r src/data/visual-program.json",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

console.log(
  `generated assets ok — live index ${live} regions, enrichment ${enriched} regions, ${visuals} image derivatives`,
);
