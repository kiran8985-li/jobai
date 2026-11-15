import { Document, Packer, Paragraph } from "docx";
import { PDFDocument, StandardFonts } from "pdf-lib";

/** Turns plain text into a simple one-column PDF, one text line per source line. */
export async function textToPdf(text: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  let page = pdf.addPage([595, 842]);
  let y = 800;
  for (const line of text.split("\n")) {
    if (y < 50) {
      page = pdf.addPage([595, 842]);
      y = 800;
    }
    if (line.trim()) page.drawText(line, { x: 50, y, size: 10, font });
    y -= 14;
  }
  return pdf.save();
}

/** A PDF with a page but no text, like a scanned CV. */
export async function blankPdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.addPage([595, 842]);
  return pdf.save();
}

export async function textToDocx(text: string): Promise<Uint8Array> {
  const doc = new Document({ sections: [{ children: text.split("\n").map((l) => new Paragraph(l)) }] });
  return new Uint8Array(await Packer.toBuffer(doc));
}
