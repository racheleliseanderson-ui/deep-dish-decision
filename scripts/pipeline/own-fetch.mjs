/**
 * Owned website reader — no Firecrawl, no third-party scrape service, no extra deps.
 *
 * Fetches the restaurant's own public pages over plain HTTPS, strips markup
 * to readable text, and collects same-host links for supporting pages
 * (menu / reservations / visit / private events).
 *
 * Output shape matches what extractFromSite() already expects:
 *   { url, markdown, links }
 */

const UA =
  "RestaurantIntelligenceHub/1.0 (+https://github.com/racheleliseanderson-ui/deep-dish-decision; owned first-party reader)";

const FETCH_TIMEOUT_MS = 20_000;

/** @param {string} url */
export async function fetchPage(url) {
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
    if (!res.ok) {
      return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    }
    const html = await res.text();
    if (!html || html.length < 40) {
      return { ok: false, status: res.status, error: "empty body" };
    }
    const { text, links } = htmlToTextAndLinks(html, url);
    return {
      ok: true,
      markdown: text,
      links,
      metadata: { finalUrl: res.url || url, bytes: html.length },
    };
  } catch (err) {
    const msg = err?.name === "AbortError" ? "timeout" : String(err?.message ?? err);
    return { ok: false, status: 0, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Lightweight HTML → text + absolute links. No external parser dependency.
 * Good enough for policy-language sentence extraction; not a full browser.
 * @param {string} html
 * @param {string} baseUrl
 */
export function htmlToTextAndLinks(html, baseUrl) {
  // Drop non-content blocks early
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
  let text = region
    .replace(/<(br|hr)\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|header|footer|nav|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
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
    return { pages, homeError: `${home.status || "err"} ${home.error || ""}`.trim() };
  }
  pages.push({ url: siteUrl, markdown: home.markdown, links: home.links });

  const extras = typeof pickPages === "function" ? pickPages(siteUrl, home.links ?? []) : [];
  for (const extra of extras.slice(0, 3)) {
    const page = await fetchPage(extra);
    if (page.ok) {
      pages.push({ url: extra, markdown: page.markdown, links: page.links });
    }
  }
  return { pages, homeError: null };
}
