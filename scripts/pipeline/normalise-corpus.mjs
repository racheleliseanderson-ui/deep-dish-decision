/**
 * Bring stored derived state back in line with the fields it is derived from.
 *
 * Nothing here fetches, infers or fills. Every value it writes is recomputed
 * from something already on the record, using the same functions the leveling
 * pass uses, so running it twice changes nothing the second time.
 *
 *   1. menuUrl / menuSummary. A menu link is a first-party claim. 27 records
 *      stored press coverage there and 19 stored a link on a domain the
 *      restaurant may not control, and all 46 carried the sentence "A menu path
 *      is published on the restaurant's own site." Press links are removed from
 *      the field (they survive in sources and additionalSources, which is where
 *      coverage belongs) and the sentence is replaced with what is true.
 *   2. Review state. Read from nextReviewAt rather than from a status label
 *      nothing ever assigned.
 *   3. Case depth. Re-measured with measureDepth(), the same function the
 *      leveling pass uses, so thinFieldCount cannot disagree with thinFields.
 *   4. dataset.ops, recomputed from the above.
 *
 * Usage: node scripts/pipeline/normalise-corpus.mjs [--dry]
 */
import fs from "node:fs";
import path from "node:path";
import { measureDepth, reviewState, THIN_FIELD_THRESHOLD } from "./level-format.mjs";
import { readMenuLink } from "./menu-url.mjs";

const ROOT = process.cwd();
const DRY = process.argv.includes("--dry");
const DATASET = path.join(ROOT, "src/data/dataset.json");
const ENRICHMENT = path.join(ROOT, "src/data/enrichment.json");
const TODAY = new Date().toISOString().slice(0, 10);

const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const write = (p, o) => fs.writeFileSync(p, JSON.stringify(o, null, 2) + "\n");

/**
 * Two scrape artifacts, and only two.
 *
 * A carousel widget put "9 Slide 9 (current slide)" in front of Bar Pigalle's
 * street number, and Lola 55's own name bled into the front of "1290 F Street".
 * Both rules require what is left to still start with a street number, so a
 * misfire cannot silently shorten a real address. Nothing else in 1,527
 * addresses matches either pattern; 95 addresses are empty and stay empty,
 * because there is nothing on file to clean.
 */
function cleanAddress(value, title) {
  let text = String(value ?? "").trim();
  if (!text) return text;
  const startsWithStreetNumber = (s) => /^\d+[A-Za-z]?\s+\S/.test(s);

  const carousel = text.replace(/^\d+\s+Slide\s+\d+\s*\(current slide\)\s*/i, "");
  if (carousel !== text && startsWithStreetNumber(carousel)) text = carousel;

  // "Lola 55" → "55 1290 F Street". Drop the leading token only when it repeats
  // a number the title ends with and a street number follows it.
  const titleTail = String(title ?? "")
    .trim()
    .match(/(\d+)$/);
  if (titleTail) {
    const bled = text.replace(new RegExp(`^${titleTail[1]}\\s+(?=\\d)`), "");
    if (bled !== text && startsWithStreetNumber(bled)) text = bled;
  }
  return text.trim();
}

const dataset = read(DATASET);
const enrichment = fs.existsSync(ENRICHMENT) ? read(ENRICHMENT) : null;

const changed = { menuPress: [], menuOffsite: [], address: [], review: [], depth: [] };

for (const record of dataset.records) {
  /* 1 ── menu link ------------------------------------------------------- */
  const menu = readMenuLink(record.menuUrl, record.website);
  if (menu && !menu.isMenu) {
    const sources = Array.isArray(record.sources) ? record.sources : [];
    if (!sources.includes(menu.url)) sources.push(menu.url);
    record.sources = sources;
    const extra = String(record.additionalSources ?? "");
    if (!extra.includes(menu.url)) {
      record.additionalSources = extra ? `${extra} | ${menu.url}` : menu.url;
    }
    if (menu.kind === "press") {
      record.menuUrl = "";
      // Phrased so isOperationallyThin() catches it: this room has no menu, and
      // the menu slot should read thin rather than filled by a review of it.
      record.menuSummary = `A menu is not published on any page the restaurant controls. The link held for this room is ${menu.host} writing about the restaurant, kept under sources as coverage.`;
      changed.menuPress.push(`${record.slug} → ${menu.host}`);
    } else {
      const line = `The menu on file is hosted on ${menu.host}, not on the restaurant's own domain. Deep Dish cannot confirm the restaurant controls that page.`;
      if (record.menuSummary !== line) changed.menuOffsite.push(`${record.slug} → ${menu.host}`);
      record.menuSummary = line;
    }
  }

  /* 2 ── address hygiene -------------------------------------------------- */
  const address = cleanAddress(record.address, record.title);
  if (address !== record.address) {
    changed.address.push(
      `${record.slug}: ${JSON.stringify(record.address)} → ${JSON.stringify(address)}`,
    );
    record.address = address;
  }

  /* 3 ── review state ---------------------------------------------------- */
  const state = reviewState(record, TODAY);
  if (state !== record.reviewStatus) {
    changed.review.push(`${record.slug}: ${record.reviewStatus} → ${state}`);
    record.reviewStatus = state;
  }
  record.reviewDueSoon = state === "due_soon";

  /* 4 ── case depth ------------------------------------------------------ */
  const depth = measureDepth(record);
  const before = `${record.depthFilled}/${record.thinFieldCount}`;
  if (
    record.depthFilled !== depth.depthFilled ||
    record.thinFieldCount !== depth.thinFieldCount ||
    (record.thinFields ?? []).join(",") !== depth.thinFields.join(",")
  ) {
    changed.depth.push(`${record.slug}: ${before} → ${depth.depthFilled}/${depth.thinFieldCount}`);
  }
  Object.assign(record, depth);
}

/* 5 ── ops ---------------------------------------------------------------- */
const state = dataset.records.map((r) => reviewState(r, TODAY));
const unknowns = dataset.records.reduce((a, r) => a + (r.unknownsCount || 0), 0);
const thin = dataset.records.reduce((a, r) => a + (r.thinFieldCount || 0), 0);
dataset.ops = {
  overdue: state.filter((x) => x === "overdue").length,
  dueSoon: state.filter((x) => x === "due_soon").length,
  current: state.filter((x) => x === "current").length,
  officialConflicts: dataset.records.filter((r) => r.hasOfficialConflict).length,
  thinRecords: dataset.records.filter(
    (r) => r.reviewStatus === "listing_only" || (r.thinFieldCount ?? 0) >= THIN_FIELD_THRESHOLD,
  ).length,
  avgUnknowns: Math.round((unknowns / dataset.records.length) * 100) / 100,
  avgThinFields: Math.round((thin / dataset.records.length) * 100) / 100,
  lastReviewAt:
    dataset.records
      .map((r) => r.reviewedAt)
      .filter(Boolean)
      .sort()
      .at(-1) ?? "",
  reachableAtLastReview: dataset.records.filter((r) => r.hasPhone).length,
};
dataset.generatedAt = new Date().toISOString();

/* The owned-site read holds its own copy of the menu path. Left alone it would
   put the same newspaper review back on the case file at the next leveling run. */
let enrichmentTouched = 0;
if (enrichment?.records) {
  const website = new Map(dataset.records.map((r) => [r.slug, r.website]));
  for (const [slug, entry] of Object.entries(enrichment.records)) {
    const site = entry?.site;
    if (!site?.menuUrl) continue;
    const menu = readMenuLink(site.menuUrl, website.get(slug));
    if (menu && menu.kind === "press") {
      site.menuUrl = "";
      enrichmentTouched++;
    }
  }
}

if (!DRY) {
  write(DATASET, dataset);
  if (enrichment) write(ENRICHMENT, enrichment);
}

console.log(
  [
    DRY ? "DRY RUN — nothing written" : "written",
    `menuUrl cleared (press)   ${changed.menuPress.length}`,
    `menuSummary corrected     ${changed.menuPress.length + changed.menuOffsite.length}`,
    `enrichment menuUrl wiped  ${enrichmentTouched}`,
    `addresses cleaned         ${changed.address.length}`,
    `review status corrected   ${changed.review.length}`,
    `case depth re-measured    ${changed.depth.length}`,
    `ops                       ${JSON.stringify(dataset.ops)}`,
    "",
    "press links removed from menuUrl:",
    ...changed.menuPress.map((x) => `  ${x}`),
    "",
    "off-domain menu links kept but relabelled:",
    ...changed.menuOffsite.map((x) => `  ${x}`),
    "",
    "addresses cleaned:",
    ...changed.address.map((x) => `  ${x}`),
    "",
    "review status corrected:",
    ...changed.review.slice(0, 60).map((x) => `  ${x}`),
    "",
    "case depth changed:",
    ...changed.depth.map((x) => `  ${x}`),
  ].join("\n"),
);
