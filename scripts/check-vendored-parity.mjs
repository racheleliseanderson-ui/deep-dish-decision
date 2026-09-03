#!/usr/bin/env node
/**
 * Vendored parity gate.
 *
 * Four independently-deployed Salty & Clever repos hand-vendor the same
 * handoff files. Nothing but this script stops them drifting apart, and
 * salty-night-record.ts had already drifted into four different versions
 * before it was put back.
 *
 * Run it:
 *   node scripts/check-vendored-parity.mjs            verify (exit 1 on drift)
 *   node scripts/check-vendored-parity.mjs --update   re-record after a
 *                                                     deliberate change
 *
 * Plain Node, zero dependencies, no install step. It must run on a bare
 * `node` in CI.
 *
 * Line endings are normalised to LF before hashing, so a CRLF working tree
 * never fails this check. Only real content drift does.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RECORD = join(ROOT, "vendored-parity.json");

/**
 * The vendored set. These files must be byte-identical (modulo line endings)
 * in all four repos: salty-command-center, salty-kitchen-bar-intelligence,
 * occasion-planner-suite, deep-dish-decision.
 *
 * src/lib/salty-handoff/apply.ts is DELIBERATELY NOT LISTED. Only its shared
 * helpers are common; the rest of apply.ts is app-specific by design, because
 * applying a packet means writing into that one app's own state. It legitimately
 * differs in every repo. Do not add it to this manifest.
 */
const MANIFEST = [
  "src/lib/salty-handoff/contract.ts",
  "src/lib/salty-handoff/codec.ts",
  "src/lib/salty-night-record.ts",
];

/** LF-normalised SHA-256 of a file's content. Strips a UTF-8 BOM if present. */
function hashFile(relPath) {
  const abs = join(ROOT, relPath);
  if (!existsSync(abs)) return null;
  let text = readFileSync(abs, "utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const normalised = text.replace(/\r\n?/g, "\n");
  return createHash("sha256").update(normalised, "utf8").digest("hex");
}

function computeAll() {
  const files = {};
  for (const rel of MANIFEST) files[rel] = hashFile(rel);
  return files;
}

function serialise(files) {
  return (
    JSON.stringify(
      {
        $comment:
          "Checksums of the hand-vendored handoff files. SHA-256 over the file content with line endings normalised to LF. This file is itself vendored: it must be identical in all four Salty & Clever repos. Regenerate with: node scripts/check-vendored-parity.mjs --update",
        algorithm: "sha256",
        normalisation: "lf",
        files,
      },
      null,
      2,
    ) + "\n"
  );
}

const update = process.argv.includes("--update");
const current = computeAll();

const missing = MANIFEST.filter((rel) => current[rel] === null);
if (missing.length > 0) {
  console.error("vendored parity: FAIL — vendored file(s) missing from this repo:");
  for (const rel of missing) console.error("  missing  " + rel);
  process.exit(1);
}

if (update) {
  writeFileSync(RECORD, serialise(current), "utf8");
  console.log(
    "vendored parity: recorded " + MANIFEST.length + " checksum(s) in vendored-parity.json",
  );
  for (const rel of MANIFEST) console.log("  " + current[rel] + "  " + rel);
  console.log("Now copy the changed file(s) AND vendored-parity.json to the other three repos.");
  process.exit(0);
}

if (!existsSync(RECORD)) {
  console.error("vendored parity: FAIL — vendored-parity.json is missing.");
  console.error(
    "If this is the first run, create it with: node scripts/check-vendored-parity.mjs --update",
  );
  process.exit(1);
}

let recorded;
try {
  recorded = JSON.parse(readFileSync(RECORD, "utf8"));
} catch (err) {
  console.error("vendored parity: FAIL — vendored-parity.json is not valid JSON: " + err.message);
  process.exit(1);
}

const expected = (recorded && recorded.files) || {};
const problems = [];

for (const rel of MANIFEST) {
  const want = expected[rel];
  const got = current[rel];
  if (!want) {
    problems.push({ rel, kind: "unrecorded", want: "(not recorded)", got });
  } else if (want !== got) {
    problems.push({ rel, kind: "drift", want, got });
  }
}

for (const rel of Object.keys(expected)) {
  if (!MANIFEST.includes(rel)) {
    problems.push({ rel, kind: "stale", want: expected[rel], got: "(not in manifest)" });
  }
}

if (problems.length === 0) {
  console.log(
    "vendored parity: OK — " + MANIFEST.length + " vendored file(s) match vendored-parity.json",
  );
  for (const rel of MANIFEST) console.log("  ok  " + current[rel].slice(0, 16) + "  " + rel);
  process.exit(0);
}

console.error("vendored parity: FAIL — " + problems.length + " problem(s)");
console.error("");
for (const p of problems) {
  if (p.kind === "drift") {
    console.error("  DRIFT      " + p.rel);
    console.error("    recorded " + p.want);
    console.error("    actual   " + p.got);
  } else if (p.kind === "unrecorded") {
    console.error(
      "  UNRECORDED " + p.rel + " is vendored but has no checksum in vendored-parity.json",
    );
    console.error("    actual   " + p.got);
  } else {
    console.error("  STALE      " + p.rel + " is recorded but is no longer in the manifest");
  }
  console.error("");
}
console.error("A vendored file changed. Either the change was accidental — restore it from");
console.error("another repo — or it was deliberate, in which case copy the file to all four");
console.error("repos and run `node scripts/check-vendored-parity.mjs --update` in each.");
console.error("See VENDORED.md.");
process.exit(1);
