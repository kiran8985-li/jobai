/** Screening answers the user can save in advance, and the rule for questions we never answer. No I/O. */

export const STANDARD_QUESTIONS = [
  {
    key: "right_to_work_uk",
    label: "Do you have the right to work in the UK?",
    options: [
      { value: "yes", label: "Yes" },
      { value: "yes_sponsorship", label: "Yes, but I need visa sponsorship" },
      { value: "no", label: "No" },
    ],
  },
  { key: "notice_period", label: "What is your notice period?", placeholder: "For example: 1 month" },
  { key: "salary_expectation", label: "What salary are you looking for?", placeholder: "For example: £45,000 to £50,000" },
  {
    key: "willing_to_relocate",
    label: "Are you willing to relocate?",
    options: [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
    ],
  },
] as const;

export const STANDARD_KEYS: string[] = STANDARD_QUESTIONS.map((q) => q.key);
export const CUSTOM_PREFIX = "custom:";
export const MAX_CUSTOM_ANSWERS = 20;

const SENSITIVE =
  /\b(disab\w*|impairment\w*|ethnic\w*|race|racial|religio\w*|faith|belief\w*|sexual\w*|orientation|gender|transgender|pregnan\w*|maternity|health|medical|illness\w*|mental|criminal|convict\w*|offen[cs]e\w*|arrest\w*|dbs|trade union|political|marital)\b/i;

/**
 * Sensitive questions (disability, ethnicity, health, criminal record, religion, sexual orientation
 * and similar) are never answered automatically and answers to them are never stored.
 */
export function isSensitiveQuestion(text: string): boolean {
  return SENSITIVE.test(text || "");
}
