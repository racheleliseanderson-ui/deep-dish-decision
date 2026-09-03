/**
 * Level every restaurant onto the same first-party case-file floor.
 *
 * Reads owned-site quotes already sitting in enrichment.json and writes them
 * onto empty dataset fields. Remaining core fields get an honest unstated
 * sentence so every record is a complete 12-field file. Nothing is invented.
 *
 *   node scripts/pipeline/level-records.mjs
 *   node scripts/pipeline/level-records.mjs --dry
 */
import fs from "node:fs";
import path from "node:path";
import {
  CORE_SLOTS,
  FLOOR_PREFIX,
  THIN_FIELD_THRESHOLD,
  canFill,
  cuisineTagsFrom,
  emptyish,
  floor,
  formatCuisineContext,
  formatHoursSummary,
  formatPhone,
  formatPriceDetails,
  isOurFloor,
  isQuestion,
  measureDepth,
  platformFromUrl,
  quoteText,
  reviewState,
  sentenceFromQuotes,
  stripPrefix,
  usableQuotes,
} from "./level-format.mjs";
import { isStorableMenuUrl } from "./menu-url.mjs";

const ROOT = process.cwd();
const PATHS = {
  dataset: path.join(ROOT, "src/data/dataset.json"),
  enrichment: path.join(ROOT, "src/data/enrichment.json"),
  coverage: path.join(ROOT, "src/data/coverage.json"),
  runLog: path.join(ROOT, "src/data/run-log.json"),
};

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);
const DRY = Boolean(args.dry);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

const STRUCTURED_SITE_PATTERNS = {
  telephone: /\b(?:JSON-LD|hydration)\s+telephone:/i,
  hours: /\b(?:JSON-LD|hydration)\s+openingHours(?:Specification)?:/i,
  price: /\b(?:JSON-LD|hydration)\s+priceRange:/i,
  cuisine: /\b(?:JSON-LD|hydration)\s+servesCuisine:/i,
};
const STRUCTURED_SITE_FIELDS = {
  telephone: "telephoneLanguage",
  hours: "hoursLanguage",
  price: "priceLanguage",
  cuisine: "cuisineLanguage",
};

function hasStructuredSiteEvidence(site, kind) {
  if (!site) return false;
  const field = STRUCTURED_SITE_FIELDS[kind];
  if (field && Array.isArray(site[field]) && site[field].some((v) => quoteText(v).trim())) {
    return true;
  }
  return (site.jsonLdLanguage ?? []).some((value) =>
    STRUCTURED_SITE_PATTERNS[kind].test(quoteText(value)),
  );
}

function stated(v) {
  if (v == null) return false;
  const t = String(v).trim();
  return t.length > 0 && !/^not stated$/i.test(t) && t !== "—" && t !== "-";
}

/** Same 18-check score used by the GitHub pipeline. */
export function completeness(record, enrichment) {
  const s = enrichment?.site;
  const checks = [
    stated(record.address),
    stated(record.phone) || hasStructuredSiteEvidence(s, "telephone"),
    stated(record.website),
    stated(record.coverageArea) || stated(record.city),
    stated(record.cuisineContext) ||
      !!record.cuisineTags?.length ||
      hasStructuredSiteEvidence(s, "cuisine"),
    stated(record.hoursSummary) || hasStructuredSiteEvidence(s, "hours"),
    stated(record.priceDetails) ||
      !!record.priceTags?.length ||
      hasStructuredSiteEvidence(s, "price"),
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

function isHandAuthored(record) {
  return (
    String(record.recordId || "").startsWith("RI-ENT") ||
    (!record.origin && !String(record.recordId || "").startsWith("RI-EXP"))
  );
}

function unique(values) {
  const seen = new Set();
  const out = [];
  for (const v of values) {
    const t = String(v ?? "").trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function daypartFromHours(hours) {
  const t = String(hours ?? "").toLowerCase();
  const tags = [];
  if (/brunch|breakfast/.test(t)) tags.push("Brunch / daytime");
  if (/\blunch\b|11:00 am|11:30 am|10:30 am/.test(t)) tags.push("Lunch language");
  if (/\bdinner\b|5:00 pm|5:30 pm|6:00 pm|evening/.test(t)) tags.push("Dinner language");
  return tags;
}

function applyEvidence(record, site) {
  const changed = [];
  if (!site) return changed;

  if (canFill(record.phone) && (site.telephoneLanguage ?? []).length) {
    const raw = stripPrefix(quoteText(site.telephoneLanguage[0]));
    const phone = formatPhone(raw);
    if (phone) {
      record.phone = phone;
      changed.push("phone");
    }
  }

  if (canFill(record.hoursSummary) && (site.hoursLanguage ?? []).length) {
    const hours = formatHoursSummary(site.hoursLanguage);
    if (hours) {
      record.hoursSummary = hours;
      changed.push("hoursSummary");
    }
  }

  if (canFill(record.priceDetails) && (site.priceLanguage ?? []).length) {
    const price = formatPriceDetails(site.priceLanguage);
    if (price) {
      record.priceDetails = price;
      changed.push("priceDetails");
    }
  }

  if (canFill(record.cuisineContext) && (site.cuisineLanguage ?? []).length) {
    const cuisine = formatCuisineContext(site.cuisineLanguage);
    if (cuisine) {
      record.cuisineContext = cuisine;
      changed.push("cuisineContext");
    }
  }

  // menuUrl says "the restaurant published this". Only a link on its own domain
  // or on an ordering platform it controls is allowed to make that claim; the
  // owned-site read is not trusted to have checked.
  if (canFill(record.menuUrl) && site.menuUrl && isStorableMenuUrl(site.menuUrl, record.website)) {
    record.menuUrl = site.menuUrl;
    changed.push("menuUrl");
  }

  if (canFill(record.reservationUrl) && site.reservationUrl) {
    record.reservationUrl = site.reservationUrl;
    changed.push("reservationUrl");
  }

  const diet = sentenceFromQuotes(
    site.dietaryLanguage,
    "Dietary wording from the restaurant's own pages",
    2,
  );
  if (canFill(record.dietaryDetails) && diet) {
    record.dietaryDetails = diet.replace(/: - /g, ": ");
    changed.push("dietaryDetails");
  }

  const accessQuotes = usableQuotes(site.accessibilityLanguage).filter((q) => !isQuestion(q));
  if (canFill(record.accessibilityState) && accessQuotes.length) {
    record.accessibilityState = `Access wording from the restaurant's own pages: ${accessQuotes.slice(0, 2).join(" · ")}`;
    changed.push("accessibilityState");
  }

  const groupQuotes = usableQuotes([
    ...(site.groupPolicy ? [site.groupPolicy] : []),
    ...(site.groupPolicyLanguage ?? []),
  ]).filter((q) => q.length >= 24);
  if (canFill(record.groupDetails) && groupQuotes.length) {
    record.groupDetails = `Group policy from the restaurant's own pages: ${groupQuotes
      .slice(0, 2)
      .map((q) => q.replace(/^[-–•]\s*/, ""))
      .join(" · ")}`;
    changed.push("groupDetails");
  }

  if (
    canFill(record.dressCode) &&
    site.dressCode &&
    !isQuestion(site.dressCode) &&
    String(site.dressCode).length >= 20
  ) {
    record.dressCode = `Dress note from the restaurant's own pages: ${stripPrefix(site.dressCode)}`;
    changed.push("dressCode");
  }

  const cancel = usableQuotes(site.cancellationLanguage).slice(0, 2);
  if (canFill(record.reservationDetails)) {
    const platform = platformFromUrl(
      record.reservationUrl || site.reservationUrl,
      site.reservationPlatform,
    );
    const bits = [];
    if (record.reservationUrl || site.reservationUrl) {
      bits.push(
        platform
          ? `Reservations via ${platform} on a path published by the restaurant.`
          : "A reservation path is published on the restaurant's own site.",
      );
    }
    if (cancel.length) bits.push(cancel.join(" · "));
    if (bits.length) {
      record.reservationDetails = bits.join(" ");
      changed.push("reservationDetails");
    }
  }

  const storedMenu =
    (isStorableMenuUrl(record.menuUrl, record.website) && record.menuUrl) ||
    (isStorableMenuUrl(site.menuUrl, record.website) && site.menuUrl) ||
    "";
  if (canFill(record.menuSummary) && storedMenu) {
    record.menuSummary = "A menu path is published on the restaurant's own site.";
    changed.push("menuSummary");
  }

  return changed;
}

function applyFloor(record, site, matchStatus) {
  const pagesRead = site?.pagesRead ?? 0;
  const reviewed = pagesRead >= 1 || matchStatus === "resolved" || matchStatus === "partial";
  const failure = matchStatus === "site-failure" || matchStatus === "source-limited";

  const fill = (key, sentence) => {
    if (canFill(record[key])) record[key] = sentence;
  };

  if (reviewed) {
    fill("hoursSummary", floor("hours were not published"));
    fill("priceDetails", floor("menu prices were not published"));
    fill("cuisineContext", floor("cuisine was not named"));
    fill("dietaryDetails", floor("dietary and allergen handling were not published"));
    fill(
      "accessibilityState",
      floor("the physical-access route and restroom detail were not published"),
    );
    fill("groupDetails", floor("group, private-dining, and large-party terms were not published"));
    fill("dressCode", floor("a dress code was not published"));
    fill("atmosphereSummary", floor("room character and noise were not described"));
    fill("parkingTransit", floor("parking and transit were not published"));
    fill("beverageDetails", floor("the beverage program was not described"));
    fill("typicalMealLength", floor("typical meal length was not published"));
    fill(
      "occasionFit",
      floor("occasion fit is not independently reviewed beyond the stated fields"),
    );
    if (canFill(record.menuSummary)) {
      record.menuSummary = isStorableMenuUrl(record.menuUrl, record.website)
        ? "A menu path is published on the restaurant's own site."
        : floor("a menu path was not published");
    }
    if (canFill(record.reservationDetails)) {
      record.reservationDetails = record.reservationUrl
        ? "A reservation path is published on the restaurant's own site."
        : floor("reservation release and cancellation terms were not published");
    }
    {
      const bits = [];
      if (!isOurFloor(record.cuisineContext) && !emptyish(record.cuisineContext)) {
        bits.push(
          record.cuisineContext
            .replace(/ — named on the restaurant's own pages\.?$/i, "")
            .replace(/\.$/, ""),
        );
      }
      if (!isOurFloor(record.hoursSummary) && !emptyish(record.hoursSummary)) {
        bits.push(
          `Hours ${record.hoursSummary.replace(/^Hours as published on the restaurant's own pages:\s*/i, "").replace(/\.$/, "")}`,
        );
      }
      if (record.reservationUrl) {
        const platform = platformFromUrl(record.reservationUrl, site?.reservationPlatform);
        bits.push(platform ? `Reservations via ${platform}` : "Reservation path published");
      } else if (record.hasPhone || record.phone) {
        bits.push("Confirm seating by phone");
      }
      record.serviceSummary = bits.length
        ? `${bits.map((s) => s.replace(/[.;]+$/, "").trim()).join(". ")}.`
        : floor("service format is not independently summarized beyond the stated fields");
    }
    if (canFill(record.practicalNotes)) {
      record.practicalNotes =
        "Confirm hours, booking terms, and any field marked unstated live before you commit.";
    }
  } else if (failure || !reviewed) {
    const unread = `${FLOOR_PREFIX} — the restaurant's own pages could not be reviewed for this field. Confirm live before you commit.`;
    for (const key of [
      "hoursSummary",
      "priceDetails",
      "cuisineContext",
      "serviceSummary",
      "menuSummary",
      "reservationDetails",
      "dietaryDetails",
      "accessibilityState",
      "groupDetails",
      "dressCode",
      "atmosphereSummary",
      "parkingTransit",
      "beverageDetails",
      "typicalMealLength",
      "practicalNotes",
      "occasionFit",
    ]) {
      fill(key, unread);
    }
  }
}

function deriveTaxonomy(record, site) {
  const cuisineText = [record.cuisineContext, ...(record.cuisineTags ?? [])].join(" ");
  record.cuisineTags = cuisineTagsFrom(cuisineText, record.cuisineTags ?? []);

  const platform = platformFromUrl(record.reservationUrl, site?.reservationPlatform);
  const booking = [...(record.bookingPlatforms ?? [])];
  if (platform && !booking.includes(platform)) booking.push(platform);
  if (record.phone && !booking.includes("Phone")) booking.push("Phone");
  record.bookingPlatforms = unique(booking);
  record.bookingPaths = [...record.bookingPlatforms];

  if (!(record.reservationTags ?? []).length) {
    record.reservationTags = record.reservationUrl
      ? ["Reservations"]
      : record.phone
        ? ["Phone"]
        : [];
  }

  if (!(record.dietaryTags ?? []).length) {
    const diet = String(record.dietaryDetails ?? "").toLowerCase();
    if (/vegan|vegetarian|gluten|allerg/.test(diet) && !isOurFloor(record.dietaryDetails)) {
      record.dietaryTags = ["Direct confirmation required"];
    } else {
      record.dietaryTags = ["Direct confirmation required"];
    }
  }

  if (!(record.priceTags ?? []).length) {
    const price = `${record.priceDetails ?? ""} ${(record.spendBands ?? []).join(" ")}`;
    const band = price.match(/(\${1,4})/);
    if (band) record.priceTags = [band[1]];
  }
  if (!(record.spendBands ?? []).length && (record.priceTags ?? []).length) {
    record.spendBands = [...record.priceTags];
  }

  const daypart = unique([...(record.daypartTags ?? []), ...daypartFromHours(record.hoursSummary)]);
  record.daypartTags = daypart;

  if (!(record.serviceStyles ?? []).length) {
    const styles = [];
    if (daypart.some((d) => /dinner/i.test(d))) styles.push("Dinner");
    if (daypart.some((d) => /brunch|lunch|daytime/i.test(d))) styles.push("Daytime");
    if (record.cuisineTags.includes("Fine dining")) styles.push("Fine dining");
    record.serviceStyles = styles;
  }

  if (!record.planningLoad) {
    record.planningLoad = ["Tock", "Resy", "OpenTable"].some((p) =>
      record.bookingPlatforms.includes(p),
    )
      ? "Material"
      : "Standard";
  }

  record.hasPhone = Boolean(record.phone);
}

function applyProvenance(record, site, matchStatus, nowDate, changed) {
  if (isHandAuthored(record)) return;
  const pagesRead = site?.pagesRead ?? 0;
  const reviewed = pagesRead >= 1 || matchStatus === "resolved" || matchStatus === "partial";
  const urls = unique([
    record.website,
    record.officialSource,
    ...(site?.sourceUrls ?? []),
    record.menuUrl,
    record.reservationUrl,
  ]);

  if (reviewed) {
    record.sourceAuthority = "Official restaurant website / first-party page";
    record.officialSource = record.officialSource || record.website || site?.sourceUrls?.[0] || "";
    record.additionalSources = urls.filter((u) => u && u !== record.officialSource).join(" | ");
    record.sources = urls;
    record.confidence =
      record.confidence === "listing_only" ? "owned_site_leveled" : record.confidence;
    record.freshnessStatus =
      record.freshnessStatus === "AWAITING_FIRST_PARTY_REVIEW"
        ? "OWNED_SITE_REVIEWED"
        : record.freshnessStatus;
    record.disclaimer =
      "Fields below are taken from the restaurant's own public pages, or marked unstated when those pages were silent. Confirm live before booking.";
    if (record.reviewStatus === "listing_only") {
      record.reviewStatus = "current";
      record.reviewedAt = nowDate;
      record.nextReviewAt = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
    }
    record.nextAction =
      "Confirm hours, booking terms, and any field marked unstated live before you commit.";
    record.fieldVolatility =
      "Hours, pricing and policy fields change without notice — reconfirm for your date.";
  } else if (record.reviewStatus === "listing_only") {
    record.disclaimer =
      "The restaurant's own pages could not be fully reviewed. Every core field is held open until confirmed live.";
    record.nextAction = "Confirm every field directly with the restaurant before you commit.";
  }

  if (changed.length) {
    record.retrievedAt = new Date().toISOString();
  }
}

function unknownsFor(record) {
  if (isHandAuthored(record)) return;
  const list = [];
  if (isOurFloor(record.hoursSummary) || emptyish(record.hoursSummary)) {
    list.push("Live hours for your date");
  }
  if (isOurFloor(record.reservationDetails) && !record.reservationUrl) {
    list.push("Reservation release pattern");
  }
  if (isOurFloor(record.dietaryDetails) || emptyish(record.dietaryDetails)) {
    list.push("Dietary cross-contact handling");
  }
  if (isOurFloor(record.accessibilityState) || emptyish(record.accessibilityState)) {
    list.push("Accessibility route detail");
  }
  if (isOurFloor(record.groupDetails) || emptyish(record.groupDetails)) {
    list.push("Private-dining terms");
  }
  if (isOurFloor(record.parkingTransit) || emptyish(record.parkingTransit)) {
    list.push("Parking and arrival logistics");
  }
  if (isOurFloor(record.priceDetails) || emptyish(record.priceDetails)) {
    list.push("Current per-guest total");
  }
  const unknownList = unique(list).slice(0, 6);
  record.unknownList = unknownList.length
    ? unknownList
    : ["Live reservation availability", "individual dietary suitability"];
  record.unknownsCount = record.unknownList.length;
  record.unknowns = record.unknownList.join("; ");
  record.checklist = [
    "Confirm current hours directly",
    "Confirm reservation release and cancellation terms",
    "Confirm dietary handling with the kitchen",
    "Confirm accessibility route and restroom detail",
    record.parkingTransit && !isOurFloor(record.parkingTransit)
      ? "Reconfirm arrival logistics for your window"
      : "Verify parking or transit for arrival window",
    "Check current menu prices",
  ];
}

function rebuildSearch(record) {
  record.searchText = [
    record.title,
    record.city,
    record.stateProvince,
    record.region,
    record.cuisineContext,
    ...(record.cuisineTags ?? []),
    ...(record.bookingPlatforms ?? []),
    record.address,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function rebuildDatasetMeta(dataset) {
  const records = dataset.records;
  dataset.count = records.length;
  dataset.regions = new Set(records.map((r) => r.region)).size;
  dataset.regionGroups = uniqueSorted(records.map((r) => r.regionGroup));
  dataset.cuisineTagOptions = uniqueSorted(records.flatMap((r) => r.cuisineTags ?? []));
  dataset.bookingPlatformOptions = uniqueSorted(records.flatMap((r) => r.bookingPlatforms ?? []));
  dataset.spendBandOptions = uniqueSorted(records.flatMap((r) => r.spendBands ?? []));
  dataset.daypartOptions = uniqueSorted(records.flatMap((r) => r.daypartTags ?? []));
  dataset.planningLoadOptions = uniqueSorted(records.map((r) => r.planningLoad));
  dataset.generatedAt = new Date().toISOString();
  dataset.sourceSync =
    "wp-rest+first-party-auto-review · owned-site leveling (every record on the same 12-field floor)";

  // Read from the date each record carries, not from a status label. Nothing in
  // this pipeline ever wrote reviewStatus = "overdue", so counting the label
  // reported zero while 41 records sat past their own nextReviewAt.
  const today = new Date().toISOString().slice(0, 10);
  const state = records.map((r) => reviewState(r, today));
  const overdue = state.filter((x) => x === "overdue").length;
  const dueSoon = state.filter((x) => x === "due_soon").length;
  const current = state.filter((x) => x === "current").length;
  const thinRecords = records.filter(
    (r) => r.reviewStatus === "listing_only" || (r.thinFieldCount ?? 0) >= THIN_FIELD_THRESHOLD,
  ).length;
  const unknowns = records.reduce((a, r) => a + (r.unknownsCount || 0), 0);
  const thinFields = records.reduce((a, r) => a + (r.thinFieldCount || 0), 0);
  const lastReviewAt =
    records
      .map((r) => r.reviewedAt)
      .filter(Boolean)
      .sort()
      .at(-1) ?? "";
  dataset.ops = {
    overdue,
    dueSoon,
    current,
    officialConflicts: records.filter((r) => r.hasOfficialConflict).length,
    thinRecords,
    avgUnknowns: records.length ? Math.round((unknowns / records.length) * 100) / 100 : 0,
    avgThinFields: records.length ? Math.round((thinFields / records.length) * 100) / 100 : 0,
    lastReviewAt,
    reachableAtLastReview: records.filter((r) => r.hasPhone).length,
  };
}

function updateCoverage(coverage, dataset, store) {
  const bySlug = new Map(dataset.records.map((r) => [r.slug, r]));
  for (const row of coverage.records ?? []) {
    const record = bySlug.get(row.slug);
    const entry = store.records[row.slug] ?? null;
    if (!record) continue;
    const score = completeness(record, entry).score;
    row.completeness = score;
    row.reviewStatus = record.reviewStatus ?? row.reviewStatus;
    row.reviewedAt = record.reviewedAt ?? row.reviewedAt;
    row.nextReviewAt = record.nextReviewAt ?? row.nextReviewAt;
    if (entry?.meta) row.matchStatus = entry.meta.matchStatus ?? row.matchStatus;
  }
  const rows = coverage.records ?? [];
  const scored = rows.map((r) => r.completeness ?? 0);
  coverage.generatedAt = new Date().toISOString();
  const hygieneRows = rows.filter(
    (r) =>
      r.matchStatus === "site-failure" ||
      r.matchStatus === "source-limited" ||
      r.reviewStatus === "listing_only" ||
      r.reviewStatus === "overdue" ||
      r.reviewDueSoon ||
      (r.completeness ?? 0) < 70,
  );
  coverage.totals = {
    ...coverage.totals,
    records: dataset.records.length,
    enriched: Object.keys(store.records).length,
    resolved: rows.filter((r) => r.matchStatus === "resolved").length,
    unresolved: rows.filter((r) => r.matchStatus === "unresolved").length,
    avgCompleteness: scored.length
      ? Math.round(scored.reduce((a, b) => a + b, 0) / scored.length)
      : 0,
    thin: rows.filter((r) => (r.completeness ?? 0) < 70).length,
    hygiene: hygieneRows.length,
    withPrice: dataset.records.filter((r) => stated(r.priceDetails) && !isOurFloor(r.priceDetails))
      .length,
  };
  if (coverage.freshness) {
    coverage.freshness.hygieneSlugs = hygieneRows.slice(0, 25).map((r) => r.slug);
    const keep = new Set(hygieneRows.map((r) => r.slug));
    coverage.freshness.nextHygiene = (coverage.freshness.nextHygiene ?? []).filter((item) =>
      keep.has(item.slug),
    );
  }
  const bands = [
    { label: "90-100", min: 90 },
    { label: "75-89", min: 75 },
    { label: "50-74", min: 50 },
    { label: "under 50", min: 0 },
  ];
  coverage.distribution = bands.map((band, i) => {
    const max = i === 0 ? 101 : bands[i - 1].min;
    return {
      label: band.label,
      count: rows.filter((r) => r.completeness >= band.min && r.completeness < max).length,
    };
  });
  if (Array.isArray(coverage.states)) {
    const byState = new Map();
    for (const row of rows) {
      const bucket = byState.get(row.stateCode) ?? { count: 0, scoreSum: 0 };
      bucket.count += 1;
      bucket.scoreSum += row.completeness ?? 0;
      byState.set(row.stateCode, bucket);
    }
    coverage.states = coverage.states.map((s) => {
      const b = byState.get(s.code);
      return {
        ...s,
        count: b?.count ?? s.count,
        enriched: b?.count ?? s.enriched,
        avgCompleteness: b?.count ? Math.round(b.scoreSum / b.count) : 0,
      };
    });
  }
  coverage.records = [...rows].sort((a, b) => b.completeness - a.completeness);
}

// ------------------------------------------------------------------ run
const dataset = readJson(PATHS.dataset);
const store = readJson(PATHS.enrichment);
const nowDate = new Date().toISOString().slice(0, 10);

let promoted = 0;
let floored = 0;
let fullBefore = dataset.records.filter((r) => r.isFullCaseFile).length;
const fieldHits = Object.fromEntries(CORE_SLOTS.map((s) => [s.id, 0]));

for (const record of dataset.records) {
  const entry = store.records[record.slug] ?? {};
  const site = entry.site ?? null;
  const matchStatus = entry.meta?.matchStatus ?? "";
  const changed = applyEvidence(record, site);
  if (!isHandAuthored(record)) {
    applyFloor(record, site, matchStatus);
    deriveTaxonomy(record, site);
    applyProvenance(record, site, matchStatus, nowDate, changed);
    unknownsFor(record);
    Object.assign(record, measureDepth(record));
    for (const key of ["dietaryDetails", "groupDetails"]) {
      if (typeof record[key] === "string") {
        record[key] = record[key].replace(/: - /g, ": ").replace(/ · - /g, " · ");
      }
    }
  }
  rebuildSearch(record);

  if (changed.length) promoted += 1;
  if (record.isFullCaseFile) floored += 1;
  for (const slot of CORE_SLOTS) {
    if (!emptyish(slot.get(record))) fieldHits[slot.id] += 1;
  }

  if (entry.meta) {
    entry.meta.completeness = completeness(record, entry).score;
  }
}

rebuildDatasetMeta(dataset);

if (!DRY && fs.existsSync(PATHS.coverage)) {
  const coverage = readJson(PATHS.coverage);
  updateCoverage(coverage, dataset, store);
  writeJson(PATHS.coverage, coverage);
}

if (DRY) {
  console.log(
    JSON.stringify(
      {
        dry: true,
        records: dataset.records.length,
        promoted,
        fullBefore,
        fullAfter: dataset.records.filter((r) => r.isFullCaseFile).length,
        fieldHits,
        ops: dataset.ops,
        avgCompleteness: Math.round(
          dataset.records.reduce(
            (a, r) => a + (store.records[r.slug]?.meta?.completeness ?? 0),
            0,
          ) / dataset.records.length,
        ),
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

writeJson(PATHS.dataset, dataset);
writeJson(PATHS.enrichment, store);

if (fs.existsSync(PATHS.runLog)) {
  const log = readJson(PATHS.runLog);
  log.runs = [
    {
      kind: "level-records",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      records: dataset.records.length,
      promoted,
      fullBefore,
      fullAfter: dataset.records.filter((r) => r.isFullCaseFile).length,
      avgCompleteness: dataset.records.length
        ? Math.round(
            dataset.records.reduce(
              (a, r) => a + (store.records[r.slug]?.meta?.completeness ?? 0),
              0,
            ) / dataset.records.length,
          )
        : 0,
      ops: dataset.ops,
    },
    ...(log.runs ?? []),
  ].slice(0, 60);
  writeJson(PATHS.runLog, log);
}

console.log(
  [
    `leveled             ${dataset.records.length}`,
    `evidence promoted   ${promoted}`,
    `full case files     ${fullBefore} → ${dataset.records.filter((r) => r.isFullCaseFile).length}`,
    `listing_only left   ${dataset.records.filter((r) => r.reviewStatus === "listing_only").length}`,
    `mean completeness   ${Math.round(
      dataset.records.reduce((a, r) => a + (store.records[r.slug]?.meta?.completeness ?? 0), 0) /
        dataset.records.length,
    )}%`,
    `thin records (≥${THIN_FIELD_THRESHOLD})   ${dataset.ops.thinRecords}`,
    `reachable           ${dataset.ops.reachableAtLastReview}`,
  ].join("\n"),
);
