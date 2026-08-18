/**
 * Owned website reader — no Firecrawl, no third-party scrape service.
 *
 * Fetches the restaurant's own public pages over plain HTTPS, parses
 * JSON-LD *before* stripping <script>, then collects readable text and
 * same-host links. A gated Playwright render runs only when HTTP 200
 * text is below the floor and JSON-LD is not already rich.
 *
 * Output shape matches what extractFromSite() already expects:
 *   { url, markdown, links, jsonLd, jsonLdQuotes, rendered }
 */

import { createLimiter } from "./lib.mjs";

const UA =
  "RestaurantIntelligenceHub/1.0 (+https://github.com/racheleliseanderson-ui/deep-dish-decision; owned first-party reader)";

const FETCH_TIMEOUT_MS = 20_000;
export const TEXT_FLOOR = 400;

/** Surface Node fetch cause codes. Connect timeouts become 408 so the limiter retries. */
export function classifyFetchError(err) {
  if (!err) return { status: 0, error: "fetch failed" };
  if (err.name === "AbortError") return { status: 408, error: "timeout" };
  const code = err.cause?.code || err.code || "";
  const msg = String(err.message ?? err);
  if (
    code === "UND_ERR_CONNECT_TIMEOUT" ||
    code === "UND_ERR_HEADERS_TIMEOUT" ||
    code === "ETIMEDOUT"
  ) {
    return { status: 408, error: `timeout:${code}` };
  }
  const error = code && !String(msg).includes(code) ? `${msg}:${code}` : msg;
  return { status: 0, error };
}

/** Shared limiter: one in-flight owned fetch, Retry-After honored. */
export const siteLimiter = createLimiter({ minDelayMs: 400, maxRetries: 5 });

const VENUE_TYPES = /Restaurant|FoodEstablishment|LocalBusiness|BarOrPub|CafeOrCoffeeShop|Bakery|Winery|Brewery|Distillery/i;

const JSONLD_RE =
  /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

/** @param {string} html */
export function extractJsonLdBlocks(html) {
  const blocks = [];
  if (!html) return blocks;
  JSONLD_RE.lastIndex = 0;
  let m;
  while ((m = JSONLD_RE.exec(html)) !== null) {
    const raw = String(m[1] ?? "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .trim();
    if (!raw) continue;
    try {
      blocks.push(JSON.parse(raw));
    } catch {
      /* ignore malformed JSON-LD */
    }
  }
  return blocks;
}

function walkNodes(node, out) {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const item of node) walkNodes(item, out);
    return;
  }
  if (typeof node !== "object") return;
  if (node["@graph"]) walkNodes(node["@graph"], out);
  const types = [].concat(node["@type"] ?? []).map(String);
  if (types.some((t) => VENUE_TYPES.test(t))) out.push(node);
}

/** Flatten @graph / arrays into venue-like nodes. */
export function flattenJsonLd(blocks) {
  const nodes = [];
  walkNodes(blocks, nodes);
  return nodes;
}

function asUrl(value) {
  if (!value) return "";
  if (typeof value === "string") return /^https?:\/\//i.test(value) ? value : "";
  if (typeof value === "object") {
    if (typeof value.url === "string" && /^https?:\/\//i.test(value.url)) return value.url;
    if (typeof value["@id"] === "string" && /^https?:\/\//i.test(value["@id"])) return value["@id"];
  }
  return "";
}

function amenityName(feature) {
  if (!feature) return "";
  if (typeof feature === "string") return feature.trim();
  const name = feature.name ?? feature.value ?? feature["@type"] ?? "";
  return String(name).trim();
}

/** True when JSON-LD already carries useful venue facts — skip Playwright. */
export function jsonLdIsRich(nodes) {
  return (nodes ?? []).some(
    (n) =>
      n.openingHours ||
      n.openingHoursSpecification ||
      n.telephone ||
      n.menu ||
      n.hasMenu ||
      n.acceptsReservations ||
      n.amenityFeature ||
      n.priceRange ||
      n.servesCuisine,
  );
}

/**
 * Quote JSON-LD fields for enrichment.site only.
 * amenityFeature is a first-party statement, never a verified access route.
 * @param {object[]} nodes
 * @param {string} sourceUrl
 */
export function jsonLdQuotes(nodes, sourceUrl) {
  const quotes = [];
  const push = (kind, quote, extra = {}) => {
    const text = String(quote ?? "").replace(/\s+/g, " ").trim();
    if (!text) return;
    quotes.push({ kind, quote: text.slice(0, 260), sourceUrl, ...extra });
  };

  for (const n of nodes ?? []) {
    if (n.telephone) push("telephone", `JSON-LD telephone: ${n.telephone}`);
    if (n.priceRange) push("price", `JSON-LD priceRange: ${n.priceRange}`);
    if (n.servesCuisine) {
      const cuisine = Array.isArray(n.servesCuisine) ? n.servesCuisine.join(", ") : n.servesCuisine;
      push("cuisine", `JSON-LD servesCuisine: ${cuisine}`);
    }
    if (n.openingHours) {
      const hours = Array.isArray(n.openingHours) ? n.openingHours.join("; ") : n.openingHours;
      push("hours", `JSON-LD openingHours: ${hours}`);
    }
    const specs = n.openingHoursSpecification
      ? [].concat(n.openingHoursSpecification)
      : [];
    for (const spec of specs) {
      if (!spec || typeof spec !== "object") continue;
      const days = []
        .concat(spec.dayOfWeek ?? [])
        .map((d) => String(d).replace(/^https?:\/\/schema\.org\//, ""))
        .join(",");
      const line = [days, spec.opens, spec.closes].filter(Boolean).join(" ");
      if (line) push("hours", `JSON-LD openingHoursSpecification: ${line}`);
    }
    const features = n.amenityFeature ? [].concat(n.amenityFeature) : [];
    for (const f of features) {
      const name = amenityName(f);
      if (!name) continue;
      push(
        "amenity",
        `JSON-LD amenityFeature (first-party statement, not a verified access route): ${name}`,
      );
    }
    const menuUrl = asUrl(n.hasMenu) || asUrl(n.menu);
    if (menuUrl) push("menuUrl", menuUrl, { url: menuUrl });
    const reserve =
      asUrl(n.acceptsReservations) ||
      asUrl(n.potentialAction?.target) ||
      asUrl(n.potentialAction);
    if (reserve) push("reservationUrl", reserve, { url: reserve });
  }
  return quotes;
}

export function parseHtmlDocument(html, url) {
  const blocks = extractJsonLdBlocks(html);
  const nodes = flattenJsonLd(blocks);
  const quotes = jsonLdQuotes(nodes, url);
  const { text, links } = htmlToTextAndLinks(html, url);
  return { text, links, jsonLd: nodes, jsonLdQuotes: quotes };
}

function playwrightWanted() {
  return process.env.RI_PLAYWRIGHT !== "0";
}

let playwrightTried = false;
let playwrightMod = null;
let pwChain = Promise.resolve();

async function loadPlaywright() {
  if (playwrightTried) return playwrightMod;
  playwrightTried = true;
  if (!playwrightWanted()) return null;
  try {
    playwrightMod = await import("playwright");
  } catch {
    playwrightMod = null;
  }
  return playwrightMod;
}

/**
 * Render a URL in Chromium. Serialized. Fail-closed if Playwright / browser
 * is missing. Honest UA — no stealth.
 * @param {string} url
 * @returns {Promise<string | null>}
 */
export async function renderWithPlaywright(url) {
  if (!playwrightWanted()) return null;
  const pw = await loadPlaywright();
  if (!pw?.chromium) return null;

  const task = pwChain.then(async () => {
    let browser;
    try {
      browser = await pw.chromium.launch({ headless: true });
      const page = await browser.newPage({ userAgent: UA });
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25_000 });
      await new Promise((r) => setTimeout(r, 1_500));
      return await page.content();
    } catch {
      return null;
    } finally {
      if (browser) {
        try {
          await browser.close();
        } catch {
          /* ignore */
        }
      }
    }
  });
  pwChain = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}

export function shouldRenderPlaywright({ status, textLength, jsonLd }) {
  if (!playwrightWanted()) return false;
  if (status !== 200) return false;
  if ((textLength ?? 0) >= TEXT_FLOOR) return false;
  if (jsonLdIsRich(jsonLd)) return false;
  return true;
}

async function fetchOnce(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.8",
      },
    });
    const retryAfter = res.headers.get("retry-after");
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: `HTTP ${res.status}`,
        retryAfter,
      };
    }
    const html = await res.text();
    if (!html || html.length < 40) {
      return { ok: false, status: res.status, error: "empty body", retryAfter };
    }
    return {
      ok: true,
      status: res.status,
      html,
      retryAfter,
      finalUrl: res.url || url,
    };
  } catch (err) {
    const classified = classifyFetchError(err);
    return { ok: false, status: classified.status, error: classified.error };
  } finally {
    clearTimeout(timer);
  }
}

/** @param {string} url */
export async function fetchPage(url) {
  const raw = await siteLimiter.run(() => fetchOnce(url));
  if (!raw || !raw.ok) {
    return {
      ok: false,
      status: raw?.status ?? 0,
      error: raw?.error ?? "fetch failed",
    };
  }

  let html = raw.html;
  let parsed = parseHtmlDocument(html, url);
  let playwright = false;

  if (shouldRenderPlaywright({ status: raw.status, textLength: parsed.text.length, jsonLd: parsed.jsonLd })) {
    const rendered = await renderWithPlaywright(url);
    if (rendered && rendered.length > html.length) {
      html = rendered;
      parsed = parseHtmlDocument(html, url);
      playwright = true;
    }
  }

  return {
    ok: true,
    markdown: parsed.text,
    links: parsed.links,
    jsonLd: parsed.jsonLd,
    jsonLdQuotes: parsed.jsonLdQuotes,
    metadata: {
      finalUrl: raw.finalUrl || url,
      bytes: html.length,
      textLength: parsed.text.length,
      playwright,
      jsonLdNodes: parsed.jsonLd.length,
    },
  };
}

/**
 * Lightweight HTML → text + absolute links. No external parser dependency.
 * Good enough for policy-language sentence extraction; not a full browser.
 * JSON-LD must be parsed *before* this runs (scripts are stripped here).
 * @param {string} html
 * @param {string} baseUrl
 */
export function htmlToTextAndLinks(html, baseUrl) {
  // Drop non-content blocks early — JSON-LD lives in <script> and is gone after this.
  let cleaned = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, " ")
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  // Prefer <main> / role=main / <article> when present
  const mainMatch =
    cleaned.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i) ||
    cleaned.match(/<[^>]+role=["']main["'][^>]*>([\s\S]*?)<\/[^>]+>/i) ||
    cleaned.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  const bodyMatch = cleaned.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  const region = mainMatch?.[1] ?? bodyMatch?.[1] ?? cleaned;

  // Collect hrefs from the full document (better coverage for menu/reserve links)
  const linkSet = new Set();
  const hrefRe = /<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = hrefRe.exec(cleaned)) !== null) {
    const href = m[1].trim();
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) {
      continue;
    }
    try {
      const decoded = href
        .replace(/&/gi, "&")
        .replace(/"/gi, '"')
        .replace(/&#39;/g, "'");
      const abs = new URL(decoded, baseUrl).href;
      if (/^https?:/i.test(abs)) linkSet.add(abs.split("#")[0]);
    } catch {
      /* ignore */
    }
  }

  // Block-ish tags → newlines so sentence splitting still works
  let text = region
    .replace(/<(br|hr)\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|header|footer|nav|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&/gi, "&")
    .replace(/</gi, "<")
    .replace(/>/gi, ">")
    .replace(/"/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return code > 0 && code < 0x10ffff ? String.fromCodePoint(code) : " ";
    })
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  return { text, links: [...linkSet] };
}

/**
 * Fetch homepage + up to three same-host supporting pages.
 * @param {string} siteUrl
 * @param {(baseUrl: string, links: string[]) => string[]} pickPages
 */
export async function fetchSitePages(siteUrl, pickPages) {
  const pages = [];
  const home = await fetchPage(siteUrl);
  if (!home.ok) {
    return { pages, homeError: `${home.status ?? "err"} ${home.error || ""}`.trim() };
  }
  pages.push({
    url: siteUrl,
    markdown: home.markdown,
    links: home.links,
    jsonLd: home.jsonLd,
    jsonLdQuotes: home.jsonLdQuotes,
    rendered: Boolean(home.metadata?.playwright),
  });

  const extras = typeof pickPages === "function" ? pickPages(siteUrl, home.links ?? []) : [];
  for (const extra of extras.slice(0, 3)) {
    const page = await fetchPage(extra);
    if (page.ok) {
      pages.push({
        url: extra,
        markdown: page.markdown,
        links: page.links,
        jsonLd: page.jsonLd,
        jsonLdQuotes: page.jsonLdQuotes,
        rendered: Boolean(page.metadata?.playwright),
      });
    }
  }
  return { pages, homeError: null };
}
