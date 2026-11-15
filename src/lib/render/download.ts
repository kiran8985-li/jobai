import "server-only";

const TYPES = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
} as const;
export type CvFormat = keyof typeof TYPES;
export const isCvFormat = (v: string): v is CvFormat => v === "pdf" || v === "docx";

/** A private, never-cached file download. */
export function fileResponse(bytes: Uint8Array | ArrayBuffer, format: CvFormat, filename: string): Response {
  return new Response(bytes as BodyInit, {
    headers: {
      "content-type": TYPES[format],
      "content-disposition": `attachment; filename="${filename.replace(/[^A-Za-z0-9._-]/g, "_")}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
export const notFound = () => Response.json({ error: "Not found" }, { status: 404 });
export const unauthorized = () => Response.json({ error: "Not signed in" }, { status: 401 });
