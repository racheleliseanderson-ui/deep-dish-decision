/**
 * Minimal, dependency-free PDF writer.
 *
 * The decision packet is text — verdict, findings, script, evidence, sources —
 * so it does not need a rendering engine. This emits a valid single-file PDF
 * with the two base-14 Helvetica faces, WinAnsi text, wrapped paragraphs and
 * automatic pagination. Deterministic: same input, same bytes.
 */

export const PAGE = { width: 612, height: 792, margin: 54 } as const;

export type FontId = "regular" | "bold";

/** Coarse Helvetica advance widths (fraction of font size) by character class. */
const NARROW = new Set("ijltfrI.,;:'!|[]()-` ".split(""));
const WIDE = new Set("mwMW@%".split(""));

export function textWidth(text: string, size: number, font: FontId): number {
  let units = 0;
  for (const ch of text) {
    if (NARROW.has(ch)) units += 0.3;
    else if (WIDE.has(ch)) units += 0.87;
    else if (ch >= "A" && ch <= "Z") units += 0.69;
    else if (ch >= "0" && ch <= "9") units += 0.556;
    else units += 0.53;
  }
  if (font === "bold") units *= 1.06;
  return units * size;
}

export function wrapText(text: string, size: number, font: FontId, maxWidth: number): string[] {
  const words = String(text).replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && textWidth(next, size, font) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

/** WinAnsi octal escapes for the punctuation this app actually emits. */
const WINANSI: Record<string, string> = {
  "—": "\\227",
  "–": "\\226",
  "·": "\\267",
  "’": "\\222",
  "‘": "\\221",
  "“": "\\223",
  "”": "\\224",
  "→": "->",
  "←": "<-",
  "…": "\\205",
  "≈": "~",
  "×": "\\327",
  "•": "\\225",
  "é": "\\351",
  "è": "\\350",
  "ñ": "\\361",
  "á": "\\341",
  "í": "\\355",
  "ó": "\\363",
  "ú": "\\372",
  "ü": "\\374",
  "ç": "\\347",
  "ô": "\\364",
  "â": "\\342",
  "ê": "\\352",
  "ö": "\\366",
  "å": "\\345",
  "ø": "\\370",
};

function escapePdfText(text: string): string {
  let out = "";
  for (const ch of text) {
    if (ch === "\\") out += "\\\\";
    else if (ch === "(") out += "\\(";
    else if (ch === ")") out += "\\)";
    else if (WINANSI[ch]) out += WINANSI[ch];
    else if (ch.charCodeAt(0) < 32) out += " ";
    else if (ch.charCodeAt(0) > 126) out += "?";
    else out += ch;
  }
  return out;
}

/** A page-aware content stream builder that paginates as content is added. */
export class PdfDoc {
  private pages: string[] = [];
  private current = "";
  private y = PAGE.height - PAGE.margin;

  get contentWidth() {
    return PAGE.width - PAGE.margin * 2;
  }

  get cursor() {
    return this.y;
  }

  private ensure(space: number) {
    if (this.y - space >= PAGE.margin) return;
    this.pages.push(this.current);
    this.current = "";
    this.y = PAGE.height - PAGE.margin;
  }

  space(amount: number) {
    this.y -= amount;
  }

  line(opts: { gray?: number; width?: number; indent?: number } = {}) {
    this.ensure(8);
    const gray = opts.gray ?? 0.75;
    const x = PAGE.margin + (opts.indent ?? 0);
    const w = opts.width ?? this.contentWidth - (opts.indent ?? 0);
    this.current += `${gray} G 0.6 w ${x} ${this.y.toFixed(2)} m ${(x + w).toFixed(2)} ${this.y.toFixed(2)} l S\n`;
    this.y -= 4;
  }

  /** Draws one raw line of text at the cursor and advances by `leading`. */
  private drawLine(
    text: string,
    x: number,
    size: number,
    font: FontId,
    leading: number,
    gray: number,
  ) {
    this.ensure(leading);
    const f = font === "bold" ? "/F2" : "/F1";
    this.current += `BT ${gray} g ${f} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${(this.y - size).toFixed(2)} Tm (${escapePdfText(text)}) Tj ET\n`;
    this.y -= leading;
  }

  text(
    text: string,
    opts: {
      size?: number;
      font?: FontId;
      leading?: number;
      gray?: number;
      indent?: number;
      width?: number;
      tracking?: number;
    } = {},
  ) {
    const size = opts.size ?? 10;
    const font = opts.font ?? "regular";
    const leading = opts.leading ?? size * 1.42;
    const indent = opts.indent ?? 0;
    const width = opts.width ?? this.contentWidth - indent;
    /* Tracked lines (eyebrows, masthead) are short by construction and are
       drawn unwrapped so word gaps survive whitespace normalisation. */
    if (opts.tracking) {
      const tracked = String(text)
        .split(/\s+/)
        .map((w) => [...w].join(" ".repeat(opts.tracking!)))
        .join("   ");
      this.drawLine(tracked, PAGE.margin + indent, size, font, leading, opts.gray ?? 0.13);
      return;
    }
    const body = text;
    for (const l of wrapText(body, size, font, width)) {
      this.drawLine(l, PAGE.margin + indent, size, font, leading, opts.gray ?? 0.13);
    }
  }

  /** Label / value row with the label left and the value right-flush. */
  row(label: string, value: string) {
    const size = 9.5;
    const labelWidth = 150;
    const valueLines = wrapText(value, size, "regular", this.contentWidth - labelWidth - 12);
    this.ensure(valueLines.length * size * 1.4 + 6);
    const top = this.y;
    this.drawLine(label.toUpperCase(), PAGE.margin, 8, "bold", 0, 0.45);
    this.y = top;
    for (const l of valueLines) {
      this.drawLine(l, PAGE.margin + labelWidth + 12, size, "regular", size * 1.4, 0.13);
    }
    this.y -= 3;
    this.line({ gray: 0.88 });
  }

  eyebrow(title: string) {
    this.ensure(34);
    this.line({ gray: 0.55 });
    this.y -= 4;
    this.text(title.toUpperCase(), { size: 8, font: "bold", gray: 0.42, tracking: 1, leading: 14 });
  }

  /** Starts a fresh page regardless of remaining space. */
  pageBreak() {
    this.pages.push(this.current);
    this.current = "";
    this.y = PAGE.height - PAGE.margin;
  }

  build(): Uint8Array {
    const streams = [...this.pages, this.current].filter((s) => s.trim().length > 0);
    const objects: string[] = [];
    const pageCount = streams.length || 1;
    const kids: string[] = [];
    const firstPageObj = 5;

    objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
    objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
    objects[4] =
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";

    for (let i = 0; i < pageCount; i++) {
      const pageObj = firstPageObj + i * 2;
      const contentObj = pageObj + 1;
      const stream = streams[i] ?? "";
      kids.push(`${pageObj} 0 R`);
      objects[pageObj] =
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObj} 0 R >>`;
      objects[contentObj] = `<< /Length ${stream.length} >>\nstream\n${stream}endstream`;
    }
    objects[2] = `<< /Type /Pages /Count ${pageCount} /Kids [${kids.join(" ")}] >>`;

    let body = "%PDF-1.4\n";
    const offsets: number[] = [];
    const maxObj = objects.length - 1;
    for (let i = 1; i <= maxObj; i++) {
      offsets[i] = body.length;
      body += `${i} 0 obj\n${objects[i] ?? "<< >>"}\nendobj\n`;
    }
    const xrefStart = body.length;
    body += `xref\n0 ${maxObj + 1}\n0000000000 65535 f \n`;
    for (let i = 1; i <= maxObj; i++) {
      body += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
    }
    body += `trailer\n<< /Size ${maxObj + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

    const bytes = new Uint8Array(body.length);
    for (let i = 0; i < body.length; i++) bytes[i] = body.charCodeAt(i) & 0xff;
    return bytes;
  }
}
