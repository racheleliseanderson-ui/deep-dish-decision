/**
 * First-party site extraction. Reads only the restaurant's own public pages
 * (never an aggregator) and records the sentence that supports each value so
 * the dossier can show its working.
 *
 * JSON-LD quotes (hours / telephone / amenityFeature / menu URL) land in
 * enrichment.site only. amenityFeature is never treated as a verified
 * access route. Nothing here writes dataset.json fields.
 */

const PAGE_HINTS = [
  { key: "menu", re: /\/(menus?|food|drinks?|wine|beverage)\b/i },
  { key: "reservations", re: /\/(reservations?|book|booking|reserve)\b/i },
  { key: "visit", re: /\/(visit|info|faq|hours|contact|policies|about)\b/i },
  { key: "private", re: /\/(private|events?|groups?|buyout)\b/i },
];

/** Up to three same-host supporting pages, one per hint category. */
export function pickSitePages(baseUrl, links = []) {
  let host;
  try {
    host = new URL(baseUrl).host.replace(/^www\./, "");
  } catch {
    return [];
  }
  const chosen = new Map();
  for (const raw of links) {
    if (typeof raw !== "string") continue;
    let u;
    try {
      u = new URL(raw, baseUrl);
    } catch {
      continue;
    }
    if (u.host.replace(/^www\./, "") !== host) continue;
    if (/\.(pdf|jpe?g|png|webp|gif|svg|ico|zip)$/i.test(u.pathname)) continue;
    for (const hint of PAGE_HINTS) {
      if (chosen.has(hint.key)) continue;
      if (hint.re.test(u.pathname)) chosen.set(hint.key, `${u.origin}${u.pathname}`);
    }
    if (chosen.size >= 3) break;
  }
  return [...chosen.values()].slice(0, 3);
}

const BOOKING_PLATFORMS = [
  ["OpenTable", /opentable\.com/i],
  ["Resy", /resy\.com/i],
  ["Tock", /exploretock\.com|tock\.com/i],
  ["SevenRooms", /sevenrooms\.com/i],
  ["Yelp Reservations", /yelp\.com\/reservations/i],
  ["Toast", /toasttab\.com/i],
  ["Google Reserve", /reserve\.google\.com/i],
];

const PHRASE_GROUPS = {
  dietaryLanguage: [
    /vegan/i,
    /vegetarian/i,
    /gluten[- ]free/i,
    /dairy[- ]free/i,
    /nut allerg/i,
    /allerg(y|ies|en)/i,
    /dietary restriction/i,
    /pescatarian/i,
    /halal/i,
    /kosher/i,
  ],
  accessibilityLanguage: [
    /wheelchair/i,
    /step[- ]free/i,
    /accessible (entrance|restroom|seating|entry)/i,
    /ADA/,
    /elevator/i,
    /service animal/i,
    /hearing loop/i,
  ],
  groupPolicyLanguage: [
    /part(y|ies) of (six|seven|eight|\d+)/i,
    /large part(y|ies)/i,
    /private (dining|room|event)/i,
    /buyout/i,
    /group (menu|reservation|booking)/i,
    /minimum spend/i,
  ],
  dressCodeLanguage: [
    /dress code/i,
    /smart casual/i,
    /business casual/i,
    /no (shorts|athletic wear|flip[- ]flops)/i,
    /jacket (is |are )?(required|preferred|suggested)/i,
    /come as you are/i,
  ],
  cancellationLanguage: [
    /cancel(lation)?s? (policy|fee|within|less than)/i,
    /no[- ]show fee/i,
    /card (is )?required to (hold|reserve)/i,
    /deposit/i,
    /prepaid|pre[- ]paid ticket/i,
  ],
};

function sentences(markdown) {
  return markdown
    .replace(/\r/g, "")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)]\([^)]*\)/g, "$1")
    .replace(/[#>*_`|]/g, " ")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length >= 24 && s.length <= 260);
}

function matchGroup(all, patterns, limit = 4) {
  const out = [];
  const seen = new Set();
  for (const { text, url } of all) {
    if (!patterns.some((p) => p.test(text))) continue;
    const key = text.toLowerCase().slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ quote: text, sourceUrl: url });
    if (out.length >= limit) break;
  }
  return out;
}

function collectJsonLdQuotes(pages) {
  const out = [];
  const seen = new Set();
  for (const page of pages) {
    for (const q of page.jsonLdQuotes ?? []) {
      const quote = typeof q === "string" ? q : q.quote;
      if (!quote) continue;
      const key = quote.toLowerCase().slice(0, 80);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        kind: q.kind ?? "jsonld",
        quote,
        sourceUrl: q.sourceUrl || page.url,
        url: q.url,
      });
    }
  }
  return out;
}

/** @param pages Array of { url, markdown, links, jsonLdQuotes? } already scraped. */
export function extractFromSite(pages, retrievedAt) {
  const all = [];
  for (const page of pages) {
    for (const text of sentences(page.markdown ?? "")) all.push({ text, url: page.url });
  }
  const links = pages.flatMap((p) => (p.links ?? []).filter((l) => typeof l === "string"));
  const jsonLd = collectJsonLdQuotes(pages);

  const jsonLdMenu = jsonLd.find((q) => q.kind === "menuUrl" && q.url)?.url ?? "";
  const jsonLdReserve = jsonLd.find((q) => q.kind === "reservationUrl" && q.url)?.url ?? "";

  const reservationUrl =
    links.find((l) => BOOKING_PLATFORMS.some(([, re]) => re.test(l))) ??
    links.find((l) => /\/(reservations?|book|reserve)\b/i.test(l)) ??
    jsonLdReserve ??
    "";
  const platform =
    BOOKING_PLATFORMS.find(([, re]) => re.test(reservationUrl))?.[0] ??
    (reservationUrl ? "Direct" : "");
  const menuUrl = links.find((l) => /\/(menus?|food|drinks?|wine)\b/i.test(l)) ?? jsonLdMenu ?? "";

  const dietary = matchGroup(all, PHRASE_GROUPS.dietaryLanguage);
  const accessibility = matchGroup(all, PHRASE_GROUPS.accessibilityLanguage);
  const group = matchGroup(all, PHRASE_GROUPS.groupPolicyLanguage);
  const dress = matchGroup(all, PHRASE_GROUPS.dressCodeLanguage, 2);
  const cancellation = matchGroup(all, PHRASE_GROUPS.cancellationLanguage, 3);

  const quotes = (items) => items.map((x) => (typeof x === "string" ? x : x.quote)).filter(Boolean);

  // JSON-LD amenity/hours/telephone stay in jsonLdLanguage — not folded into
  // accessibilityLanguage, so completeness does not treat schema flags as
  // a verified access route.
  const jsonLdLanguage = jsonLd
    .filter((q) => q.kind !== "menuUrl" && q.kind !== "reservationUrl")
    .map((q) => ({ quote: q.quote, sourceUrl: q.sourceUrl }));

  return {
    menuUrl,
    reservationUrl,
    reservationPlatform: platform,
    dietaryLanguage: quotes(dietary),
    accessibilityLanguage: quotes(accessibility),
    groupPolicy: group.length ? group[0].quote : "",
    groupPolicyLanguage: quotes(group),
    dressCode: dress.length ? dress[0].quote : "",
    cancellationLanguage: quotes(cancellation),
    jsonLdLanguage,
    pagesRead: pages.length,
    sourceUrls: pages.map((p) => p.url),
    retrievedAt,
    playwrightPages: pages.filter((p) => p.rendered).length,
  };
}
