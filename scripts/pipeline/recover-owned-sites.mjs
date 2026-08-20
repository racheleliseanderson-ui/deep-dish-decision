#!/usr/bin/env node
/**
 * Targeted recovery for known first-party site failures.
 *
 * - Reads an explicit recovery manifest (default: src/data/hygiene-failures-2026-08-20.json).
 * - Tries the normal owned-site reader first.
 * - If normal fetch fails, renders the same public first-party URL in Chromium.
 * - Never disables TLS verification and never uses third-party restaurant content.
 * - Applies a corrected host to dataset.json only after that corrected first-party URL
 *   successfully yields owned-site evidence.
 */
import path from "node:path";
import {
  PATHS,
  appendRun,
  completeness,
  readJson,
  snapshot,
  writeJson,
} from "./lib.mjs";
import {
  closeSharedBrowser,
  fetchSitePages,
  parseHtmlDocument,
  renderWithPlaywright,
} from "./own-fetch.mjs";
import { extractFromSite, pickSitePages } from "./site.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, "").split("=");
    return [key, value ?? true];
  }),
);

const manifestPath = path.resolve(
  process.cwd(),
  String(args.manifest || "src/data/hygiene-failures-2026-08-20.json"),
);
const manifest = readJson(manifestPath, null);
if (!manifest?.records?.length) throw new Error(`recovery manifest missing/empty: ${manifestPath}`);

const dataset = readJson(PATHS.dataset, null);
if (!dataset?.records) throw new Error("dataset.json not found");
const store = readJson(PATHS.enrichment, { generatedAt: null, records: {} });
const bySlug = new Map(dataset.records.map((record) => [record.slug, record]));

function usableParsedPage(parsed) {
  if (!parsed) return false;
  return (
    String(parsed.text || "").trim().length >= 40 ||
    (parsed.jsonLdQuotes?.length ?? 0) > 0 ||
    (parsed.pageQuotes?.length ?? 0) > 0
  );
}

async function renderPage(url) {
  const rendered = await renderWithPlaywright(url);
  if (!rendered?.html) return null;
  const parsed = parseHtmlDocument(rendered.html, url);
  if (!usableParsedPage(parsed)) return null;
  return {
    url,
    markdown: parsed.text,
    links: parsed.links,
    jsonLd: parsed.jsonLd,
    jsonLdQuotes: parsed.jsonLdQuotes,
    pageQuotes: [...(parsed.pageQuotes ?? []), ...(rendered.xhrQuotes ?? [])],
    rendered: true,
  };
}

async function renderSitePages(siteUrl) {
  const pages = [];
  const home = await renderPage(siteUrl);
  if (!home) return pages;
  pages.push(home);
  const extras = pickSitePages(siteUrl, home.links ?? []);
  for (const extra of extras.slice(0, 3)) {
    const page = await renderPage(extra);
    if (page) pages.push(page);
  }
  return pages;
}

const startedAt = new Date().toISOString();
const snapshotDir = snapshot("hygiene-recovery-owned");
const results = [];
let datasetChanged = false;

for (const task of manifest.records) {
  const record = bySlug.get(task.slug);
  if (!record) {
    results.push({ slug: task.slug, matchStatus: "missing-record", notes: ["slug not found"] });
    continue;
  }

  const prior = store.records[record.slug] ?? {};
  const originalWebsite = String(record.website || task.website || "").trim();
  const candidateWebsite = String(task.correctedWebsite || originalWebsite).trim();
  const retrievedAt = new Date().toISOString();
  const notes = [];
  let pages = [];
  let directError = null;
  let browserUsed = false;

  if (!candidateWebsite || !/^https?:\/\//i.test(candidateWebsite)) {
    directError = "no valid first-party URL";
  } else {
    const direct = await fetchSitePages(candidateWebsite, pickSitePages);
    pages = direct.pages ?? [];
    directError = direct.homeError ?? null;

    if (!pages.length) {
      const renderedPages = await renderSitePages(candidateWebsite);
      if (renderedPages.length) {
        pages = renderedPages;
        browserUsed = true;
      }
    }
  }

  const entry = {
    ...(prior.google ? { google: prior.google } : {}),
    ...(prior.summary ? { summary: prior.summary } : {}),
    ...(prior.site ? { site: prior.site } : {}),
    meta: {
      ...(prior.meta ?? {}),
      lastEnrichedAt: retrievedAt,
      enrichmentMode: "owned-site-recovery",
    },
  };

  if (pages.length) {
    entry.site = extractFromSite(pages, retrievedAt);
    entry.meta.matchStatus = "resolved";
    notes.push(`pages ${pages.length}`);
    if (browserUsed) notes.push("browser recovery");
    if (directError) notes.push(`direct ${directError}`);
    if (entry.site.jsonLdLanguage?.length) notes.push(`quotes ${entry.site.jsonLdLanguage.length}`);

    if (task.correctedWebsite && candidateWebsite !== originalWebsite) {
      record.website = candidateWebsite;
      datasetChanged = true;
      notes.push(`source corrected ${originalWebsite} -> ${candidateWebsite}`);
    }
  } else {
    entry.meta.matchStatus = "site-failure";
    notes.push(directError ? `site ${directError}` : "browser recovery yielded no readable page");
  }

  entry.meta.completeness = completeness(record, entry).score;
  store.records[record.slug] = entry;
  store.generatedAt = new Date().toISOString();

  results.push({
    slug: record.slug,
    matchStatus: entry.meta.matchStatus,
    completeness: entry.meta.completeness,
    website: record.website,
    notes,
  });

  console.log(
    `${record.slug.padEnd(42)} ${String(entry.meta.matchStatus).padEnd(12)} ${String(entry.meta.completeness).padStart(3)}%  ${notes.join("; ")}`,
  );
}

if (datasetChanged) {
  dataset.count = dataset.records.length;
  writeJson(PATHS.dataset, dataset);
}
writeJson(PATHS.enrichment, store);

const resolved = results.filter((r) => r.matchStatus === "resolved").length;
const failures = results.filter((r) => r.matchStatus === "site-failure").length;
const missing = results.filter((r) => r.matchStatus === "missing-record").length;

appendRun({
  kind: "hygiene-owned",
  startedAt,
  finishedAt: new Date().toISOString(),
  batchSize: results.length,
  recovery: true,
  resolved,
  unresolved: failures + missing,
  deferred: 0,
  apiCalls: { google: 0, firecrawl: 0, ownedFetch: results.length },
  retries: 0,
  failures,
  snapshot: snapshotDir,
  records: results.map((r) => ({
    slug: r.slug,
    matchStatus: r.matchStatus,
    completeness: r.completeness ?? 0,
    notes: r.notes ?? [],
  })),
});

const resultPath = path.join(process.cwd(), "src/data/hygiene-recovery-result.json");
writeJson(resultPath, {
  generatedAt: new Date().toISOString(),
  manifest: path.relative(process.cwd(), manifestPath),
  total: results.length,
  resolved,
  failures,
  missing,
  datasetSourceCorrections: results.filter((r) => (r.notes ?? []).some((n) => n.startsWith("source corrected"))).length,
  records: results,
});

await closeSharedBrowser();
console.log(`\nRecovery complete: ${resolved} resolved, ${failures} still failed, ${missing} missing.`);
