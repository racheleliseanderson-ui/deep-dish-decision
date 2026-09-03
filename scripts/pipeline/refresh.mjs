/**
 * Build the stale-by-tier refresh / hygiene queue.
 *
 * Priority (highest first):
 *   1. never enriched
 *   2. current owned-site scrape / match failures
 *   3. source-limited records with an operator platform but no owned domain
 *   4. completeness under 70%
 *   5. first-party review overdue / due soon
 *   6. enrichment age past tier windows (A 30d / B 90d / C 120d)
 *
 * Usage:
 *   node scripts/pipeline/refresh.mjs              # write queue only
 *   node scripts/pipeline/refresh.mjs --print=20   # also print top N
 *
 * Does not call any external API.
 */
import { PATHS, completeness, readJson, writeJson } from "./lib.mjs";
import path from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);

/** Days since ISO timestamp; Infinity if missing. */
export function ageDays(iso, now = Date.now()) {
  if (!iso) return Infinity;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return Infinity;
  return Math.floor((now - t) / 86_400_000);
}

export const TIERS = {
  A: {
    id: "A",
    label: "Volatile (hours / price / booking)",
    days: 30,
    fields: ["hours", "priceBand", "rating", "reservable"],
  },
  B: {
    id: "B",
    label: "Identity (address / phone / site / access flags)",
    days: 90,
    fields: ["address", "phone", "website", "accessibility"],
  },
  C: {
    id: "C",
    label: "Policy scrape (menu / dietary / group / dress)",
    days: 120,
    fields: ["site", "summary"],
  },
};

const HYGIENE_MATCH_STATUSES = new Set([
  "site-failure",
  "no-website",
  "empty",
  "unresolved",
  "deferred",
  "error",
]);
const SOURCE_LIMITED_MATCH_STATUS = "source-limited";

/**
 * Collect the latest owned-site failure state per slug from the run log.
 *
 * Runs are newest-first. The first owned enrichment observation for a slug is
 * authoritative: a later success clears an older 408/429/5xx instead of letting
 * historical failure notes leak back into the current hygiene queue.
 */
export function siteFailureMap(runLog) {
  const map = new Map();
  const seen = new Set();
  for (const run of runLog?.runs ?? []) {
    if (!/^(enrich|hygiene)-owned$/.test(String(run?.kind || ""))) continue;
    for (const r of run.records ?? []) {
      if (!r?.slug || seen.has(r.slug)) continue;
      seen.add(r.slug);
      const notes = (r.notes ?? []).map(String);
      const fail = notes.filter((n) => /site\s*(408|425|429|5\d\d)|408|429|500/i.test(n));
      if (fail.length) map.set(r.slug, fail);
    }
  }
  return map;
}

/**
 * Score one record for refresh priority. Higher = sooner.
 * Hygiene candidates always outrank pure calendar staleness.
 */
export function scoreRefreshItem({ record, entry, score, siteFails, now = Date.now() }) {
  const reasons = [];
  let priority = 0;
  const meta = entry?.meta ?? {};
  const last = meta.lastEnrichedAt ?? null;
  const age = ageDays(last, now);
  const matchStatus = meta.matchStatus ?? (entry ? "unknown" : "none");

  // 1. Never enriched / current owned-site match state requiring attention.
  if (!entry || matchStatus === "none") {
    priority += 1000;
    reasons.push("never-enriched");
  } else if (HYGIENE_MATCH_STATUSES.has(matchStatus)) {
    priority += 900;
    reasons.push(`match-${matchStatus}`);
  } else if (matchStatus === SOURCE_LIMITED_MATCH_STATUS) {
    // A current operator-controlled platform source exists, but there is no
    // owned domain to scrape. Keep it in hygiene, below actual transport/match
    // failures, without hammering a non-existent website on every batch.
    priority += 250;
    reasons.push("source-limited");
  }

  // 2. Current run-log site scrape failures. Avoid double-prioritizing when
  // meta.matchStatus already carries the same site-failure state; retain the
  // detailed reason text for diagnosis either way.
  if (siteFails?.length) {
    if (matchStatus !== "site-failure") priority += 500;
    reasons.push(`site-failure:${siteFails.join(",")}`);
  }

  // 3. Thin completeness
  if (entry && typeof score === "number" && score < 70) {
    priority += 400 + (70 - score);
    reasons.push(`thin-${score}`);
  }

  // 4. First-party review window
  const rs = record.reviewStatus ?? "";
  if (rs === "overdue" || (record.reviewDueSoon === true && rs === "overdue")) {
    priority += 320;
    reasons.push("review-overdue");
  } else if (rs === "due_soon" || record.reviewDueSoon === true) {
    priority += 220;
    reasons.push("review-due-soon");
  } else if (rs === "listing_only" && !entry) {
    // listing shells already counted as never-enriched; no extra hygiene flag alone
    priority += 20;
    reasons.push("listing-only");
  }

  // 5. Calendar staleness by tier (only when enriched)
  let staleTier = null;
  if (entry && last) {
    if (age >= TIERS.A.days) {
      priority += 100 + Math.min(age, 365);
      reasons.push(`stale-A-${age}d`);
      staleTier = "A";
    }
    if (age >= TIERS.B.days) {
      priority += 40;
      reasons.push(`stale-B-${age}d`);
      staleTier = "B";
    }
    if (age >= TIERS.C.days) {
      priority += 20;
      reasons.push(`stale-C-${age}d`);
      staleTier = "C";
    }
  } else if (!entry) {
    staleTier = "A"; // treat missing enrichment as immediately due for tier A work
  }

  // Hygiene flag: anything that should run before geographic expansion
  const hygiene = reasons.some((r) =>
    /^(never-enriched|match-|source-limited|site-failure|thin-|review-overdue|review-due-soon)/.test(
      r,
    ),
  );

  return {
    slug: record.slug,
    title: record.title,
    city: record.city ?? null,
    stateProvince: record.stateProvince ?? null,
    priority,
    reasons,
    hygiene,
    staleTier,
    ageDays: Number.isFinite(age) ? age : null,
    completeness: entry ? score : 0,
    matchStatus,
    lastEnrichedAt: last,
    reviewStatus: rs || null,
    nextReviewAt: record.nextReviewAt ?? null,
    reviewedAt: record.reviewedAt ?? null,
    siteFailures: siteFails ?? [],
  };
}

export function buildRefreshQueue({ dataset, store, runLog, now = Date.now() } = {}) {
  const ds = dataset ?? readJson(PATHS.dataset, { records: [] });
  const enrichment = store ?? readJson(PATHS.enrichment, { records: {} });
  const log = runLog ?? readJson(PATHS.runLog, { runs: [] });
  const fails = siteFailureMap(log);

  const items = [];
  for (const record of ds.records ?? []) {
    const entry = enrichment.records?.[record.slug] ?? null;
    const score = entry ? completeness(record, entry).score : 0;
    items.push(
      scoreRefreshItem({
        record,
        entry,
        score,
        siteFails: fails.get(record.slug) ?? [],
        now,
      }),
    );
  }

  items.sort(
    (a, b) =>
      b.priority - a.priority || a.completeness - b.completeness || a.slug.localeCompare(b.slug),
  );

  const hygiene = items.filter((i) => i.hygiene);
  const staleA = items.filter(
    (i) => i.staleTier === "A" || (i.ageDays != null && i.ageDays >= TIERS.A.days),
  );
  const staleB = items.filter((i) => i.ageDays != null && i.ageDays >= TIERS.B.days);
  const staleC = items.filter((i) => i.ageDays != null && i.ageDays >= TIERS.C.days);
  const neverEnriched = items.filter((i) => i.reasons.includes("never-enriched"));
  const thin = items.filter((i) => i.reasons.some((r) => r.startsWith("thin-")));
  const siteFail = items.filter((i) => i.reasons.some((r) => r.startsWith("site-failure")));
  const sourceLimited = items.filter((i) => i.reasons.includes("source-limited"));
  const reviewDue = items.filter((i) =>
    i.reasons.some((r) => r === "review-overdue" || r === "review-due-soon"),
  );

  return {
    generatedAt: new Date(now).toISOString(),
    settings: {
      tiers: {
        A: TIERS.A.days,
        B: TIERS.B.days,
        C: TIERS.C.days,
      },
      thinThreshold: 70,
      // refresh competes with discovery under the expansion daily cap
      preferRefreshOverDiscover: true,
      hygieneBatchSize: 25,
    },
    totals: {
      records: items.length,
      hygiene: hygiene.length,
      neverEnriched: neverEnriched.length,
      thin: thin.length,
      siteFailures: siteFail.length,
      sourceLimited: sourceLimited.length,
      reviewDue: reviewDue.length,
      staleA: staleA.length,
      staleB: staleB.length,
      staleC: staleC.length,
      dueNow: items.filter((i) => i.priority > 0).length,
    },
    // Ordered work list — hygiene first (already sorted by priority)
    hygiene: hygiene.map((i) => i.slug),
    stale: items.filter((i) => i.staleTier).map((i) => i.slug),
    items,
  };
}

// CLI entry — always runs when this file is executed directly.
const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith("/refresh.mjs") || process.argv[1].endsWith("\\refresh.mjs"));

if (isMain) {
  const queue = buildRefreshQueue();
  writeJson(path.join(process.cwd(), "src/data/refresh-queue.json"), queue);
  const printN = Number(args.print ?? 15);
  console.log(
    [
      `refresh queue written  src/data/refresh-queue.json`,
      `records               ${queue.totals.records}`,
      `hygiene due           ${queue.totals.hygiene}`,
      `  never enriched      ${queue.totals.neverEnriched}`,
      `  thin <70%           ${queue.totals.thin}`,
      `  site failures       ${queue.totals.siteFailures}`,
      `  source limited      ${queue.totals.sourceLimited}`,
      `  review due          ${queue.totals.reviewDue}`,
      `stale A (≥${queue.settings.tiers.A}d)      ${queue.totals.staleA}`,
      `stale B (≥${queue.settings.tiers.B}d)      ${queue.totals.staleB}`,
      `stale C (≥${queue.settings.tiers.C}d)     ${queue.totals.staleC}`,
      `hygiene batch size    ${queue.settings.hygieneBatchSize}`,
      ``,
      `top ${printN}:`,
      ...queue.items
        .slice(0, printN)
        .map(
          (i, n) =>
            `  ${String(n + 1).padStart(2)}. ${i.slug.padStart(0).padEnd(36)} p=${i.priority} c=${i.completeness}%  ${i.reasons.join(", ")}`,
        ),
    ].join("\n"),
  );
}
