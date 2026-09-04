#!/usr/bin/env node
/**
 * Smart refresh runner for existing restaurants.
 *
 * Builds the normal refresh queue, then applies retry cooldowns so the same
 * failed/no-website records do not monopolize every hygiene batch. Selected
 * slugs are passed explicitly to enrich.mjs.
 *
 * Usage:
 *   node scripts/pipeline/refresh-run.mjs --batch=30
 *   node scripts/pipeline/refresh-run.mjs --batch=30 --per-city=4
 *   node scripts/pipeline/refresh-run.mjs --plan
 *   node scripts/pipeline/refresh-run.mjs --force
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { PATHS, readJson, writeJson } from "./lib.mjs";
import { buildRefreshQueue } from "./refresh.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);
const BATCH = Math.max(1, Number(args.batch ?? 30));
const PER_CITY = Math.max(1, Number(args["per-city"] ?? 4));
const FORCE = Boolean(args.force);
const PLAN_ONLY = Boolean(args.plan);
const SUCCESS = new Set(["resolved", "partial"]);
const DAY = 86_400_000;

const dataset = readJson(PATHS.dataset, { records: [] });
const store = readJson(PATHS.enrichment, { records: {} });
const runLog = readJson(PATHS.runLog, { runs: [] });
const queue = buildRefreshQueue({ dataset, store, runLog });

const history = new Map();
for (const run of runLog.runs ?? []) {
  if (!/^(enrich|hygiene)-owned$/.test(String(run?.kind || ""))) continue;
  const at = run.finishedAt || run.startedAt || null;
  for (const record of run.records ?? []) {
    if (!record?.slug) continue;
    const list = history.get(record.slug) ?? [];
    list.push({ at, status: String(record.matchStatus || "unknown") });
    history.set(record.slug, list);
  }
}

function attemptInfo(slug) {
  const rows = history.get(slug) ?? [];
  if (!rows.length) return { last: null, streak: 0 };
  let streak = 0;
  for (const row of rows) {
    if (SUCCESS.has(row.status)) break;
    streak += 1;
  }
  return { last: rows[0], streak };
}

function cooldownDays(item, attempt) {
  if (!attempt.last?.at) return 0;
  const status = attempt.last.status || item.matchStatus;
  if (status === "no-website" || status === "source-limited") return 30;
  if (status === "site-failure") {
    const steps = [0, 2, 4, 7, 14, 30];
    return steps[Math.min(attempt.streak, steps.length - 1)];
  }
  if (status === "empty" || status === "unresolved" || status === "deferred" || status === "error") return 7;
  if (SUCCESS.has(status) && item.reasons.some((r) => r.startsWith("thin-") || r.startsWith("review-"))) return 7;
  return 1;
}

function eligible(item) {
  if (FORCE) return { yes: true, eligibleAt: null, cooldown: 0, attempt: attemptInfo(item.slug) };
  const attempt = attemptInfo(item.slug);
  const cooldown = cooldownDays(item, attempt);
  if (!attempt.last?.at || cooldown <= 0) return { yes: true, eligibleAt: null, cooldown, attempt };
  const at = Date.parse(attempt.last.at);
  if (Number.isNaN(at)) return { yes: true, eligibleAt: null, cooldown, attempt };
  const eligibleAt = new Date(at + cooldown * DAY).toISOString();
  return { yes: Date.now() >= at + cooldown * DAY, eligibleAt, cooldown, attempt };
}

const candidates = queue.items
  .filter((item) => item.priority > 0)
  .map((item) => ({ item, gate: eligible(item) }))
  .filter(({ gate }) => gate.yes);

const selected = [];
const perCity = new Map();
for (const row of candidates) {
  if (selected.length >= BATCH) break;
  const key = `${row.item.city || "unknown"}|${row.item.stateProvince || ""}`;
  const used = perCity.get(key) ?? 0;
  if (used >= PER_CITY) continue;
  selected.push(row);
  perCity.set(key, used + 1);
}
// If diversity caps left room, fill the remainder by priority.
if (selected.length < BATCH) {
  const have = new Set(selected.map((r) => r.item.slug));
  for (const row of candidates) {
    if (selected.length >= BATCH) break;
    if (have.has(row.item.slug)) continue;
    selected.push(row);
    have.add(row.item.slug);
  }
}

const held = queue.items
  .filter((item) => item.priority > 0)
  .map((item) => ({ item, gate: eligible(item) }))
  .filter(({ gate }) => !gate.yes);

console.log(`Refresh queue: ${queue.totals.dueNow} due; ${candidates.length} eligible now; ${held.length} cooling down.`);
console.log(`Selected ${selected.length} (batch ${BATCH}, max ${PER_CITY} per city before fill):`);
for (const [i, row] of selected.entries()) {
  console.log(`  ${String(i + 1).padStart(2)}. ${row.item.slug}  ${row.item.reasons.join(", ")}`);
}
if (held.length) {
  console.log("\nCooling down instead of retrying immediately:");
  for (const row of held.slice(0, 10)) {
    console.log(`  - ${row.item.slug} until ${row.gate.eligibleAt} (${row.gate.attempt.streak} failure attempts)`);
  }
}

writeJson(path.join(process.cwd(), "reports/refresh-plan-latest.json"), {
  generatedAt: new Date().toISOString(),
  selected: selected.map(({ item }) => item),
  coolingDown: held.map(({ item, gate }) => ({ ...item, eligibleAt: gate.eligibleAt, cooldownDays: gate.cooldown })),
});

if (PLAN_ONLY || !selected.length) process.exit(0);

const slugs = selected.map((row) => row.item.slug).join(",");
const result = spawnSync(process.execPath, ["scripts/pipeline/enrich.mjs", `--slugs=${slugs}`], {
  stdio: "inherit",
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

spawnSync(process.execPath, ["scripts/pipeline/refresh.mjs", "--print=15"], { stdio: "inherit" });
