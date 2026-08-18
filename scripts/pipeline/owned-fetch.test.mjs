import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createLimiter,
  parseRetryAfter,
  isRetriableStatus,
} from "./lib.mjs";
import {
  extractJsonLdBlocks,
  flattenJsonLd,
  jsonLdIsRich,
  jsonLdQuotes,
  parseHtmlDocument,
  shouldRenderPlaywright,
  classifyFetchError,
  extractUsefulNoscript,
  pageMetaQuotes,
  extractHydrationBlocks,
  flattenHydration,
  pickContentRegion,
  TEXT_FLOOR,
} from "./own-fetch.mjs";
import { extractFromSite } from "./site.mjs";

const RESTAURANT_LD = {
  "@context": "https://schema.org",
  "@type": "Restaurant",
  name: "Example Room",
  telephone: "+1-206-555-0100",
  priceRange: "$$$$",
  servesCuisine: "Pacific Northwest",
  openingHours: ["Wed-Sat 17:00-22:00"],
  hasMenu: "https://example.com/menu",
  amenityFeature: [{ "@type": "LocationFeatureSpecification", name: "wheelchairAccessibleEntrance" }],
};

const SHELL_HTML = `<!doctype html><html><body><div id="root"></div>
<script type="application/ld+json">${JSON.stringify(RESTAURANT_LD)}</script>
<script>window.__APP=1</script></body></html>`;

const LONG_COPY = `Reserve a table for dinner tonight at the bar. Walk-ins are welcome after eight. ${"Seasonal cooking from the market. ".repeat(20)}`;

describe("JSON-LD before script strip", () => {
  it("extracts application/ld+json before tags are thrown away", () => {
    const blocks = extractJsonLdBlocks(SHELL_HTML);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]["@type"]).toBe("Restaurant");
  });

  it("flattens @graph venue nodes and ignores WebSite", () => {
    const blocks = [
      {
        "@graph": [
          { "@type": "WebSite", name: "x" },
          { "@type": "Restaurant", telephone: "555" },
        ],
      },
    ];
    const nodes = flattenJsonLd(blocks);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].telephone).toBe("555");
  });

  it("marks a restaurant graph with hours/menu as rich", () => {
    expect(jsonLdIsRich(flattenJsonLd([RESTAURANT_LD]))).toBe(true);
    expect(jsonLdIsRich([{ "@type": "Restaurant" }])).toBe(false);
  });

  it("quotes amenityFeature as a statement, not a verified access route", () => {
    const quotes = jsonLdQuotes(flattenJsonLd([RESTAURANT_LD]), "https://example.com/");
    const amenity = quotes.find((q) => q.kind === "amenity");
    expect(amenity?.quote).toMatch(/not a verified access route/i);
    expect(quotes.some((q) => q.kind === "menuUrl" && q.url?.includes("/menu"))).toBe(true);
    expect(quotes.some((q) => q.kind === "hours")).toBe(true);
  });

  it("parseHtmlDocument still returns body text after JSON-LD is pulled out", () => {
    const parsed = parseHtmlDocument(
      `<html><body><p>Reserve a table for dinner tonight at the bar.</p>
       <script type="application/ld+json">${JSON.stringify(RESTAURANT_LD)}</script></body></html>`,
      "https://example.com/",
    );
    expect(parsed.text).toMatch(/Reserve a table/);
    expect(parsed.jsonLd).toHaveLength(1);
    expect(parsed.jsonLdQuotes.some((q) => q.kind === "telephone")).toBe(true);
  });
});

describe("extractFromSite quotes-only JSON-LD", () => {
  it("writes JSON-LD into site.jsonLdLanguage and menuUrl, not as access language", () => {
    const parsed = parseHtmlDocument(SHELL_HTML, "https://example.com/");
    const site = extractFromSite(
      [
        {
          url: "https://example.com/",
          markdown: parsed.text,
          links: parsed.links,
          jsonLdQuotes: parsed.jsonLdQuotes,
          pageQuotes: parsed.pageQuotes,
        },
      ],
      "2026-08-18T00:00:00Z",
    );
    expect(site.menuUrl).toBe("https://example.com/menu");
    expect(site.jsonLdLanguage.some((q) => /amenityFeature/i.test(q.quote))).toBe(true);
    expect(site.accessibilityLanguage).toEqual([]);
    expect(site.dressCode).toBe("");
  });
});

describe("Retry-After limiter", () => {
  it("parses delta-seconds and HTTP-date, capped at 60s", () => {
    expect(parseRetryAfter("2")).toBe(2000);
    expect(parseRetryAfter("0")).toBe(0);
    expect(parseRetryAfter("9999")).toBe(60_000);
    expect(parseRetryAfter("not-a-date")).toBeNull();
    const future = new Date(Date.now() + 5_000).toUTCString();
    const wait = parseRetryAfter(future);
    expect(wait).toBeGreaterThan(0);
    expect(wait).toBeLessThanOrEqual(60_000);
  });

  it("treats 408/425/429/5xx as retriable", () => {
    expect(isRetriableStatus(429)).toBe(true);
    expect(isRetriableStatus(503)).toBe(true);
    expect(isRetriableStatus(403)).toBe(false);
    expect(isRetriableStatus(200)).toBe(false);
  });

  it("honors Retry-After on 429 then returns the success", async () => {
    const limiter = createLimiter({ minDelayMs: 0, maxRetries: 3 });
    const calls = [];
    const started = Date.now();
    const res = await limiter.run(async () => {
      calls.push(1);
      if (calls.length === 1) return { status: 429, retryAfter: "0" };
      return { status: 200, ok: true };
    });
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(2);
    expect(limiter.stats.retries).toBe(1);
    expect(Date.now() - started).toBeLessThan(5_000);
  });
});

describe("Playwright gate", () => {
  const prev = process.env.RI_PLAYWRIGHT;
  afterEach(() => {
    if (prev === undefined) delete process.env.RI_PLAYWRIGHT;
    else process.env.RI_PLAYWRIGHT = prev;
    vi.unstubAllEnvs();
  });

  it("does not render when text is above the floor", () => {
    expect(
      shouldRenderPlaywright({
        status: 200,
        textLength: TEXT_FLOOR + 10,
        jsonLd: [],
      }),
    ).toBe(false);
  });

  it("does not render when JSON-LD is already rich", () => {
    expect(
      shouldRenderPlaywright({
        status: 200,
        textLength: 40,
        jsonLd: flattenJsonLd([RESTAURANT_LD]),
      }),
    ).toBe(false);
  });

  it("does not render when hydration is already rich", () => {
    expect(
      shouldRenderPlaywright({
        status: 200,
        textLength: 12,
        jsonLd: [],
        hydrationRich: true,
      }),
    ).toBe(false);
  });

  it("does not render on non-200", () => {
    expect(shouldRenderPlaywright({ status: 403, textLength: 10, jsonLd: [] })).toBe(false);
  });

  it("would render a 200 JS shell with no rich JSON-LD", () => {
    process.env.RI_PLAYWRIGHT = "1";
    expect(shouldRenderPlaywright({ status: 200, textLength: 12, jsonLd: [] })).toBe(true);
  });

  it("skips when RI_PLAYWRIGHT=0", () => {
    process.env.RI_PLAYWRIGHT = "0";
    expect(shouldRenderPlaywright({ status: 200, textLength: 12, jsonLd: [] })).toBe(false);
  });
});

describe("classifyFetchError", () => {
  it("maps AbortError and connect timeouts to 408", () => {
    expect(classifyFetchError({ name: "AbortError", message: "This operation was aborted" })).toEqual({
      status: 408,
      error: "timeout",
    });
    expect(
      classifyFetchError({ name: "TypeError", message: "fetch failed", cause: { code: "UND_ERR_CONNECT_TIMEOUT" } }),
    ).toEqual({ status: 408, error: "timeout:UND_ERR_CONNECT_TIMEOUT" });
  });

  it("keeps TLS and DNS codes on status 0", () => {
    expect(
      classifyFetchError({ name: "TypeError", message: "fetch failed", cause: { code: "ENOTFOUND" } }),
    ).toEqual({ status: 0, error: "fetch failed:ENOTFOUND" });
    expect(
      classifyFetchError({ name: "TypeError", message: "fetch failed", cause: { code: "CERT_HAS_EXPIRED" } }),
    ).toEqual({ status: 0, error: "fetch failed:CERT_HAS_EXPIRED" });
  });
});

describe("false-shell region picker", () => {
  it("keeps a long [role=main] even when the first child is a short heading", () => {
    const html = `<body><div role="main"><h1>NoMad</h1><p>${LONG_COPY}</p></div></body>`;
    const region = pickContentRegion(html);
    expect(region).toMatch(/Seasonal cooking/);
    expect(region).not.toBe("NoMad");
  });

  it("falls back to body when [role=main] is only a title", () => {
    const html = `<body><div role="main"><h1>Info</h1></div><p>${LONG_COPY}</p></body>`;
    const region = pickContentRegion(html);
    expect(region).toMatch(/Seasonal cooking/);
    const parsed = parseHtmlDocument(
      `<html>${html}</html>`,
      "https://example.com/info/",
    );
    expect(parsed.text.length).toBeGreaterThan(TEXT_FLOOR);
    expect(
      shouldRenderPlaywright({
        status: 200,
        textLength: parsed.text.length,
        jsonLd: parsed.jsonLd,
        hydrationRich: parsed.hydrationRich,
      }),
    ).toBe(false);
  });
});

describe("noscript + meta + hydration quotes", () => {
  it("keeps useful noscript and drops Cloudflare enable-JS stubs", () => {
    const useful = extractUsefulNoscript(
      `<noscript><p>Hours: Wednesday through Saturday 5pm to 10pm. Vegetarian tasting available.</p></noscript>`,
    );
    expect(useful.join(" ")).toMatch(/Wednesday through Saturday/);
    const stub = extractUsefulNoscript(`<noscript>Enable JavaScript and cookies to continue</noscript>`);
    expect(stub).toEqual([]);
  });

  it("quotes og:description and ignores wp-emoji JSON", () => {
    const html = `<html><head>
      <title>Roe | Elevated Comfort Food</title>
      <meta property="og:description" content="Roe is a Bellingham restaurant serving elevated comfort dishes with dinner-party vibes.">
      </head><body><p>Hi</p>
      <script id="wp-emoji-settings" type="application/json">{"baseUrl":"https://s.w.org/images/core/emoji/17.0.2/72x72/"}</script>
      </body></html>`;
    const meta = pageMetaQuotes(html, "https://eatroe.com/");
    expect(meta.some((q) => q.kind === "og" && /dinner-party/i.test(q.quote))).toBe(true);
    expect(flattenHydration(extractHydrationBlocks(html))).toEqual([]);
  });

  it("quotes venue facts from __NEXT_DATA__ and does not treat them as access language", () => {
    const html = `<html><body><div id="root"></div>
      <script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
        props: {
          pageProps: {
            venue: {
              "@type": "Restaurant",
              telephone: "+1-212-555-0199",
              openingHours: "We-Sa 17:00-22:00",
            },
          },
        },
      })}</script></body></html>`;
    const parsed = parseHtmlDocument(html, "https://example.com/");
    expect(parsed.hydrationRich).toBe(true);
    expect(parsed.pageQuotes.some((q) => /hydration telephone/i.test(q.quote))).toBe(true);
    const site = extractFromSite(
      [
        {
          url: "https://example.com/",
          markdown: parsed.text,
          links: parsed.links,
          jsonLdQuotes: parsed.jsonLdQuotes,
          pageQuotes: parsed.pageQuotes,
        },
      ],
      "2026-08-18T00:00:00Z",
    );
    expect(site.jsonLdLanguage.some((q) => /hydration telephone/i.test(q.quote))).toBe(true);
    expect(site.accessibilityLanguage).toEqual([]);
  });
});
