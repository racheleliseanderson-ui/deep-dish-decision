import { describe, expect, it } from "vitest";
import { completeness, hasStructuredSiteEvidence } from "./lib.mjs";
import { extractFromSite } from "./site.mjs";

const sourceUrl = "https://example.com/";
const structuredQuotes = [
  { kind: "telephone", quote: "JSON-LD telephone: +1-206-555-0100", sourceUrl },
  { kind: "hours", quote: "JSON-LD openingHours: Wed-Sat 17:00-22:00", sourceUrl },
  { kind: "price", quote: "JSON-LD priceRange: $$$$", sourceUrl },
  { kind: "cuisine", quote: "JSON-LD servesCuisine: Pacific Northwest", sourceUrl },
  {
    kind: "amenity",
    quote:
      "JSON-LD amenityFeature (first-party statement, not a verified access route): wheelchairAccessibleEntrance",
    sourceUrl,
  },
];

const shellRecord = {
  address: "123 Example St",
  phone: "",
  website: sourceUrl,
  coverageArea: "Example City, Washington",
  city: "Example City",
  cuisineContext: "",
  cuisineTags: [],
  hoursSummary: "",
  priceDetails: "",
  priceTags: [],
  reservationDetails: "",
  reservationUrl: "",
  menuUrl: "",
  menuSummary: "",
  dietaryDetails: "",
  accessibilityState: "",
  groupDetails: "",
  dressCode: "",
  atmosphereSummary: "",
  serviceSummary: "",
};

function legacySite(extra = {}) {
  return {
    jsonLdLanguage: structuredQuotes.map(({ quote, sourceUrl: source }) => ({
      quote,
      sourceUrl: source,
    })),
    sourceUrls: [sourceUrl],
    pagesRead: 1,
    ...extra,
  };
}

function enrichment(site) {
  return {
    site,
    meta: {
      lastEnrichedAt: "2026-08-20T00:00:00.000Z",
      matchStatus: "resolved",
    },
  };
}

describe("typed first-party structured evidence", () => {
  it("extracts telephone, hours, price and cuisine into explicit site arrays", () => {
    const site = extractFromSite(
      [
        {
          url: sourceUrl,
          markdown: "Seasonal cooking from the market is served throughout the week.",
          links: [],
          jsonLdQuotes: structuredQuotes,
          pageQuotes: [],
        },
      ],
      "2026-08-20T00:00:00.000Z",
    );

    expect(site.telephoneLanguage).toEqual(["JSON-LD telephone: +1-206-555-0100"]);
    expect(site.hoursLanguage).toEqual(["JSON-LD openingHours: Wed-Sat 17:00-22:00"]);
    expect(site.priceLanguage).toEqual(["JSON-LD priceRange: $$$$"]);
    expect(site.cuisineLanguage).toEqual(["JSON-LD servesCuisine: Pacific Northwest"]);
    expect(site.accessibilityLanguage).toEqual([]);
    expect(site.jsonLdLanguage.some((item) => /amenityFeature/i.test(item.quote))).toBe(true);
  });

  it("recognizes both new typed arrays and legacy typed jsonLdLanguage quotes", () => {
    expect(
      hasStructuredSiteEvidence(
        { telephoneLanguage: ["JSON-LD telephone: +1-206-555-0100"] },
        "telephone",
      ),
    ).toBe(true);

    const legacy = legacySite();
    expect(hasStructuredSiteEvidence(legacy, "telephone")).toBe(true);
    expect(hasStructuredSiteEvidence(legacy, "hours")).toBe(true);
    expect(hasStructuredSiteEvidence(legacy, "price")).toBe(true);
    expect(hasStructuredSiteEvidence(legacy, "cuisine")).toBe(true);
  });

  it("raises completeness from legacy first-party facts without treating amenity schema as access", () => {
    const result = completeness(shellRecord, enrichment(legacySite()));
    expect(result).toEqual({ filled: 11, total: 18, score: 61 });

    const withExplicitAccess = completeness(
      shellRecord,
      enrichment(legacySite({ accessibilityLanguage: ["Accessible entrance is on Example Street."] })),
    );
    expect(withExplicitAccess).toEqual({ filled: 12, total: 18, score: 67 });
  });
});
