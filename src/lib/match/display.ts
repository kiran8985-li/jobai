import { annualise } from "./score";

/** Shared wording and styles for showing jobs and scores. No I/O. */

export function formatSalary(min: number | null, max: number | null): string {
  const lo = min ?? max;
  const hi = max ?? min;
  if (!lo || !hi) return "Salary not given";
  const unit = hi < 200 ? " an hour" : hi < 2500 ? " a day" : "";
  const f = (n: number) => `£${n.toLocaleString("en-GB")}`;
  return (lo === hi ? f(hi) : `${f(lo)} to ${f(hi)}`) + unit;
}

export const scoreChip = (score: number) =>
  score >= 75
    ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
    : score >= 50
      ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
      : "border border-line text-muted";

export const SOURCE_LABELS: Record<string, string> = { adzuna: "Adzuna", reed: "Reed", greenhouse: "Company site (Greenhouse)", lever: "Company site (Lever)", demo: "Demo" };
export const sourceLabel = (s: string) => SOURCE_LABELS[s] ?? s;

export const applyLabel = (method: string) => (method === "email" ? "Can be sent for you by email" : "You apply on the employer's site");

export const postedLabel = (iso: string | null) =>
  iso ? `Posted ${new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : "Posting date not given";

export { annualise };
