import { describe, expect, it } from "vitest";
import {
  applyRetirement,
  isRetiredListing,
  retiredIndex,
  validateRetirementInput,
} from "./retire-closed.mjs";

const base = {
  slug: "no-9-park-boston",
  operator: "Barbara Lynch; Lorraine Tomlinson-Hall, COO",
  source: "https://boston.eater.com/2024/10/9/example",
  closedOn: "2024-12-31",
  quote: "No. 9 Park will close at the end of the year after service on December 31.",
};

describe("validateRetirementInput", () => {
  it("requires operator source closedOn and quote", () => {
    expect(validateRetirementInput({})).toEqual(
      expect.arrayContaining([
        "slug required",
        "named operator required",
        "source URL required",
        "closedOn YYYY-MM-DD required",
        "operator quote required",
      ]),
    );
  });

  it("refuses a successor rewrite", () => {
    expect(validateRetirementInput({ ...base, successorUrl: "https://ninerg.com/" })).toContain(
      "successor rewrite is not allowed; drop the slug instead",
    );
  });

  it("refuses Places / Firecrawl as the source", () => {
    expect(
      validateRetirementInput({ ...base, source: "https://places.googleapis.com/v1/places/abc" }),
    ).toContain("Google Places / Firecrawl are not operator sources");
  });

  it("accepts a named operator citation", () => {
    expect(validateRetirementInput(base)).toEqual([]);
  });
});

describe("isRetiredListing", () => {
  const index = retiredIndex({
    records: [{ slug: "no-9-park-boston", title: "No. 9 Park", city: "Boston", website: "https://www.no9park.com/" }],
  });

  it("matches host and name+city so a re-seed cannot revive the room", () => {
    expect(isRetiredListing({ title: "No. 9 Park", website: "https://no9park.com/" }, "Boston", index)).toBe(
      "retired-website",
    );
    expect(isRetiredListing({ title: "No. 9 Park" }, "Boston", index)).toBe("retired-name+city");
    expect(isRetiredListing({ title: "Nine" }, "Boston", index)).toBeNull();
  });
});

describe("applyRetirement", () => {
  it("drops the slug and enrichment and does not write a successor", () => {
    const dataset = {
      records: [
        { slug: "no-9-park-boston", title: "No. 9 Park", city: "Boston", region: "Boston, MA", website: "https://www.no9park.com/" },
        { slug: "oleana-boston", title: "Oleana", city: "Boston", region: "Boston, MA" },
      ],
    };
    const store = { records: { "no-9-park-boston": { meta: {} }, "oleana-boston": { meta: {} } } };
    const seeds = {
      batches: [
        {
          city: "Boston",
          listings: [
            { title: "No. 9 Park", website: "https://www.no9park.com/" },
            { title: "Oleana", website: "https://www.oleanarestaurant.com/" },
          ],
        },
      ],
    };
    const queue = { cities: [{ city: "Boston", stateCode: "MA", inserted: 15, status: "done" }] };
    const ledger = { records: [] };

    const result = applyRetirement({
      input: base,
      dataset,
      store,
      seeds,
      queue,
      ledger,
      retrievedAt: "2026-08-19T21:00:00.000Z",
    });

    expect(result.ok).toBe(true);
    expect(dataset.records.map((r) => r.slug)).toEqual(["oleana-boston"]);
    expect(store.records["no-9-park-boston"]).toBeUndefined();
    expect(seeds.batches[0].listings.map((l) => l.title)).toEqual(["Oleana"]);
    expect(queue.cities[0].inserted).toBe(14);
    expect(queue.cities[0].status).toBe("done");
    expect(ledger.records[0].successor).toBe("");
    expect(ledger.records[0].operator).toMatch(/Barbara Lynch/);
  });
});
