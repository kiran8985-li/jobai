import "server-only";
import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import type { CvProfile } from "../cv/types";
import { cvBlocks } from "./layout";

const FONT = "Calibri";
const run = (text: string, opts: { bold?: boolean; size?: number; color?: string } = {}) =>
  new TextRun({ text, font: FONT, bold: opts.bold, size: opts.size ?? 21, color: opts.color });

/** Single-column Word file with real headings and bullet lists, and no tables or text boxes. */
export async function renderCvDocx(cv: CvProfile): Promise<Uint8Array> {
  const children: Paragraph[] = [];
  for (const b of cvBlocks(cv)) {
    if (b.kind === "name") children.push(new Paragraph({ heading: HeadingLevel.TITLE, alignment: AlignmentType.LEFT, spacing: { after: 40 }, children: [run(b.text, { bold: true, size: 40, color: "14122B" })] }));
    else if (b.kind === "contact") children.push(new Paragraph({ spacing: { after: 40 }, children: [run(b.text, { size: 19, color: "555566" })] }));
    else if (b.kind === "headline") children.push(new Paragraph({ spacing: { after: 80 }, children: [run(b.text, { size: 23 })] }));
    else if (b.kind === "heading") children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 80 }, border: { bottom: { style: "single", size: 4, color: "888899", space: 2 } }, children: [run(b.text, { bold: true, size: 25, color: "14122B" })] }));
    else if (b.kind === "paragraph") children.push(new Paragraph({ spacing: { after: 80 }, children: [run(b.text)] }));
    else if (b.kind === "entry") {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 140, after: 0 }, children: [run(b.left, { bold: true, size: 22, color: "14122B" })] }));
      if (b.right) children.push(new Paragraph({ spacing: { after: 40 }, children: [run(b.right, { size: 19, color: "555566" })] }));
    } else if (b.kind === "bullet") children.push(new Paragraph({ bullet: { level: 0 }, spacing: { after: 30 }, children: [run(b.text)] }));
  }
  const doc = new Document({
    creator: "JobPilot AI",
    title: `CV - ${cv.name || "Candidate"}`,
    styles: { default: { document: { run: { font: FONT, size: 21 } } } },
    sections: [{ properties: { page: { margin: { top: 1000, bottom: 1000, left: 1100, right: 1100 } } }, children }],
  });
  return new Uint8Array(await Packer.toBuffer(doc));
}
