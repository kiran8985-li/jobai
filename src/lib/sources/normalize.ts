import type { ApplyMethod, NormalizedJob } from "./types";

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", pound: "£", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", hellip: "…" };

function unescapeHtml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x10ffff ? String.fromCodePoint(n) : " ";
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

/** HTML job description → plain text with paragraph breaks kept. */
export function stripHtml(input: string | null | undefined): string {
  let text = input ?? "";
  // Feeds such as Greenhouse send HTML that is itself escaped (&lt;p&gt;...), so unescape first.
  if (/&lt;\/?[a-z]/i.test(text)) text = unescapeHtml(text);
  text = text.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ");
  text = text.replace(/<(br|\/p|\/li|\/div|\/h\d)[^>]*>/gi, "\n");
  text = text.replace(/<[^>]+>/g, " ");
  text = unescapeHtml(text);
  text = text.replace(/[ \t ]+/g, " ");
  text = text.replace(/ ?\n ?/g, "\n");
  return text.replace(/\n\s*\n+/g, "\n\n").trim();
}

const norm = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9+#]+/g, " ").trim();

/**
 * Jobs with the same normalised title + company + location are treated as one vacancy.
 * "Python Developer – Fernhill Software Ltd – Manchester, UK" and
 * "python developer / Fernhill Software / Manchester" give the same key.
 */
export function dedupeKey(title: string, company: string, location: string): string {
  const c = norm(company).replace(/\b(ltd|limited|plc|inc|llc|llp|uk|group)\b/g, " ").replace(/\s+/g, " ").trim();
  const l = norm((location || "").split(",")[0]).replace(/\b(greater|city of|uk|united kingdom|england|scotland|wales)\b/g, " ").replace(/\s+/g, " ").trim();
  return [norm(title), c, l].join("|");
}

const ATS_HOSTS = /(^|\.)(greenhouse\.io|lever\.co|ashbyhq\.com|workable\.com)$/i;
const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

function cleanUrl(url: unknown): string {
  if (typeof url !== "string") return "";
  try {
    const u = new URL(url.trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString().slice(0, 2000) : "";
  } catch {
    return "";
  }
}

/** email if the job gives an address; ats if it is on a supported application system; otherwise manual. */
export function applyMethodFor(applyEmail: string, applyUrl: string): ApplyMethod {
  if (applyEmail) return "email";
  try {
    if (applyUrl && ATS_HOSTS.test(new URL(applyUrl).hostname)) return "ats";
  } catch {}
  return "manual";
}

function toIso(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  let v: string | number = value;
  // Reed sends dd/mm/yyyy.
  const uk = typeof v === "string" ? /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v.trim()) : null;
  if (uk) v = `${uk[3]}-${uk[2]}-${uk[1]}T00:00:00Z`;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const money = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n > 0 && n < 10_000_000 ? Math.round(n) : null;
};
const text = (v: unknown, max: number) => (typeof v === "string" || typeof v === "number" ? String(v).replace(/\s+/g, " ").trim().slice(0, max) : "");

export type RawJob = {
  source: string;
  external_id: unknown;
  title: unknown;
  company?: unknown;
  location?: unknown;
  salary_min?: unknown;
  salary_max?: unknown;
  employment_type?: unknown;
  description?: unknown;
  apply_url?: unknown;
  apply_email?: unknown;
  questions?: string[];
  posted_at?: unknown;
};

/** Turns one provider record into the common format. Returns null when it has no title or id. */
export function makeJob(raw: RawJob): NormalizedJob | null {
  const title = text(raw.title, 300);
  const external_id = text(raw.external_id, 200);
  if (!title || !external_id) return null;
  const company = text(raw.company, 200);
  const location = text(raw.location, 200);
  const email = text(raw.apply_email, 254);
  const apply_email = EMAIL.test(email) ? email : "";
  const apply_url = cleanUrl(raw.apply_url);
  return {
    source: raw.source,
    external_id,
    title,
    company,
    location,
    salary_min: money(raw.salary_min),
    salary_max: money(raw.salary_max),
    employment_type: text(raw.employment_type, 60).toLowerCase(),
    description: stripHtml(typeof raw.description === "string" ? raw.description : "").slice(0, 20_000),
    apply_url,
    apply_email,
    apply_method: applyMethodFor(apply_email, apply_url),
    questions: (raw.questions ?? []).filter((q) => typeof q === "string").slice(0, 30),
    posted_at: toIso(raw.posted_at),
    dedupe_key: dedupeKey(title, company, location),
    also_on: [],
  };
}
