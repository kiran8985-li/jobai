import type { CvProfile } from "../cv/types";

/**
 * The CV as an ordered list of simple blocks. Both the PDF and the Word file are drawn from
 * this, so they always say the same thing. Single column, standard headings, no tables,
 * images or text boxes: the layout applicant tracking systems read most reliably.
 */
export type Block =
  | { kind: "name"; text: string }
  | { kind: "contact"; text: string }
  | { kind: "headline"; text: string }
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "entry"; left: string; right: string }
  | { kind: "bullet"; text: string };

const clean = (s: string) => s.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();

export function cvBlocks(cv: CvProfile): Block[] {
  const out: Block[] = [];
  const add = (b: Block) => {
    const text = "text" in b ? clean(b.text) : "";
    if (b.kind === "entry") out.push({ kind: "entry", left: clean(b.left), right: clean(b.right) });
    else if (text) out.push({ ...b, text } as Block);
  };
  add({ kind: "name", text: cv.name || "Curriculum Vitae" });
  add({ kind: "contact", text: [cv.email, cv.phone, cv.location].map(clean).filter(Boolean).join(" | ") });
  add({ kind: "headline", text: cv.headline });
  if (clean(cv.summary)) {
    add({ kind: "heading", text: "Summary" });
    add({ kind: "paragraph", text: cv.summary });
  }
  if (cv.skills.length) {
    add({ kind: "heading", text: "Skills" });
    add({ kind: "paragraph", text: cv.skills.map(clean).filter(Boolean).join(", ") });
  }
  if (cv.experience.length) {
    add({ kind: "heading", text: "Experience" });
    for (const e of cv.experience) {
      add({ kind: "entry", left: [e.title, e.company].map(clean).filter(Boolean).join(", "), right: e.dates });
      for (const b of e.bullets) add({ kind: "bullet", text: b });
    }
  }
  if (cv.education.length) {
    add({ kind: "heading", text: "Education" });
    for (const e of cv.education) add({ kind: "entry", left: [e.degree, e.institution].map(clean).filter(Boolean).join(", "), right: e.dates });
  }
  if (cv.certifications.length) {
    add({ kind: "heading", text: "Certifications" });
    for (const c of cv.certifications) add({ kind: "bullet", text: c });
  }
  if (cv.languages.length) {
    add({ kind: "heading", text: "Languages" });
    add({ kind: "paragraph", text: cv.languages.map(clean).filter(Boolean).join(", ") });
  }
  return out;
}

/** A safe download name such as "Priya-Shah-CV-Fernhill-Software.pdf". */
export function cvFilename(cv: CvProfile, ext: "pdf" | "docx", company?: string): string {
  const part = (s: string) => s.normalize("NFKD").replace(/[^A-Za-z0-9 ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 40);
  return [part(cv.name) || "CV", "CV", company ? part(company) : ""].filter(Boolean).join("-") + "." + ext;
}
