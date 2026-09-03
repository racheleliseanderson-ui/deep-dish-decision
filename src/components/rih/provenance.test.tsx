import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProvenanceMasthead, ProvenanceTrace } from "@/components/rih/provenance";
import type { RestaurantRecord } from "@/lib/dataset";

/**
 * The masthead and the ranked-list trace are the two places a reader is told
 * where a line came from. Both are server-rendered, so both are checked as
 * strings here: the host has to be a real link, the date has to be printed,
 * and the count of things nobody stated has to survive.
 */

function makeRecord(over: Partial<RestaurantRecord> = {}): RestaurantRecord {
  return {
    slug: "luccas",
    title: "Lucca's",
    officialSource: "https://www.luccasitalian.com/",
    website: "https://www.luccasitalian.com/",
    sources: ["https://www.luccasitalian.com/", "https://www.luccasitalian.com/menu.php"],
    retrievedAt: new Date(Date.now() - 12 * 86_400_000).toISOString(),
    unknownsCount: 4,
    unknowns: "Current prices; detailed dietary policy.",
    unknownList: [
      "Current prices",
      "detailed dietary policy",
      "accessibility route and restroom configuration",
      "large-party capacity",
    ],
    freshnessStatus: "CURRENT_AS_RETRIEVED",
    reviewDueSoon: false,
    ...over,
  } as unknown as RestaurantRecord;
}

describe("ProvenanceMasthead", () => {
  it("links the host, prints the read date, and counts what was never stated", () => {
    const html = renderToStaticMarkup(<ProvenanceMasthead record={makeRecord()} />);
    expect(html).toContain('href="https://www.luccasitalian.com/"');
    expect(html).toContain("luccasitalian.com");
    expect(html).toContain("Read on");
    expect(html).toContain("12 days ago");
    expect(html).toContain("things the restaurant has not put in writing");
    expect(html).toContain("A blank means nobody said it");
  });

  it("does not round an old read down", () => {
    const html = renderToStaticMarkup(
      <ProvenanceMasthead
        record={makeRecord({
          retrievedAt: new Date(Date.now() - 210 * 86_400_000).toISOString(),
        })}
      />,
    );
    expect(html).toContain("210 days ago");
    expect(html).toContain("not going to round it down");
  });
});

describe("ProvenanceTrace", () => {
  it("carries host, date and open-question count onto a ranked card", () => {
    const html = renderToStaticMarkup(<ProvenanceTrace record={makeRecord()} />);
    expect(html).toContain("Read off");
    expect(html).toContain("luccasitalian.com");
    expect(html).toContain("things their pages never say");
  });

  it("adds the age only once a read is old enough for it to matter", () => {
    const fresh = renderToStaticMarkup(<ProvenanceTrace record={makeRecord()} />);
    expect(fresh).not.toContain("days back");
    const stale = renderToStaticMarkup(
      <ProvenanceTrace
        record={makeRecord({ retrievedAt: new Date(Date.now() - 90 * 86_400_000).toISOString() })}
      />,
    );
    expect(stale).toContain("90 days back");
  });
});
