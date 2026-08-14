/**
 * Shared pipeline utilities: rate limiting, normalization,
 * completeness scoring, snapshots and run logging.
 *
 * Google Places and Firecrawl clients have been removed. Enrichment is
 * owned-site only (scripts/pipeline/own-fetch.mjs + enrich.mjs).
 * Nothing here invents evidence.
 */
import fs from "node:fs";
import path from "node:path";

export const ROOT = process.cwd();
export const PATHS = {
  dataset: path.join(ROOT, "src/data/dataset.json"),
  enrichment: path.join(ROOT, "src/data/enrichment.json"),
  queue: path.join(ROOT, "src/data/expansion-queue.json"),
  refreshQueue: path.join(ROOT, "src/data/refresh-queue.json"),
  runLog: path.join(ROOT, "src/data/run-log.json"),
  snapshots: path.join(ROOT, ".pipeline-snapshots"),
};

export function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

/** Timestamped copy of every mutable file, so any batch can be reverted. */
export function snapshot(tag) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.join(PATHS.snapshots, `${stamp}-${tag}`);
  fs.mkdirSync(dir, { recursive: true });
  for (const key of ["dataset", "enrichment", "queue", "refreshQueue", "runLog"]) {
    if (fs.existsSync(PATHS[key])) {
      fs.copyFileSync(PATHS[key], path.join(dir, path.basename(PATHS[key])));
    }
  }
  return dir;
}

// ---------------------------------------------------------------- rate limits

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Retriable HTTP statuses: request timeout, rate limit, server errors. */
function isRetriableStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

/** Single in-flight request per provider, with backoff on 408/429/5xx and network throws. */
export function createLimiter({ minDelayMs = 220, maxRetries = 5 } = {}) {
  let chain = Promise.resolve();
  const stats = { calls: 0, retries: 0, failures: 0, deferred: 0 };

  async function attempt(fn) {
    for (let i = 0; i <= maxRetries; i += 1) {
      stats.calls += 1;
      let res;
      try {
        res = await fn();
      } catch (err) {
        if (i === maxRetries) {
          stats.failures += 1;
          throw err;
        }
        stats.retries += 1;
        const wait = Math.min(30_000, 2 ** i * 900) + Math.floor(Math.random() * 500);
        await sleep(wait);
        continue;
      }
      if (!res || typeof res.status !== "number" || !isRetriableStatus(res.status)) return res;
      if (i === maxRetries) {
        stats.failures += 1;
        return res;
      }
      stats.retries += 1;
      const wait = Math.min(30_000, 2 ** i * 900) + Math.floor(Math.random() * 500);
      await sleep(wait);
    }
    return null;
  }

  return {
    stats,
    run(fn) {
      const task = chain.then(async () => {
        await sleep(minDelayMs);
        return attempt(fn);
      });
      chain = task.then(
        () => undefined,
        () => undefined,
      );
      return task;
    },
  };
}

// ------------------------------------------------------------- removed clients

/** @deprecated GPI removed — owned-site enrichment only. */
export function googleClient() {
  throw new Error(
    "googleClient removed: enrichment is owned-site only. Do not call Google Places.",
  );
}

/** @deprecated Firecrawl removed — use scripts/pipeline/own-fetch.mjs. */
export function firecrawlClient() {
  throw new Error(
    "firecrawlClient removed: enrichment is owned-site only. Use own-fetch.mjs.",
  );
}

// ------------------------------------------------------------------ normalize

export const normalizePhone = (raw) => {
  if (!raw) return "";
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return digits ? `+${digits}` : "";
};

export const normalizeHost = (raw) => {
  if (!raw) return "";
  try {
    const u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    return u.host.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
};

const LEGAL = /\b(llc|inc|ltd|co|corp|restaurant|kitchen|bar|cafe|caf\u00e9)\b/g;

export const normalizeName = (raw) =>
  String(raw ?? "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[\u2018\u2019'".,!?()]/g, "")
    .replace(/\b(the|a|an)\b/g, " ")
    .replace(LEGAL, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Dice coefficient on bigrams — cheap, no dependency, good enough for names. */
export function similarity(a, b) {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const grams = (s) => {
    const out = new Map();
    for (let i = 0; i < s.length - 1; i += 1) {
      const g = s.slice(i, i + 2);
      out.set(g, (out.get(g) ?? 0) + 1);
    }
    return out;
  };
  const gx = grams(x);
  const gy = grams(y);
  let hits = 0;
  for (const [g, n] of gx) hits += Math.min(n, gy.get(g) ?? 0);
  const total = [...gx.values()].reduce((a2, b2) => a2 + b2, 0) + [...gy.values()].reduce((a2, b2) => a2 + b2, 0);
  return total ? (2 * hits) / total : 0;
}

export function metersBetween(a, b) {
  if (!a || !b) return Infinity;
  const R = 6_371_000;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ---------------------------------------------------------------- completeness

/**
 * Completeness against first-party record + owned site enrichment.
 * Google directory fields are no longer scored (GPI removed).
 */
export function completeness(record, enrichment) {
  const s = enrichment?.site;
  const stated = (v) => {
    if (v == null) return false;
    const t = String(v).trim();
    return t.length > 0 && !/^not stated$/i.test(t) && t !== "—" && t !== "-";
  };
  const checks = [
    stated(record.address),
    stated(record.phone),
    stated(record.website),
    stated(record.coverageArea) || stated(record.city),
    stated(record.cuisineContext) || !!(record.cuisineTags?.length),
    stated(record.hoursSummary),
    stated(record.priceDetails) || !!(record.priceTags?.length),
    stated(record.reservationDetails) || stated(record.reservationUrl) || !!s?.reservationUrl,
    stated(record.menuUrl) || !!s?.menuUrl || stated(record.menuSummary),
    stated(record.dietaryDetails) || !!s?.dietaryLanguage?.length,
    stated(record.accessibilityState) || !!s?.accessibilityLanguage?.length,
    stated(record.groupDetails) || !!s?.groupPolicy || !!s?.groupPolicyLanguage?.length,
    stated(record.dressCode) || !!s?.dressCode,
    stated(record.atmosphereSummary) || stated(record.serviceSummary),
    !!s?.sourceUrls?.length,
    !!enrichment?.meta?.lastEnrichedAt,
    enrichment?.meta?.matchStatus === "resolved" || enrichment?.meta?.matchStatus === "partial",
    !!s?.pagesRead,
  ];
  const filled = checks.filter(Boolean).length;
  return { filled, total: checks.length, score: Math.round((filled / checks.length) * 100) };
}

// -------------------------------------------------------------------- run log

export function appendRun(entry) {
  const log = readJson(PATHS.runLog, { runs: [] });
  log.runs.unshift(entry);
  log.runs = log.runs.slice(0, 60);
  writeJson(PATHS.runLog, log);
  return entry;
}
