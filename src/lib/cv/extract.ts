import "server-only";

/** A problem with the uploaded file that the user can fix. The message is shown to them as-is. */
export class CvFileError extends Error {}

export const MAX_CV_BYTES = 5 * 1024 * 1024;
const MAX_TEXT_CHARS = 200_000;

export type CvFileKind = "pdf" | "docx" | "txt";

const MIME: Record<CvFileKind, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
};
export const mimeFor = (kind: CvFileKind) => MIME[kind];

/** Decides the file type from the name AND the file's first bytes, so a renamed file is caught. */
export function detectKind(filename: string, data: Uint8Array): CvFileKind {
  const name = (filename || "").toLowerCase();
  const starts = (...bytes: number[]) => bytes.every((b, i) => data[i] === b);
  if (name.endsWith(".pdf")) {
    if (!starts(0x25, 0x50, 0x44, 0x46)) throw new CvFileError("This file is named .pdf but is not a PDF. Export it again and re-upload.");
    return "pdf";
  }
  if (name.endsWith(".docx")) {
    if (!starts(0x50, 0x4b, 0x03, 0x04)) throw new CvFileError("This file is named .docx but is not a Word document. Save it again as .docx and re-upload.");
    return "docx";
  }
  if (name.endsWith(".txt")) {
    if (data.subarray(0, 4000).includes(0)) throw new CvFileError("This file is named .txt but is not plain text.");
    return "txt";
  }
  if (name.endsWith(".doc")) {
    throw new CvFileError("Old Word files (.doc) are not supported. Open it in Word, choose Save As → Word Document (.docx), and upload that.");
  }
  throw new CvFileError("Unsupported file type. Upload a PDF, a Word file (.docx) or a text file (.txt).");
}

/**
 * Web addresses behind links (a "LinkedIn" word linked to a profile, say). Plain-text extraction keeps
 * only the word, so the addresses are added on a "Links:" line unless they already appear in the text.
 */
export function withLinkTargets(text: string, hrefs: string[]): string {
  const extra = [...new Set(hrefs.map((h) => h.trim()).filter((h) => /^https?:\/\/[^\s]+$/i.test(h) && h.length <= 300))]
    .filter((h) => !text.includes(h) && !text.includes(h.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "")));
  return extra.length ? `${text}\nLinks: ${extra.join(" ")}` : text;
}

export async function extractText(filename: string, data: Uint8Array): Promise<{ text: string; kind: CvFileKind }> {
  if (data.byteLength === 0) throw new CvFileError("This file is empty.");
  if (data.byteLength > MAX_CV_BYTES) throw new CvFileError("This file is larger than 5 MB. Upload a smaller file.");
  const kind = detectKind(filename, data);
  let text = "";
  try {
    if (kind === "pdf") {
      const { extractText: pdfText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(data));
      const res = await pdfText(pdf, { mergePages: false });
      text = (res.text as string[]).join("\n");
      const hrefs: string[] = [];
      for (let i = 1; i <= Math.min(pdf.numPages, 10); i++) {
        const annots = await (await pdf.getPage(i)).getAnnotations().catch(() => []);
        for (const a of annots as { subtype?: string; url?: string }[]) if (a.subtype === "Link" && a.url) hrefs.push(a.url);
      }
      text = withLinkTargets(text, hrefs);
    } else if (kind === "docx") {
      const mammoth = await import("mammoth");
      const res = await mammoth.extractRawText({ buffer: Buffer.from(data) });
      const html = await mammoth.convertToHtml({ buffer: Buffer.from(data) });
      text = withLinkTargets(res.value, [...html.value.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&")));
    } else {
      text = new TextDecoder("utf-8").decode(data);
    }
  } catch {
    // The library error is not shown or logged: it can contain parts of the document.
    throw new CvFileError(
      kind === "pdf"
        ? "We could not read this PDF. It may be damaged or password-protected. Try exporting it again, or upload a Word file."
        : "We could not read this file. It may be damaged. Try saving it again.",
    );
  }
  text = text.replace(/\u0000/g, "").replace(/\r\n?/g, "\n").trim();
  if (text.replace(/\s/g, "").length < 30) {
    throw new CvFileError(
      kind === "pdf"
        ? "This PDF has no readable text. It looks like a scan or a photo. Upload a text PDF (exported from Word or Google Docs) or a Word file."
        : "This file has no readable text.",
    );
  }
  return { text: text.slice(0, MAX_TEXT_CHARS), kind };
}
