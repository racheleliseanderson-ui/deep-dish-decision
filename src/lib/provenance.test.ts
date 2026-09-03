import { describe, expect, it } from "vitest";
import {
  daysSince,
  freshnessBand,
  hostLabel,
  isPlatformHost,
  pageWord,
  provenanceOf,
  readDate,
  standingLine,
} from "@/lib/provenance";

/**
 * The provenance line is the one claim Deep Dish makes that an aggregate-review
 * product cannot: this page, that date. If the host is wrong or the date drifts
 * a day on a timezone boundary, the claim is worse than not making it.
 */

const base = {
  officialSource: "https://www.luccasitalian.com/",
  website: "https://www.luccasitalian.com/",
  sources: ["https://www.luccasitalian.com/", "https://www.luccasitalian.com/menu.php"],
  retrievedAt: "2026-08-05T20:30:00Z",
  unknownsCount: 4,
  unknownList: ["Current prices", "detailed dietary policy"],
  freshnessStatus: "CURRENT_AS_RETRIEVED",
  reviewDueSoon: false,
};

describe("hostLabel", () => {
  it("drops the www and keeps the rest", () => {
    expect(hostLabel("https://www.luccasitalian.com/menu.php")).toBe("luccasitalian.com");
  });

  it("returns null rather than a broken string for junk", () => {
    expect(hostLabel("luccasitalian")).toBeNull();
    expect(hostLabel("")).toBeNull();
    expect(hostLabel(undefined)).toBeNull();
  });

  it("knows a platform from a restaurant's own domain", () => {
    expect(isPlatformHost("facebook.com")).toBe(true);
    expect(isPlatformHost("www.resy.com")).toBe(true);
    expect(isPlatformHost("luccasitalian.com")).toBe(false);
  });
});

describe("readDate", () => {
  it("formats in UTC so the printed day never depends on the reader's clock", () => {
    expect(readDate("2026-08-05T20:30:00Z")).toBe("5 August 2026");
    expect(readDate("2026-08-05T20:30:00Z", "short")).toBe("5 Aug 2026");
    expect(readDate("2026-01-01T00:00:00Z")).toBe("1 January 2026");
  });

  it("says nothing when there is nothing to say", () => {
    expect(readDate("")).toBeNull();
    expect(readDate("not a date")).toBeNull();
  });
});

describe("age", () => {
  it("counts whole days and never goes negative", () => {
    const now = new Date("2026-09-03T12:00:00Z");
    expect(daysSince("2026-09-03T00:00:00Z", now)).toBe(0);
    expect(daysSince("2026-08-05T20:30:00Z", now)).toBe(28);
    expect(daysSince("2026-12-01T00:00:00Z", now)).toBe(0);
  });

  it("bands a read by how much of it is still likely to be true", () => {
    expect(freshnessBand(3)).toBe("recent");
    expect(freshnessBand(45)).toBe("recent");
    expect(freshnessBand(46)).toBe("settled");
    expect(freshnessBand(151)).toBe("aging");
    expect(freshnessBand(null)).toBe("unknown");
  });
});

describe("provenanceOf", () => {
  const now = new Date("2026-09-03T12:00:00Z");

  it("puts the front door first and does not count it twice", () => {
    const p = provenanceOf(base, now);
    expect(p.primaryHost).toBe("luccasitalian.com");
    expect(p.pages).toEqual([
      "https://www.luccasitalian.com/",
      "https://www.luccasitalian.com/menu.php",
    ]);
    expect(p.pageCount).toBe(2);
    expect(p.ownPageCount).toBe(2);
    expect(p.otherHosts).toEqual([]);
    expect(p.readLong).toBe("5 August 2026");
    expect(p.ageDays).toBe(28);
    expect(p.band).toBe("recent");
    expect(p.unknownCount).toBe(4);
  });

  it("separates the restaurant's own pages from the booking platform", () => {
    const p = provenanceOf(
      {
        ...base,
        sources: [
          "https://bottegarestaurant.com/",
          "https://bottegarestaurant.com/about/",
          "https://resy.com/cities/bhm/bottega-dining-room",
        ],
        officialSource: "https://bottegarestaurant.com/",
      },
      now,
    );
    expect(p.primaryIsPlatform).toBe(false);
    expect(p.ownPageCount).toBe(2);
    expect(p.otherHosts).toEqual(["resy.com"]);
  });

  it("does not call a Facebook page a site of their own", () => {
    const p = provenanceOf(
      {
        ...base,
        officialSource: "https://www.facebook.com/dianphorestaurant/",
        website: "",
        sources: ["https://www.facebook.com/dianphorestaurant/"],
        freshnessStatus: "SOURCE_LIMITED_OPERATOR_PLATFORM",
      },
      now,
    );
    expect(p.primaryIsPlatform).toBe(true);
    expect(p.standing).toContain("No site of their own");
  });

  it("keeps an undated record undated instead of guessing", () => {
    const p = provenanceOf({ ...base, retrievedAt: "" }, now);
    expect(p.readLong).toBeNull();
    expect(p.ageDays).toBeNull();
    expect(p.band).toBe("unknown");
  });
});

describe("phrasing helpers", () => {
  it("translates the stored enum and admits when it cannot", () => {
    expect(standingLine("OWNED_SITE_REVIEWED")).toContain("runs itself");
    expect(standingLine("SOMETHING_NEW")).toBeNull();
    expect(standingLine("")).toBeNull();
  });

  it("spells small page counts and gives up gracefully on large ones", () => {
    expect(pageWord(2)).toBe("two");
    expect(pageWord(12)).toBe("12");
  });
});
