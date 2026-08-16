import type { RestaurantRecord } from "@/lib/dataset";
import { SITUATION_SLOTS, situationDepth, type Brief, type Scored, type Situation } from "@/lib/intelligence";
import { PdfDoc } from "@/lib/pdf-writer";

/**
 * The decision packet as a downloadable file: verdict, situation of record,
 * every case-file layer (criticals, watch, unknowns), the confirmation script,
 * the evidence extract and the source limits — one document, no screenshots.
 *
 * Pure and isomorphic: takes already-scored inputs, returns bytes. The browser
 * wrapper below turns those bytes into a download.
 */

export type PacketInput = {
  record: RestaurantRecord;
  situation: Situation;
  scored: Scored;
  brief: Brief;
  /** Whether labeled third-party signals were included in the scoring run. */
  enrichment: boolean;
  /** Fixed stamp so callers control determinism (tests pass a literal). */
  generatedAt: string;
};

export function packetFilename(record: RestaurantRecord): string {
  return `decision-packet-${record.slug}.pdf`;
}

export function buildPacketPdf(input: PacketInput): Uint8Array {
  const { record: r, situation: s, scored: sc, brief } = input;
  const depth = situationDepth(s);
  const doc = new PdfDoc();

  /* Masthead */
  doc.text("SALTY & CLEVER  ·  RESTAURANT DECISION PACKET", {
    size: 8,
    font: "bold",
    gray: 0.45,
    tracking: 1,
    leading: 16,
  });
  doc.text(r.title, { size: 21, font: "bold", leading: 25 });
  doc.text(`${r.address || r.region} · ${r.recordId}`, { size: 9.5, gray: 0.4, leading: 14 });
  doc.text(
    `Fit ${sc.fit}/100 · confirm burden ${sc.burden}/100 · situation ${depth}/${SITUATION_SLOTS} · reviewed ${r.reviewedAt} · next review ${r.nextReviewAt}`,
    { size: 9, gray: 0.4, leading: 13 },
  );
  doc.text(
    `Generated ${input.generatedAt} · signals: ${input.enrichment ? "first-party plus labeled third-party" : "first-party only"}`,
    { size: 9, gray: 0.4, leading: 16 },
  );

  /* Verdict */
  doc.eyebrow("Verdict");
  doc.text(brief.verdict, { size: 13.5, font: "bold", leading: 17 });
  doc.space(4);
  for (const l of [brief.fitLine, brief.riskLine, brief.burdenLine]) {
    doc.text(l, { size: 10, gray: 0.3, leading: 14 });
  }
  doc.space(4);
  doc.text(brief.nextAction, { size: 10, font: "bold", leading: 14, indent: 10 });
  doc.space(8);

  /* Situation of record */
  doc.eyebrow("Situation of record");
  const lines: [string, string][] = [
    ["Occasion", s.occasion ?? "not stated"],
    ["Party", s.partySize ? `${s.partySize} guests` : "not stated"],
    ["Lead time", s.leadDays !== null ? `${s.leadDays} days` : "not stated"],
    ["Daypart", s.daypart ?? "not stated"],
    ["Spend band", s.spendBand ?? "not stated"],
    ["Planning tolerance", s.maxPlanningLoad ?? "not stated"],
    ["Commitment ceiling", s.maxCommitment ?? "not stated"],
    ["Constraints", s.constraints.length ? s.constraints.join("; ") : "none stated"],
  ];
  for (const [k, v] of lines) doc.row(k, v);
  if (depth < 3) {
    doc.space(4);
    doc.text(
      "This packet was generated from a thin situation. Treat the ordering and verdict as provisional until more of the night is described.",
      { size: 9, gray: 0.35, leading: 13 },
    );
  }
  doc.space(8);

  /* Case files, by layer */
  const layers: [string, typeof sc.criticals][] = [
    ["Critical risks", sc.criticals],
    ["Watch items", sc.watch],
    ["Residual unknowns — carried forward, not resolved", sc.unknowns],
  ];
  for (const [title, list] of layers) {
    if (!list.length) continue;
    doc.eyebrow(title);
    list.forEach((f, i) => {
      doc.text(`${i + 1}. ${f.title}`, { size: 10, font: "bold", leading: 14 });
      doc.text(f.detail, { size: 9.5, gray: 0.32, leading: 13, indent: 14 });
      doc.text(`-> ${f.action}`, { size: 9.5, gray: 0.18, leading: 13, indent: 14 });
      doc.space(4);
    });
    doc.space(6);
  }

  /* Confirmation script */
  doc.eyebrow("Confirmation script");
  const calls = brief.confirmCalls.length ? brief.confirmCalls : r.checklist;
  for (const c of calls) {
    doc.text(`[ ]  ${c}`, { size: 9.5, gray: 0.3, leading: 14 });
  }
  doc.space(4);
  doc.text(
    `Contact of record: ${r.hasPhone ? r.phone : "no phone published"}${r.reservationUrl ? ` · ${r.reservationUrl}` : ""}`,
    { size: 9, gray: 0.4, leading: 14 },
  );
  doc.space(8);

  /* Evidence extract */
  doc.eyebrow("Evidence extract");
  const evidence: [string, string][] = [
    ["Service", r.serviceSummary],
    ["Hours", r.hoursSummary],
    ["Reservations", r.reservationDetails],
    ["Price", r.priceDetails],
    ["Dietary", r.dietaryDetails],
    ["Access", r.accessibilityState],
    ["Parking / transit", r.parkingTransit],
    ["Dress", r.dressCode],
    ["Group", r.groupDetails],
    ["Meal length", r.typicalMealLength],
  ];
  for (const [k, v] of evidence) if (v) doc.row(k, v);
  doc.space(8);

  /* Sources and limits */
  doc.eyebrow("Sources and limits");
  for (const src of r.sources) doc.text(src, { size: 8.5, gray: 0.38, leading: 12 });
  doc.space(4);
  doc.text(
    `${r.sourceAuthority} · confidence ${r.confidence.replace(/_/g, " ")} · ${r.fieldVolatility}`,
    { size: 9, gray: 0.38, leading: 13 },
  );
  doc.text(r.disclaimer, { size: 9, gray: 0.38, leading: 13 });
  if (r.hasOfficialConflict) {
    doc.text(
      "An official conflict is open on this record. Both claims are preserved above; resolve it by direct contact before committing.",
      { size: 9, gray: 0.2, leading: 13 },
    );
  }

  return doc.build();
}

/** Browser-only: build the packet and hand it to the download stack. */
export function downloadPacketPdf(input: PacketInput): void {
  const bytes = buildPacketPdf(input);
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = packetFilename(input.record);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
