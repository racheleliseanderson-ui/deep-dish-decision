#!/usr/bin/env node
/**
 * Resolve curated restaurant targets to their own official site, then emit a
 * seed-listings batch from what those sites actually say.
 *
 * The point of this script is that the expensive step in growing the corpus is
 * not naming restaurants — it is proving that a given website belongs to the
 * restaurant you named, and reading the address and phone off that page rather
 * than off an aggregator. That step is mechanical, so it belongs in code.
 *
 * A target carries a NAME and a city. The site is resolved here by trying the
 * shapes operators actually use (fullname.com, name-minus-its-class-word.com,
 * first-two-words.com, firstword.com) and is then VERIFIED: the page must name
 * the restaurant and read like a restaurant before a single field is believed.
 * Anything unresolved, unreachable, parked, closed, or resolving to a page that
 * does not name the target is dropped and logged — a record attached to the
 * wrong website is worse than a missing record.
 *
 * Nothing is invented. Address and phone come from the resolved page only
 * (JSON-LD first, visible text second), and the address is discarded unless it
 * names the target city, so a group site listing another branch cannot leak a
 * wrong address into the corpus. Narrative fields stay empty for enrich.mjs.
 *
 * Needs the internet. Run it where the machine actually has egress.
 *
 *   node scripts/pipeline/resolve-targets.mjs
 *   node scripts/pipeline/resolve-targets.mjs --market=minneapolis
 *   node scripts/pipeline/resolve-targets.mjs --limit=25 --dry
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PATHS, readJson, writeJson, appendRun, normalizeHost, normalizePhone } from "./lib.mjs";
import { fetchPage } from "./own-fetch.mjs";
import { isRetiredListing, retiredIndex } from "./retire-closed.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);
const DRY = Boolean(args.dry);
const LIMIT = Number(args.limit) || Infinity;
const ONLY = args.market ? String(args.market).toLowerCase() : null;
const CONCURRENCY = Math.max(1, Math.min(8, Number(args.concurrency ?? process.env.RESOLVE_CONCURRENCY ?? 4)));

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const TARGETS = path.join(root, "scripts/data/seed-targets.json");

/* ── hosts that are never a restaurant's own site ───────────────────────── */
const AGGREGATORS = [
  "yelp.com", "tripadvisor.com", "opentable.com", "resy.com", "doordash.com",
  "ubereats.com", "grubhub.com", "seamless.com", "postmates.com", "caviar.com",
  "facebook.com", "instagram.com", "twitter.com", "x.com", "tiktok.com",
  "google.com", "maps.google.com", "mapquest.com", "zomato.com", "allmenus.com",
  "menupix.com", "restaurantji.com", "wikipedia.org", "eater.com", "timeout.com",
  "menupages.com", "singleplatform.com", "yellowpages.com", "foursquare.com",
  "grubstreet.com", "michelin.com", "sedo.com", "hugedomains.com", "afternic.com",
];
const isAggregator = (url) => {
  const h = hostOf(url);
  return !h || AGGREGATORS.some((a) => h === a || h.endsWith(`.${a}`));
};
function hostOf(url) {
  try { return new URL(String(url)).hostname.replace(/^www\./, "").toLowerCase(); }
  catch { return ""; }
}

/* ── pages that exist but must not become records ───────────────────────── */
const CLOSED_RE =
  /\b(permanently closed|we have closed|has closed its doors|closed our doors|final service|no longer in business|ceased operations|thank you for \d+ (?:wonderful )?years)\b/i;
const PARKED_RE =
  /\b(this domain (?:is|may be) for sale|buy this domain|domain for sale|parked (?:free )?courtesy|checkout the full domain details|inquire about this domain)\b/i;
const RESTAURANT_RE =
  /\b(menu|menus|reservation|reservations|dine|dining|restaurant|kitchen|chef|lunch|dinner|brunch|cocktails?|wine list|book a table|order online|hours|takeout|catering)\b/i;
const LD_TYPES =
  /^(restaurant|foodestablishment|cafeorcoffeeshop|bakery|barorpub|nightclub|localbusiness|winery|brewery)$/i;

/* ── name handling ──────────────────────────────────────────────────────── */
const CLASS_WORDS = new Set([
  "the","a","an","and","of","at","on","in","by","restaurant","restaurante","cafe","caffe",
  "bar","kitchen","grill","grille","house","room","tavern","bistro","brasserie","eatery",
  "steakhouse","pizzeria","trattoria","osteria","taqueria","cantina","company","co","llc",
  "inc","and","bakery","deli","diner","lounge","club","market","pub","supper","food","foods",
]);
const plain = (s) =>
  String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, "and").replace(/[’']/g, "");
const nameTokens = (name) =>
  plain(name).split(/[^a-z0-9]+/).filter((t) => t.length > 1 && !CLASS_WORDS.has(t));

/** The resolved page must name the restaurant, not merely exist. */
function pageNamesTarget(text, ldName, name) {
  const tokens = nameTokens(name);
  if (!tokens.length) return false;
  const hay = plain(`${ldName || ""} ${String(text).slice(0, 120_000)}`);
  const hits = tokens.filter((t) => hay.includes(t)).length;
  return tokens.length === 1 ? hits === 1 : hits >= Math.max(2, Math.ceil(tokens.length / 2));
}

/**
 * Four domain shapes, because operators pick different ones: "Maxwells Trading"
 * is at maxwellstrading.com, "Cafe Roze" is at caferoze.com, "Bar Etoile" is at
 * baretoile.com. All are tried; verification decides which, if any, is real.
 */
function candidateUrls(target) {
  if (target.url) return [target.url];
  const p = plain(target.name).replace(/^the\s+/, "");
  const words = p.split(/\s+/).filter(Boolean);
  const full = p.replace(/[^a-z0-9]+/g, "");
  const short = nameTokens(target.name).join("");
  const firstTwo = words.slice(0, 2).join("").replace(/[^a-z0-9]+/g, "");
  const first = (words[0] ?? "").replace(/[^a-z0-9]+/g, "");
  const bases = [...new Set([full, short, firstTwo, first].filter((b) => b && b.length >= 4))];
  const out = [];
  for (const base of bases) { out.push(`https://www.${base}.com`); out.push(`https://${base}.com`); }
  return out.slice(0, 10);
}

/* ── field extraction: JSON-LD first, visible text second ───────────────── */
function ldNodes(jsonLd) {
  const out = [];
  const walk = (n) => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) return n.forEach(walk);
    out.push(n);
    for (const v of Object.values(n)) if (v && typeof v === "object") walk(v);
  };
  walk(jsonLd);
  return out;
}
function ldBusiness(jsonLd) {
  for (const n of ldNodes(jsonLd)) {
    const t = [].concat(n["@type"] ?? []).map(String);
    if (t.some((x) => LD_TYPES.test(x))) return n;
  }
  return null;
}
function addressFromLd(node, city, stateCode) {
  const a = node?.address;
  const addr = Array.isArray(a) ? a[0] : a;
  if (!addr || typeof addr !== "object") return null;
  const street = String(addr.streetAddress ?? "").trim();
  const loc = String(addr.addressLocality ?? "").trim();
  const region = String(addr.addressRegion ?? "").trim();
  const zip = String(addr.postalCode ?? "").trim();
  if (!street || !loc) return null;
  // A group site can carry a sibling branch. Only accept the target city.
  if (plain(loc) !== plain(city)) return null;
  if (region && plain(region) !== plain(stateCode) && region.length <= 2) return null;
  return `${street}, ${loc}, ${region || stateCode}${zip ? ` ${zip}` : ""}`.replace(/\s+/g, " ").trim();
}
const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function addressFromText(text, city, stateCode) {
  // Deliberately anchored on the target city and state: a street number alone
  // matches a hundred things on a page, and a group site lists other branches.
  const re = new RegExp(
    `(\\d{1,6}[^\\n,]{2,60}?),\\s*${escapeRe(city)}\\s*,?\\s*${escapeRe(stateCode)}\\b\\.?\\s*(\\d{5})?`,
    "i",
  );
  const m = String(text).match(re);
  if (!m) return null;
  const street = m[1].replace(/\s+/g, " ").trim();
  if (!/^\d/.test(street) || street.length < 6) return null;
  return `${street}, ${city}, ${stateCode}${m[2] ? ` ${m[2]}` : ""}`;
}
function phoneFrom(node, text) {
  const raw = String(node?.telephone ?? "").trim() ||
    (String(text).match(/\(?\b([2-9]\d{2})\)?[.\s-]?([2-9]\d{2})[.\s-]?(\d{4})\b/) ?? [])[0] || "";
  const digits = raw.replace(/\D/g, "").replace(/^1/, "");
  if (digits.length !== 10) return "";
  return `+1-${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}
function cuisineFrom(target, node) {
  if (Array.isArray(target.cuisineTags) && target.cuisineTags.length) return target.cuisineTags.slice(0, 3);
  const s = node?.servesCuisine;
  const list = (Array.isArray(s) ? s : [s]).filter(Boolean).map(String);
  return list.slice(0, 3).map((c) => c.replace(/\b\w/g, (m) => m.toUpperCase()));
}

/* ── resolve one target ─────────────────────────────────────────────────── */
async function resolveTarget(target, market) {
  const tried = [];
  for (const candidate of candidateUrls(target)) {
    if (isAggregator(candidate)) continue;
    const res = await fetchPage(candidate);
    tried.push(`${candidate} -> ${res.ok ? "200" : res.status || res.error}`);
    if (!res.ok) continue;
    const finalUrl = res.metadata?.finalUrl || candidate;
    if (isAggregator(finalUrl)) { tried.push(`${finalUrl} rejected: aggregator`); continue; }
    const text = res.markdown || "";
    if (text.length < 200) continue;
    if (PARKED_RE.test(text)) { tried.push(`${finalUrl} rejected: parked`); continue; }
    if (CLOSED_RE.test(text)) { tried.push(`${finalUrl} rejected: reads as closed`); continue; }
    const node = ldBusiness(res.jsonLd);
    if (!pageNamesTarget(text, node?.name, target.name)) { tried.push(`${finalUrl} rejected: does not name target`); continue; }
    if (!RESTAURANT_RE.test(text)) { tried.push(`${finalUrl} rejected: not a restaurant page`); continue; }

    const address =
      addressFromLd(node, market.city, market.stateCode) ??
      addressFromText(text, market.city, market.stateCode);
    if (!address) { tried.push(`${finalUrl} rejected: no ${market.city} address on page`); continue; }

    return {
      ok: true,
      listing: {
        title: target.name,
        website: finalUrl,
        ...(phoneFrom(node, text) ? { phone: phoneFrom(node, text) } : {}),
        address,
        cuisineTags: cuisineFrom(target, node),
      },
      tried,
    };
  }
  return { ok: false, tried };
}

/* Exported so the guards can be tested without touching the network. */
export { candidateUrls, pageNamesTarget, addressFromLd, addressFromText, phoneFrom, resolveTarget };

async function main() {
  /* ── run ────────────────────────────────────────────────────────────────── */
  const config = readJson(TARGETS, null);
  if (!config) throw new Error("scripts/data/seed-targets.json not found");

  const dataset = readJson(PATHS.dataset, { records: [] });
  const retired = retiredIndex(readJson(PATHS.retired, { records: [] }));
  const haveHost = new Set(dataset.records.map((r) => normalizeHost(r.website)).filter(Boolean));
  const havePhone = new Set(dataset.records.map((r) => normalizePhone(r.phone)).filter(Boolean));
  const haveNameCity = new Set(
    dataset.records.map((r) => `${plain(r.title)}|${plain(r.city || "")}`),
  );

  const markets = (config.markets ?? []).filter(
    (m) => !ONLY || plain(m.city) === ONLY || plain(m.key ?? "") === ONLY,
  );

  const startedAt = new Date().toISOString();
  const stamp = startedAt.slice(0, 10);
  const batches = [];
  const misses = [];
  let resolved = 0, attempted = 0;

  for (const market of markets) {
    const queue = [];
    for (const raw of market.targets ?? []) {
      const target = typeof raw === "string" ? { name: raw } : raw;
      const key = `${plain(target.name)}|${plain(market.city)}`;
      if (haveNameCity.has(key)) { misses.push({ market: market.city, name: target.name, reason: "already in corpus" }); continue; }
      if (isRetiredListing({ title: target.name }, market.city, retired)) {
        misses.push({ market: market.city, name: target.name, reason: "retired/closed" });
        continue;
      }
      queue.push(target);
    }

    const listings = [];
    let cursor = 0;
    const worker = async () => {
      while (cursor < queue.length && attempted < LIMIT) {
        const target = queue[cursor++];
        attempted += 1;
        const out = await resolveTarget(target, market);
        if (!out.ok) {
          misses.push({ market: market.city, name: target.name, reason: "unresolved", tried: out.tried });
          continue;
        }
        const host = normalizeHost(out.listing.website);
        const phone = normalizePhone(out.listing.phone);
        if (host && haveHost.has(host)) {
          misses.push({ market: market.city, name: target.name, reason: `duplicate host ${host}` });
          continue;
        }
        if (phone && havePhone.has(phone)) {
          misses.push({ market: market.city, name: target.name, reason: `duplicate phone` });
          continue;
        }
        if (host) haveHost.add(host);
        if (phone) havePhone.add(phone);
        haveNameCity.add(`${plain(target.name)}|${plain(market.city)}`);
        listings.push(out.listing);
        resolved += 1;
        process.stdout.write(`  + ${market.city}: ${out.listing.title} -> ${out.listing.website}\n`);
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    console.log(`${market.city}, ${market.stateCode}: ${listings.length} of ${queue.length} targets resolved`);
    if (listings.length) {
      batches.push({
        city: market.city,
        stateCode: market.stateCode,
        ...(market.queueCity ? { queueCity: market.queueCity } : {}),
        listings,
      });
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    attempted,
    resolved,
    missed: misses.length,
    misses,
  };
  const reportPath = path.join(root, "reports", `resolve-targets-${stamp}.json`);

  if (DRY) {
    console.log(`\nDry run — ${resolved} of ${attempted} targets resolved. Nothing written.`);
    process.exit(0);
  }

  const outPath = path.join(root, "src/data", `seed-listings-density-${stamp}-resolved.json`);
  writeJson(outPath, {
    note:
      "Resolved by scripts/pipeline/resolve-targets.mjs. Each entry's website was reached over plain HTTPS and verified to name the establishment and read as a restaurant; address and phone were taken from that page (JSON-LD first, visible text second) and the address was required to name the target city. Unresolved, parked, closed and unverifiable targets were dropped and are listed in the matching reports/resolve-targets file. Narrative first-party fields stay empty until enrich.mjs runs.",
    generatedAt: new Date().toISOString(),
    batches,
  });
  writeJson(reportPath, report);
  appendRun({ kind: "resolve-targets", startedAt, finishedAt: new Date().toISOString(), attempted, resolved, missed: misses.length, outPath });

  console.log(`\nResolved ${resolved} of ${attempted} targets across ${batches.length} markets.`);
  console.log(`  batch:  ${path.relative(root, outPath)}`);
  console.log(`  misses: ${path.relative(root, reportPath)}`);
  console.log("\nNext: node scripts/pipeline/seed-listings.mjs   then   node scripts/pipeline/enrich.mjs --hygiene");

}

import { pathToFileURL } from "node:url";
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
