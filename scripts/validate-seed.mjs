/**
 * Seed / corpus integrity checker for Restaurant Intelligence.
 *
 * Fail-closed on identity clashes, status lies, and invented-certainty language.
 * Warns on recount drift, missing listing websites, and stale metadata.
 *
 * Usage:
 *   node scripts/validate-seed.mjs
 *   node scripts/validate-seed.mjs path/to/dataset.json
 *
 * Exit 1 on any fail; exit 0 when only warnings (or clean).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_SEED = path.join(ROOT, "src/data/dataset.json");
const SEED_PATH = path.resolve(process.argv[2] || DEFAULT_SEED);

/** Core narrative fields used for depth / thin counts. */
const CORE_NARRATIVE_FIELDS = [
  "serviceSummary",
  "menuSummary",
  "hoursSummary",
  "reservationDetails",
  "priceDetails",
  "dietaryDetails",
  "accessibilityState",
  "parkingTransit",
  "groupDetails",
  "atmosphereSummary",
  "dressCode",
  "typicalMealLength",
];

const LISTING_DISCLAIMER_NEEDLES = [
  "not yet reviewed against first-party",
  "listing only",
  "confirm every detail directly",
];

const INVENTED_CERTAINTY =
  /\ballergen[- ]safe\b|\bguaranteed\b|\bdefinitely step-free\b|\bADA certified\b|\b100%\s*safe\b/i;

const URL_OK = /^https?:\/\/\S+\.\S+/i;

function isEmptyNarrative(value) {
  if (value == null) return true;
  const v = String(value).trim();
  if (!v) return true;
  if (/^not stated/i.test(v)) return true;
  if (/^direct confirmation required/i.test(v)) return true;
  if (v.length < 12) return true;
  return false;
}

function liveThinFields(record) {
  return CORE_NARRATIVE_FIELDS.filter((k) => isEmptyNarrative(record[k]));
}

function evidenceBucket(record) {
  if (!record.isFullCaseFile || record.reviewStatus === "listing_only") return "listing";
  const thin = record.thinFieldCount ?? liveThinFields(record).length;
  const depth = (record.depthFilled ?? 0) / Math.max(1, record.depthTotal ?? 12);
  if (thin >= 4 || depth < 0.7) return "thin";
  return "resolved";
}

function liveEvidenceBucket(record) {
  if (!record.isFullCaseFile || record.reviewStatus === "listing_only") return "listing";
  const thin = liveThinFields(record).length;
  const depthFilled = CORE_NARRATIVE_FIELDS.length - thin;
  const depth = depthFilled / CORE_NARRATIVE_FIELDS.length;
  if (thin >= 4 || depth < 0.7) return "thin";
  return "resolved";
}

function phoneDigits(phone) {
  return String(phone || "").replace(/\D/g, "");
}

function main() {
  if (!fs.existsSync(SEED_PATH)) {
    console.error(JSON.stringify({ ok: false, error: `missing file: ${SEED_PATH}` }, null, 2));
    process.exit(2);
  }

  const seed = JSON.parse(fs.readFileSync(SEED_PATH, "utf8"));
  const records = seed.records || [];
  const issues = [];
  const note = (sev, code, msg, extra = {}) => issues.push({ sev, code, msg, ...extra });

  // --- file metadata ---
  if (seed.count != null && seed.count !== records.length) {
    note("fail", "count-drift", `seed.count ${seed.count} !== records ${records.length}`);
  }
  const regionSet = new Set(records.map((r) => r.region).filter(Boolean));
  if (seed.regions != null && seed.regions !== regionSet.size) {
    note("warn", "regions-drift", `seed.regions ${seed.regions} !== unique region ${regionSet.size}`);
  }
  const taxRegions = new Set(seed.taxOptions?.ri_region ?? []);
  if (taxRegions.size) {
    const missingTax = [...regionSet].filter((r) => !taxRegions.has(r));
    if (missingTax.length) {
      note("warn", "tax-missing", `${missingTax.length} live regions absent from taxOptions.ri_region`, {
        sample: missingTax.slice(0, 8),
      });
    }
  }

  const listingOnly = records.filter((r) => r.reviewStatus === "listing_only").length;
  const full = records.filter((r) => r.isFullCaseFile).length;
  if (seed.ops?.thinRecords != null) {
    // ops.thinRecords historically meant "incomplete case files", not listing_only.
    // Surface when it is clearly stale relative to either interpretation.
    const incomplete = records.filter((r) => evidenceBucket(r) !== "resolved").length;
    if (seed.ops.thinRecords !== incomplete && seed.ops.thinRecords !== listingOnly) {
      note(
        "warn",
        "ops-stale",
        `ops.thinRecords=${seed.ops.thinRecords} listing_only=${listingOnly} incomplete=${incomplete} full=${full}`,
      );
    }
  }

  // --- identity ---
  const byId = new Map();
  const bySlug = new Map();
  const byRid = new Map();
  for (const r of records) {
    if (byId.has(r.id)) note("fail", "dup-id", `id ${r.id}`, { slugs: [byId.get(r.id), r.slug] });
    else byId.set(r.id, r.slug);
    if (bySlug.has(r.slug)) note("fail", "dup-slug", r.slug, { ids: [bySlug.get(r.slug), r.id] });
    else bySlug.set(r.slug, r.id);
    if (r.recordId) {
      if (byRid.has(r.recordId)) {
        note("fail", "dup-recordId", r.recordId, { slugs: [byRid.get(r.recordId), r.slug] });
      } else byRid.set(r.recordId, r.slug);
    }
    if (!String(r.title || "").trim()) note("fail", "no-title", `id ${r.id}`);
    if (!String(r.slug || "").trim()) note("fail", "no-slug", r.title || `id ${r.id}`);
    if (!String(r.city || "").trim()) note("warn", "no-city", r.slug);
    if (!String(r.stateProvince || "").trim()) note("warn", "no-state", r.slug);
  }

  const retiredPath = path.join(path.dirname(SEED_PATH), "retired.json");
  if (fs.existsSync(retiredPath)) {
    const retired = JSON.parse(fs.readFileSync(retiredPath, "utf8"));
    for (const row of retired.records || []) {
      if (!row.slug || !row.operator || !row.source || !row.closedOn || !row.quote) {
        note("fail", "retired-thin", `${row.slug || "?"} missing operator/source/closedOn/quote`);
      }
      if (row.successor) {
        note("fail", "retired-successor", `${row.slug} must not point at a successor`);
      }
      if (bySlug.has(row.slug)) {
        note("fail", "retired-still-present", row.slug);
      }
    }
  }

  // --- per-record honesty ---
  const status = { resolved: 0, thin: 0, listing: 0 };
  let recountDrift = 0;
  let statusFlip = 0;
  let listingWithNarrative = 0;
  let listingMissingDisclaimer = 0;
  let listingMissingWebsite = 0;
  let resolvedMissingContact = 0;
  let badUrl = 0;
  let badPhone = 0;
  const flipSamples = [];
  const driftSamples = [];
  const narrativeSamples = [];

  for (const r of records) {
    const storedBucket = evidenceBucket(r);
    const liveBucket = liveEvidenceBucket(r);
    status[storedBucket] += 1;

    if (r.isFullCaseFile && r.reviewStatus === "listing_only") {
      note("fail", "status-clash", `${r.slug} is full case file AND listing_only`);
    }

    const liveThin = liveThinFields(r);
    if ((r.thinFieldCount ?? -1) !== liveThin.length) {
      recountDrift += 1;
      if (driftSamples.length < 8) {
        driftSamples.push({
          slug: r.slug,
          stored: r.thinFieldCount,
          live: liveThin.length,
          extraStored: (r.thinFields || []).filter((x) => !liveThin.includes(x)),
          extraLive: liveThin.filter((x) => !(r.thinFields || []).includes(x)),
          bucket: storedBucket,
        });
      }
    }

    if (storedBucket !== liveBucket) {
      statusFlip += 1;
      if (flipSamples.length < 8) {
        flipSamples.push({
          slug: r.slug,
          stored: storedBucket,
          live: liveBucket,
          thinFieldCount: r.thinFieldCount,
          liveThin: liveThin.length,
        });
      }
    }

    if (storedBucket === "listing") {
      const filled = CORE_NARRATIVE_FIELDS.filter((k) => !isEmptyNarrative(r[k]));
      if (filled.length) {
        listingWithNarrative += 1;
        if (narrativeSamples.length < 6) narrativeSamples.push({ slug: r.slug, filled });
      }
      const dcl = String(r.disclaimer || "").toLowerCase();
      if (!LISTING_DISCLAIMER_NEEDLES.some((n) => dcl.includes(n))) {
        listingMissingDisclaimer += 1;
      }
      if (!r.website) listingMissingWebsite += 1;

      const blob = CORE_NARRATIVE_FIELDS.map((k) => r[k] || "").join(" ");
      if (INVENTED_CERTAINTY.test(blob)) {
        note("fail", "invented-certainty", r.slug);
      }
    }

    if (storedBucket === "resolved" && !r.website && !r.phone && !r.officialSource) {
      resolvedMissingContact += 1;
      note("fail", "resolved-no-contact", r.slug);
    }

    for (const u of [r.website, r.menuUrl, r.reservationUrl, r.officialSource]) {
      if (u && !URL_OK.test(u)) {
        badUrl += 1;
        if (badUrl <= 6) note("warn", "bad-url", r.slug, { url: u });
      }
    }
    if (r.phone) {
      const d = phoneDigits(r.phone);
      if (d.length < 7 || d.length > 15) {
        badPhone += 1;
        note("warn", "bad-phone", r.slug, { phone: r.phone });
      }
      if (r.hasPhone === false) {
        note("warn", "phone-flag", `${r.slug} has phone text but hasPhone=false`);
      }
    }
  }

  if (recountDrift) {
    note("warn", "recount-drift", `${recountDrift} records disagree with live thin recount`, {
      sample: driftSamples,
    });
  }
  if (statusFlip) {
    note("warn", "status-flip", `${statusFlip} records would change evidence bucket if recounted`, {
      sample: flipSamples,
    });
  }
  if (listingWithNarrative) {
    note("warn", "listing-narrative", `${listingWithNarrative} listing_only records have filled core fields`, {
      sample: narrativeSamples,
    });
  }
  if (listingMissingDisclaimer) {
    note("warn", "listing-disclaimer", `${listingMissingDisclaimer} listings lack first-party-review disclaimer language`);
  }
  if (listingMissingWebsite) {
    note("warn", "listing-no-site", `${listingMissingWebsite} listings have no official website`);
  }

  // --- title collisions (info) ---
  const byTitle = new Map();
  for (const r of records) {
    const k = String(r.title || "")
      .trim()
      .toLowerCase();
    if (!k) continue;
    if (!byTitle.has(k)) byTitle.set(k, []);
    byTitle.get(k).push(r.region);
  }
  const titleHits = [...byTitle.entries()].filter(([, v]) => v.length > 1);
  if (titleHits.length) {
    note("info", "dup-title", `${titleHits.length} titles used more than once`, {
      sample: titleHits.slice(0, 6),
    });
  }

  const fail = issues.filter((i) => i.sev === "fail").length;
  const warn = issues.filter((i) => i.sev === "warn").length;
  const report = {
    ok: fail === 0,
    file: path.relative(ROOT, SEED_PATH),
    records: records.length,
    status,
    full,
    listingOnly,
    recountDrift,
    statusFlip,
    listingWithNarrative,
    listingMissingDisclaimer,
    listingMissingWebsite,
    resolvedMissingContact,
    badUrl,
    badPhone,
    fail,
    warn,
    issues,
  };

  console.log(JSON.stringify(report, null, 2));
  process.exit(fail ? 1 : 0);
}

main();
