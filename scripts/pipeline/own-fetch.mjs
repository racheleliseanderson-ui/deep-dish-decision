/**
 * Owned website reader — no Firecrawl, no third-party scrape service.
 *
 * Fetches the restaurant's own public pages over plain HTTPS, parses
 * JSON-LD *before* stripping <script>, then collects readable text and
 * same-host links.
 *
 * JS-shell recovery (honesty-preserving):
 *   1. Prefer <main> / [role=main] / <article>, but fall back to <body>
 *      when the chosen region is under TEXT_FLOOR (false-shell fix).
 *   2. Keep useful <noscript> text; drop "enable JavaScript" stubs.
 *   3. Quote og/twitter description and hydration JSON into pageQuotes.
 *   4. Gated Playwright only when HTTP 200 text is still a shell and
 *      JSON-LD / hydration is not already rich, *or* when HTTP 403 is a
 *      Cloudflare/JS challenge interstitial. Honest UA — no stealth.
 *      Wait for innerText >= floor (cap 8s). Reuse one Chromium.
 *
 * Output shape matches what extractFromSite() already expects:
 *   { url, markdown, links, jsonLd, jsonLdQuotes, pageQuotes, rendered }
 */

import { createLimiter } from "./lib.mjs";

const UA =
  "RestaurantIntelligenceHub/1.0 (+https://github.com/racheleliseanderson-ui/deep-dish-decision; owned first-party reader)";

const FETCH_TIMEOUT_MS = 20_000;
export const TEXT_FLOOR = 400;
const PW_TEXT_WAIT_MS = 8_000;
const ENABLE_JS_RE =
  /enable javascript|enable js|turn on javascript|cookies to continue|please enable/i;
const IGNORE_JSON_ATTR =
  /wp-emoji|emoji-settings|webpack|vite-plugin|__NEXT_FONT|__framer/i;

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
const VENUE_KEYS = new Set([
  "telephone",
  "openingHours",
  "openingHoursSpecification",
  "hasMenu",
  "menu",
  "priceRange",
  "servesCuisine",
  "amenityFeature",
  "acceptsReservations",
]);

const JSONLD_RE =
  /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

function decodeEntities(value) {
  return String(value ?? "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return code > 0 && code < 0x10ffff ? String.fromCodePoint(code) : " ";
    })
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function roughTextLength(html) {
  return decodeEntities(String(html ?? "").replace(/<[^>]+>/g, " ")).length;
}

function sameHost(a, b) {
  try {
    const ha = new URL(a).host.replace(/^www\./, "");
    const hb = new URL(b).host.replace(/^www\./, "");
    return Boolean(ha) && ha === hb;
  } catch {
    return false;
  }
}

/** Balanced inner HTML for a tag that opened at `start`. */
export function balancedInner(html, tag, start) {
  const openRe = new RegExp(`<${tag}\\b[^>]*>`, "gi");
  const closeRe = new RegExp(`</${tag}\\s*>`, "gi");
  let depth = 1;
  let i = start;
  while (i < html.length && depth > 0) {
    openRe.lastIndex = i;
    closeRe.lastIndex = i;
    const nextOpen = openRe.exec(html);
    const nextClose = closeRe.exec(html);
    if (!nextClose) return null;
    if (nextOpen && nextOpen.index < nextClose.index) {
      depth += 1;
      i = nextOpen.index + nextOpen[0].length;
    } else {
      depth -= 1;
      if (depth === 0) return html.slice(start, nextClose.index);
      i = nextClose.index + nextClose[0].length;
    }
  }
  return null;
}

function innerOfTag(html, tag) {
  const open = new RegExp(`<${tag}\\b[^>]*>`, "i").exec(html);
  if (!open) return null;
  return balancedInner(html, tag, open.index + open[0].length);
}

function roleMainInner(html) {
  const open = /<([a-zA-Z0-9-]+)\b[^>]*\brole=["']main["'][^>]*>/i.exec(html);
  if (!open) return null;
  return balancedInner(html, open[1], open.index + open[0].length);
}

/**
 * Prefer main / role=main / article when they actually have content.
 * A short heading inside [role=main] is a false shell — fall back to body.
 */
export function pickContentRegion(cleaned) {
  const candidates = [innerOfTag(cleaned, "main"), roleMainInner(cleaned), innerOfTag(cleaned, "article")];
  const body = innerOfTag(cleaned, "body") ?? cleaned;
  for (const region of candidates) {
    if (region && roughTextLength(region) >= TEXT_FLOOR) return region;
  }
  return body;
}

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

function isVenueLike(node) {
  if (!node || typeof node !== "object" || Array.isArray(node)) return false;
  const types = [].concat(node["@type"] ?? []).map(String);
  if (types.some((t) => VENUE_TYPES.test(t))) return true;
  const keys = Object.keys(node).filter((k) => VENUE_KEYS.has(k));
  if (keys.some((k) => k === "openingHours" || k === "openingHoursSpecification" || k === "hasMenu")) {
    return true;
  }
  return keys.length >= 2;
}

function collectVenueLike(node, out, seen = new Set()) {
  if (!node || typeof node !== "object") return;
  if (seen.has(node) || out.length >= 20) return;
  seen.add(node);
  if (Array.isArray(node)) {
    for (const item of node) collectVenueLike(item, out, seen);
    return;
  }
  if (isVenueLike(node)) out.push(node);
  for (const value of Object.values(node)) {
    if (value && typeof value === "object") collectVenueLike(value, out, seen);
  }
}

/** Next/Nuxt/application/json blobs. Ignores wp-emoji and webpack settings. */
export function extractHydrationBlocks(html) {
  const blocks = [];
  if (!html) return blocks;
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1] || "";
    const body = String(m[2] ?? "").trim();
    if (!body || body.length < 20) continue;
    if (IGNORE_JSON_ATTR.test(attrs)) continue;
    const id = /id=["']([^"']+)["']/i.exec(attrs)?.[1] || "";
    const type = /type=["']([^"']+)["']/i.exec(attrs)?.[1] || "";
    if (/ld\+json/i.test(type)) continue;
    if (/__NEXT_DATA__|__NUXT_DATA__/i.test(id) || /application\/json/i.test(type)) {
      try {
        blocks.push(JSON.parse(body));
      } catch {
        /* ignore */
      }
      continue;
    }
    const nuxt = /window\.__NUXT__\s*=\s*(\{[\s\S]*\})\s*;?\s*$/.exec(body);
    if (nuxt) {
      try {
        blocks.push(JSON.parse(nuxt[1]));
      } catch {
        /* ignore */
      }
    }
  }
  return blocks;
}

export function flattenHydration(blocks) {
  const nodes = [];
  collectVenueLike(blocks, nodes);
  return nodes;
}

export function hydrationIsRich(nodes) {
  return jsonLdIsRich(nodes);
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
export function jsonLdQuotes(nodes, sourceUrl, label = "JSON-LD") {
  const quotes = [];
  const push = (kind, quote, extra = {}) => {
    const text = String(quote ?? "").replace(/\s+/g, " ").trim();
    if (!text) return;
    quotes.push({ kind, quote: text.slice(0, 260), sourceUrl, ...extra });
  };

  for (const n of nodes ?? []) {
    if (n.telephone) push("telephone", `${label} telephone: ${n.telephone}`);
    if (n.priceRange) push("price", `${label} priceRange: ${n.priceRange}`);
    if (n.servesCuisine) {
      const cuisine = Array.isArray(n.servesCuisine) ? n.servesCuisine.join(", ") : n.servesCuisine;
      push("cuisine", `${label} servesCuisine: ${cuisine}`);
    }
    if (n.openingHours) {
      const hours = Array.isArray(n.openingHours) ? n.openingHours.join("; ") : n.openingHours;
      push("hours", `${label} openingHours: ${hours}`);
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
      if (line) push("hours", `${label} openingHoursSpecification: ${line}`);
    }
    const features = n.amenityFeature ? [].concat(n.amenityFeature) : [];
    for (const f of features) {
      const name = amenityName(f);
      if (!name) continue;
      push(
        "amenity",
        `${label} amenityFeature (first-party statement, not a verified access route): ${name}`,
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

export function hydrationQuotes(nodes, sourceUrl) {
  return jsonLdQuotes(nodes, sourceUrl, "hydration");
}

/** Keep real fallback copy. Drop Cloudflare / "enable JS" stubs. */
export function extractUsefulNoscript(html) {
  const out = [];
  if (!html) return out;
  const re = /<noscript\b[^>]*>([\s\S]*?)<\/noscript>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const text = decodeEntities(String(m[1] ?? "").replace(/<[^>]+>/g, " "));
    if (text.length < 40) continue;
    if (ENABLE_JS_RE.test(text) && text.length < 160) continue;
    out.push(text);
  }
  return out;
}

function metaContent(html, key) {
  if (!html) return "";
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const named = new RegExp(
    `<meta\\b[^>]*(?:property|name)=["']${escaped}["'][^>]*>`,
    "i",
  ).exec(html)?.[0];
  if (named) {
    return decodeEntities(/content=["']([^"']*)["']/i.exec(named)?.[1] || "");
  }
  const reversed = new RegExp(
    `<meta\\b[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${escaped}["'][^>]*>`,
    "i",
  ).exec(html);
  return decodeEntities(reversed?.[1] || "");
}

/** og/twitter description and a long-enough <title> as quotes only. */
export function pageMetaQuotes(html, sourceUrl) {
  const quotes = [];
  const push = (kind, label, value) => {
    const text = decodeEntities(value);
    if (text.length < 24) return;
    quotes.push({
      kind,
      quote: `${label}: ${text}`.slice(0, 260),
      sourceUrl,
    });
  };
  const og = metaContent(html, "og:description");
  const twitter = metaContent(html, "twitter:description");
  const descr = metaContent(html, "description");
  const title = decodeEntities(/<title[^>]*>([^<]+)/i.exec(html)?.[1] || "");
  push("og", "og:description", og);
  if (twitter && twitter !== og) push("twitter", "twitter:description", twitter);
  if (descr && descr !== og && descr !== twitter) push("meta", "meta description", descr);
  if (title.length >= 24) push("title", "title", title);
  return quotes;
}

export function parseHtmlDocument(html, url) {
  const blocks = extractJsonLdBlocks(html);
  const nodes = flattenJsonLd(blocks);
  const quotes = jsonLdQuotes(nodes, url);
  const hydrationNodes = flattenHydration(extractHydrationBlocks(html));
  const { text, links, noscriptTexts } = htmlToTextAndLinks(html, url);
  const pageQuotes = [
    ...pageMetaQuotes(html, url),
    ...noscriptTexts.map((quote) => ({
      kind: "noscript",
      quote: `noscript: ${quote}`.slice(0, 260),
      sourceUrl: url,
    })),
    ...hydrationQuotes(hydrationNodes, url),
  ];
  return {
    text,
    links,
    jsonLd: nodes,
    jsonLdQuotes: quotes,
    pageQuotes,
    hydrationRich: hydrationIsRich(hydrationNodes),
  };
}

function playwrightWanted() {
  return process.env.RI_PLAYWRIGHT !== "0";
}

let playwrightTried = false;
let playwrightMod = null;
let pwChain = Promise.resolve();
let sharedBrowser = null;
let sharedBrowserFailed = false;

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

async function sharedChromium() {
  if (!playwrightWanted() || sharedBrowserFailed) return null;
  if (sharedBrowser) return sharedBrowser;
  const pw = await loadPlaywright();
  if (!pw?.chromium) {
    sharedBrowserFailed = true;
    return null;
  }
  try {
    sharedBrowser = await pw.chromium.launch({ headless: true });
    sharedBrowser.on("disconnected", () => {
      sharedBrowser = null;
    });
    return sharedBrowser;
  } catch {
    sharedBrowserFailed = true;
    return null;
  }
}

async function collectXhrQuotes(res, pageUrl) {
  try {
    if (res.status() !== 200) return [];
    const resUrl = res.url();
    if (!sameHost(resUrl, pageUrl)) return [];
    if (/\/_next\/static\/|\.js$/i.test(resUrl)) return [];
    const ct = String(res.headers()["content-type"] || "");
    if (!/json/i.test(ct) || /ld\+json/i.test(ct)) return [];
    const data = await res.json();
    const nodes = [];
    collectVenueLike(data, nodes);
    return hydrationQuotes(nodes, resUrl).slice(0, 12);
  } catch {
    return [];
  }
}

/**
 * Render a URL in Chromium. Serialized. Fail-closed if Playwright / browser
 * is missing. Honest UA — no stealth. Reuses one browser; waits for text.
 * @param {string} url
 * @returns {Promise<{ html: string, xhrQuotes: object[] } | null>}
 */
export async function renderWithPlaywright(url) {
  if (!playwrightWanted()) return null;
  const browser = await sharedChromium();
  if (!browser) return null;

  const task = pwChain.then(async () => {
    let page;
    try {
      page = await browser.newPage({ userAgent: UA });
      const pending = [];
      page.on("response", (res) => {
        pending.push(collectXhrQuotes(res, url));
      });
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25_000 });
      await page
        .waitForFunction(
          (floor) => (document.body?.innerText || "").trim().length >= floor,
          TEXT_FLOOR,
          { timeout: PW_TEXT_WAIT_MS },
        )
        .catch(() => {});
      const html = await page.content();
      const xhrQuotes = (await Promise.all(pending)).flat().slice(0, 12);
      return { html, xhrQuotes };
    } catch {
      return null;
    } finally {
      if (page) {
        try {
          await page.close();
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

export function shouldRenderPlaywright({ status, textLength, jsonLd, hydrationRich, html }) {
  if (!playwrightWanted()) return false;
  if (status === 403 && isChallengePage(html)) return true;
  if (status !== 200) return false;
  if ((textLength ?? 0) >= TEXT_FLOOR) return false;
  if (jsonLdIsRich(jsonLd)) return false;
  if (hydrationRich) return false;
  return true;
}

/** Cloudflare / WAF JS interstitial — not a venue page. */
export function isChallengePage(html) {
  if (!html) return false;
  const blob = String(html);
  const challenge =
    /just a moment|cf-browser-verification|challenge-platform|cdn-cgi\/challenge/i.test(blob);
  const stub =
    /enable javascript and cookies to continue|verify you are human|checking your browser/i.test(
      blob,
    );
  return challenge && stub;
}

export async function closeSharedBrowser() {
  if (!sharedBrowser) return;
  const browser = sharedBrowser;
  sharedBrowser = null;
  try {
    await browser.close();
  } catch {
    /* ignore */
  }
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
      let html = "";
      if (res.status === 403) {
        try {
          html = await res.text();
        } catch {
          html = "";
        }
      }
      return {
        ok: false,
        status: res.status,
        error: `HTTP ${res.status}`,
        retryAfter,
        html,
        challenge: isChallengePage(html),
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
    if (
      shouldRenderPlaywright({
        status: raw?.status,
        html: raw?.html,
        textLength: 0,
        jsonLd: [],
      })
    ) {
      const rendered = await renderWithPlaywright(url);
      if (rendered?.html && !isChallengePage(rendered.html)) {
        const parsed = parseHtmlDocument(rendered.html, url);
        if ((parsed.text || "").length >= 40) {
          return {
            ok: true,
            markdown: parsed.text,
            links: parsed.links,
            jsonLd: parsed.jsonLd,
            jsonLdQuotes: parsed.jsonLdQuotes,
            pageQuotes: [...(parsed.pageQuotes ?? []), ...(rendered.xhrQuotes ?? [])],
            metadata: {
              finalUrl: url,
              bytes: rendered.html.length,
              textLength: parsed.text.length,
              playwright: true,
              jsonLdNodes: parsed.jsonLd.length,
              challenge: true,
            },
          };
        }
      }
    }
    return {
      ok: false,
      status: raw?.status ?? 0,
      error: raw?.error ?? "fetch failed",
    };
  }

  let html = raw.html;
  let parsed = parseHtmlDocument(html, url);
  let playwright = false;
  let xhrQuotes = [];

  if (
    shouldRenderPlaywright({
      status: raw.status,
      textLength: parsed.text.length,
      jsonLd: parsed.jsonLd,
      hydrationRich: parsed.hydrationRich,
    })
  ) {
    const rendered = await renderWithPlaywright(url);
    if (rendered?.html && rendered.html.length > html.length) {
      html = rendered.html;
      parsed = parseHtmlDocument(html, url);
      xhrQuotes = rendered.xhrQuotes ?? [];
      playwright = true;
    }
  }

  return {
    ok: true,
    markdown: parsed.text,
    links: parsed.links,
    jsonLd: parsed.jsonLd,
    jsonLdQuotes: parsed.jsonLdQuotes,
    pageQuotes: [...(parsed.pageQuotes ?? []), ...xhrQuotes],
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
 * JSON-LD / hydration must be parsed *before* this runs (scripts are stripped).
 * @param {string} html
 * @param {string} baseUrl
 */
export function htmlToTextAndLinks(html, baseUrl) {
  const noscriptTexts = extractUsefulNoscript(html);
  // Drop non-content blocks early — JSON-LD lives in <script> and is gone after this.
  let cleaned = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, " ")
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  const region = pickContentRegion(cleaned);

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
        .replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/g, "'");
      const abs = new URL(decoded, baseUrl).href;
      if (/^https?:/i.test(abs)) linkSet.add(abs.split("#")[0]);
    } catch {
      /* ignore */
    }
  }

  // Block-ish tags → newlines so sentence splitting still works
  let text = decodeEntities(
    region
      .replace(/<(br|hr)\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6]|tr|section|article|header|footer|nav|blockquote)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " "),
  );
  if (noscriptTexts.length) {
    text = [text, ...noscriptTexts].filter(Boolean).join("\n\n");
  }

  return { text, links: [...linkSet], noscriptTexts };
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
    pageQuotes: home.pageQuotes,
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
        pageQuotes: page.pageQuotes,
        rendered: Boolean(page.metadata?.playwright),
      });
    }
  }
  return { pages, homeError: null };
}
