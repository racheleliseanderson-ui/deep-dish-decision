import { describe, expect, it } from "vitest";
import { records } from "@/lib/dataset";
import { firstPartyMenuUrl, readMenuLink } from "@/lib/menu-link";

describe("readMenuLink", () => {
  it("calls a link on the restaurant's own domain a menu", () => {
    const read = readMenuLink("https://www.rossoblula.com/menu", "https://www.rossoblula.com/");
    expect(read?.kind).toBe("own");
    expect(read?.isMenu).toBe(true);
    expect(read?.label).toBe("Menu");
  });

  it("calls a link on an ordering platform a menu", () => {
    const read = readMenuLink(
      "https://napoliwy.hrpos.heartland.us/menu",
      "https://napolischeyenne.com/",
    );
    expect(read?.kind).toBe("platform");
    expect(read?.isMenu).toBe(true);
  });

  it("refuses press coverage and names the publisher", () => {
    const read = readMenuLink(
      "https://www.latimes.com/food/jonathan-gold/la-fo-gold-rossoblu-review-20170619-story.html",
      "https://www.rossoblula.com/",
    );
    expect(read?.kind).toBe("press");
    expect(read?.isMenu).toBe(false);
    expect(read?.label).toContain("latimes.com");
    expect(read?.label.toLowerCase()).not.toContain("menu");
  });

  it("names an off-domain host rather than passing it off as the restaurant's", () => {
    const read = readMenuLink("https://uchi.uchirestaurants.com/menu", "https://uchiaustin.com/");
    expect(read?.kind).toBe("offsite");
    expect(read?.isMenu).toBe(false);
    expect(read?.label).toContain("uchi.uchirestaurants.com");
  });

  it("emits nothing for a link it cannot place", () => {
    expect(firstPartyMenuUrl("not-a-url", "https://example.com")).toBeUndefined();
    expect(firstPartyMenuUrl("https://www.esquire.com/x", "https://example.com")).toBeUndefined();
  });
});

describe("the corpus", () => {
  it("stores no press coverage in menuUrl", () => {
    const offenders = records
      .map((r) => ({ slug: r.slug, read: readMenuLink(r.menuUrl, r.website) }))
      .filter((x) => x.read?.kind === "press")
      .map((x) => x.slug);
    expect(offenders).toEqual([]);
  });

  it("never claims a first-party menu path for a link it cannot verify", () => {
    const lying = records.filter(
      (r) => /own site/i.test(r.menuSummary ?? "") && !firstPartyMenuUrl(r.menuUrl, r.website),
    );
    expect(lying.map((r) => r.slug)).toEqual([]);
  });
});
