import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { CvProfile } from "../cv/types";
import { cvBlocks } from "./layout";

const A4: [number, number] = [595.28, 841.89];
const MAX_PAGES = 2;
// Tried in order until the CV fits on two pages, the usual limit for a UK CV.
const SCALES = [1, 0.94, 0.88, 0.82];
const INK = rgb(0.08, 0.07, 0.17);
const GREY = rgb(0.33, 0.33, 0.4);

let fontBytes: Promise<[Buffer, Buffer]> | undefined;
function loadFonts() {
  const dir = path.join(process.cwd(), "assets", "fonts");
  fontBytes ??= Promise.all([readFile(path.join(dir, "DejaVuSans.ttf")), readFile(path.join(dir, "DejaVuSans-Bold.ttf"))]);
  return fontBytes;
}

/** Characters the font cannot draw (emoji, some scripts) become "?" instead of breaking the file. */
function drawable(font: PDFFont, text: string): string {
  const set = new Set(font.getCharacterSet());
  return [...text].map((ch) => (set.has(ch.codePointAt(0)!) ? ch : "?")).join("");
}

function wrap(font: PDFFont, size: number, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (let word of text.split(" ")) {
    // A single very long word (a URL, say) is cut so it cannot run off the page.
    while (font.widthOfTextAtSize(word, size) > width) {
      let cut = word.length - 1;
      while (cut > 1 && font.widthOfTextAtSize(word.slice(0, cut), size) > width) cut--;
      if (line) lines.push(line);
      lines.push(word.slice(0, cut));
      line = "";
      word = word.slice(cut);
    }
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= width) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Single-column, text-only A4 PDF. Real text (not images), so it can be searched and read by ATS software.
 * If the CV would spill onto a third page, the type and spacing are tightened a little (never below
 * a readable size) to bring it back to two. A CV too long even for that keeps its extra pages.
 */
export async function renderCvPdf(cv: CvProfile, opts: { fit?: boolean } = {}): Promise<Uint8Array> {
  let last: PDFDocument | undefined;
  for (const scale of opts.fit === false ? [1] : SCALES) {
    last = await draw(cv, scale);
    if (last.getPageCount() <= MAX_PAGES) break;
  }
  return last!.save();
}

async function draw(cv: CvProfile, k: number): Promise<PDFDocument> {
  const MARGIN = Math.max(40, 54 * k);
  const WIDTH = A4[0] - MARGIN * 2;
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const [regularBytes, boldBytes] = await loadFonts();
  const regular = await pdf.embedFont(regularBytes, { subset: true });
  const bold = await pdf.embedFont(boldBytes, { subset: true });
  pdf.setTitle(`CV - ${cv.name || "Candidate"}`);
  pdf.setAuthor(cv.name || "Candidate");
  pdf.setCreator("JobPilot AI");
  pdf.setLanguage("en-GB");

  let page: PDFPage = pdf.addPage(A4);
  let y = A4[1] - MARGIN;
  const need = (height: number) => {
    if (y - height < MARGIN) {
      page = pdf.addPage(A4);
      y = A4[1] - MARGIN;
    }
  };
  const write = (text: string, font: PDFFont, baseSize: number, opts: { x?: number; width?: number; color?: typeof INK; gap?: number } = {}) => {
    const size = baseSize * k;
    const x = opts.x ?? MARGIN;
    const leading = size * 1.38;
    for (const line of wrap(font, size, drawable(font, text), opts.width ?? WIDTH - (x - MARGIN))) {
      need(leading);
      y -= leading;
      page.drawText(line, { x, y, size, font, color: opts.color ?? INK });
    }
    y -= (opts.gap ?? 0) * k;
  };

  for (const b of cvBlocks(cv)) {
    if (b.kind === "name") write(b.text, bold, 20, { gap: 2 });
    else if (b.kind === "contact") write(b.text, regular, 9.5, { color: GREY });
    else if (b.kind === "headline") write(b.text, regular, 11.5, { gap: 2 });
    else if (b.kind === "heading") {
      need(40 * k);
      y -= 12 * k;
      write(b.text, bold, 12.5);
      y -= 4 * k;
      page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + WIDTH, y }, thickness: 0.6, color: GREY });
      y -= 2;
    } else if (b.kind === "paragraph") write(b.text, regular, 10, { gap: 2 });
    else if (b.kind === "entry") {
      need(34 * k);
      y -= 5 * k;
      write(b.left, bold, 10.5);
      if (b.right) write(b.right, regular, 9.5, { color: GREY });
      y -= 1;
    } else if (b.kind === "bullet") {
      // Make room for the first line, then put the bullet mark beside it on that page.
      need(10 * k * 1.38);
      page.drawText("•", { x: MARGIN + 3, y: y - 10 * k * 1.38, size: 10 * k, font: regular, color: INK });
      write(b.text, regular, 10, { x: MARGIN + 14, gap: 1.5 });
    }
  }
  return pdf;
}
