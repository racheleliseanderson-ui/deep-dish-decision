import { describe, expect, it } from "vitest";

import { records } from "@/lib/dataset";
import { decisionBrief, emptySituation, scoreRecord } from "@/lib/intelligence";
import { buildPacketPdf, packetFilename } from "@/lib/packet-pdf";

function input(index = 0) {
  const record = records[index]!;
  const situation = { ...emptySituation, occasion: "Date night" as const, partySize: 2 };
  const scored = scoreRecord(record, situation);
  return {
    record,
    situation,
    scored,
    brief: decisionBrief(scored, situation),
    enrichment: true,
    generatedAt: "2026-01-01 00:00 UTC",
  };
}

describe("decision packet PDF", () => {
  it("emits a valid, paginated PDF", () => {
    const bytes = buildPacketPdf(input());
    const text = new TextDecoder("latin1").decode(bytes);
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(text).toContain("/Type /Catalog");
    expect(text).toContain("startxref");
    const pages = text.match(/\/Type \/Page[^s]/g) ?? [];
    expect(pages.length).toBeGreaterThanOrEqual(2);
    expect(bytes.byteLength).toBeGreaterThan(4000);
  });

  it("carries the verdict and every case-file layer", () => {
    const data = input();
    const text = new TextDecoder("latin1").decode(buildPacketPdf(data));
    expect(text).toContain("RESTAURANT DECISION PACKET");
    expect(text).toContain("Verdict".toUpperCase());
    expect(text).toContain("CONFIRMATION SCRIPT".split("").join(" "));
    if (data.scored.criticals.length) expect(text).toMatch(/C R I T I C A L/);
    if (data.scored.unknowns.length) expect(text).toMatch(/U N K N O W N S/);
  });

  it("is deterministic for identical input", () => {
    expect(buildPacketPdf(input())).toEqual(buildPacketPdf(input()));
  });

  it("names the file after the record slug", () => {
    expect(packetFilename(records[0]!)).toBe(`decision-packet-${records[0]!.slug}.pdf`);
  });
});
