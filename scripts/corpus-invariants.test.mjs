import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const script = resolve(root, "scripts/corpus-invariants.mjs");

describe("corpus-invariants script", () => {
  it("passes on the recovered hub", () => {
    const r = spawnSync(process.execPath, [script], { encoding: "utf8", cwd: root });
    assert.equal(r.status, 0, r.stderr || r.stdout);
    const json = JSON.parse(r.stdout);
    assert.equal(json.ok, true);
    assert.ok(json.count >= 800);
  });
});
