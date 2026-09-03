#!/usr/bin/env node
/**
 * Run every test segment, then report.
 *
 * The `test` script used to be a chain joined by `&&`, which stops at the first
 * failure. That is not a small thing: in the Kitchen & Bar repo a red first
 * segment hid a real shipped bug behind eleven stale assertions for weeks.
 * The segments here are independent, so they all run and the exit code is the
 * aggregate. corpus-invariants is deliberately last: it is the gate on 1,527
 * published records and its output is what you want at the bottom of the log.
 */
import { spawnSync } from "node:child_process";

const SEGMENTS = [
  ["vendored parity", process.execPath, ["scripts/check-vendored-parity.mjs"]],
  ["generated files are current", process.execPath, ["scripts/check-generated.mjs"]],
  ["unit tests", "npx", ["vitest", "run"]],
  [
    "corpus and pipeline",
    process.execPath,
    [
      "--test",
      "scripts/corpus-invariants.test.mjs",
      "scripts/pipeline/level-records.test.mjs",
      "scripts/pipeline/parse-hours.test.mjs",
      "scripts/pipeline/resolve-targets.test.mjs",
    ],
  ],
  ["handoff contract", process.execPath, ["--experimental-strip-types", "--test", "tests/salty-handoff.test.ts"]],
  ["corpus invariants", process.execPath, ["scripts/corpus-invariants.mjs"]],
];

const failed = [];
for (const [name, bin, args] of SEGMENTS) {
  process.stdout.write(`\n=== ${name} ===\n`);
  const result = spawnSync(bin, args, { stdio: "inherit", shell: bin !== process.execPath });
  const code = result.status === null ? 1 : result.status;
  if (code !== 0) failed.push({ name, code });
}

process.stdout.write("\n=== summary ===\n");
for (const [name] of SEGMENTS) {
  const bad = failed.find((f) => f.name === name);
  process.stdout.write(`${bad ? "FAIL" : "ok  "}  ${name}${bad ? ` (exit ${bad.code})` : ""}\n`);
}
if (failed.length > 0) {
  process.stdout.write(`\n${failed.length} of ${SEGMENTS.length} segments failed.\n`);
  process.exit(1);
}
process.stdout.write(`\nAll ${SEGMENTS.length} segments passed.\n`);
