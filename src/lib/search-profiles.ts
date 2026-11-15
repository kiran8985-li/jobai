import { z } from "zod";

/** Search profile rules shared by the forms, the server actions and (later) the scan. No I/O. */

export const EMPLOYMENT_TYPES = [
  { value: "permanent", label: "Permanent" },
  { value: "contract", label: "Contract" },
  { value: "full-time", label: "Full-time" },
  { value: "part-time", label: "Part-time" },
  { value: "temporary", label: "Temporary" },
  { value: "internship", label: "Internship" },
] as const;
const TYPE_VALUES = EMPLOYMENT_TYPES.map((t) => t.value) as string[];

export const MAX_PROFILES = 10;
export const MAX_LIST_ITEMS = 15;

export type SearchProfile = {
  id: string;
  name: string;
  roles: string[];
  locations: string[];
  min_salary: number | null;
  employment_types: string[];
  keywords: string[];
  exclude_keywords: string[];
  min_match: number;
  daily_limit: number;
  auto_apply: boolean;
  consent_at: string | null;
  is_active: boolean;
};

export const PROFILE_COLUMNS =
  "id, name, roles, locations, min_salary, employment_types, keywords, exclude_keywords, min_match, daily_limit, auto_apply, consent_at, is_active";

/** "Python developer, Backend engineer" → ["Python developer", "Backend engineer"], trimmed and de-duplicated. */
export function parseList(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const piece of (text || "").split(/[,;\n]/)) {
    const item = piece.replace(/\s+/g, " ").trim();
    const key = item.toLowerCase();
    if (item && !seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

const list = (label: string) =>
  z
    .string()
    .max(2000)
    .transform(parseList)
    .refine((v) => v.length <= MAX_LIST_ITEMS, `Keep ${label} to ${MAX_LIST_ITEMS} or fewer.`)
    .refine((v) => v.every((x) => x.length <= 60), `Keep each of the ${label} under 60 characters.`);

const wholeNumber = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .regex(/^\d+$/, `${label} must be a whole number.`)
    .transform(Number)
    .refine((n) => n >= min && n <= max, `${label} must be between ${min} and ${max}.`);

export const profileFormSchema = z.object({
  name: z.string().trim().min(1, "Give this search a name.").max(60, "Keep the name under 60 characters."),
  roles: list("job titles").refine((v) => v.length >= 1, "Add at least one job title to search for."),
  locations: list("locations"),
  min_salary: z
    .string()
    .trim()
    .transform((v) => v.replace(/[£,\s]/g, ""))
    .refine((v) => v === "" || /^\d+$/.test(v), "Minimum salary must be a number, for example 45000.")
    .transform((v) => (v === "" ? null : Number(v)))
    .refine((n) => n === null || n <= 1_000_000, "Minimum salary looks too high."),
  employment_types: z.array(z.string()).refine((v) => v.every((x) => TYPE_VALUES.includes(x)), "Unknown job type."),
  keywords: list("keywords"),
  exclude_keywords: list("excluded keywords"),
  min_match: wholeNumber("Minimum match", 0, 100),
  daily_limit: wholeNumber("Daily application limit", 1, 50),
});
export type ProfileFormData = z.infer<typeof profileFormSchema>;

/**
 * The single test for "may JobPilot apply automatically for this search?". All four must hold:
 * the search is active, the user gave consent for it, auto-apply is on, and the master pause is off.
 * (Whether anything is really sent is a separate question: APPLY_MODE must also be "live".)
 */
export function isAutoApplyOn(
  profile: Pick<SearchProfile, "is_active" | "auto_apply" | "consent_at">,
  userPaused: boolean,
): boolean {
  return profile.is_active && profile.auto_apply && Boolean(profile.consent_at) && !userPaused;
}
