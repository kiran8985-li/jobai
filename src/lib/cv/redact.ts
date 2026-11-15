import { EMAIL_RE, PHONE_RE, heuristicParse, isSectionHeading } from "./heuristic";

/**
 * Privacy rule: the AI never receives the person's name, email, phone or address.
 * redact() removes them from CV text before any AI call; restoreContact() puts them back
 * into AI output in code. scrubContact() is a last safety net inside the AI client itself.
 */

export type Contact = { name: string; email: string; phone: string; location: string };

const EMAIL_ALL = new RegExp(EMAIL_RE.source, "g");
const UK_PHONE_ALL = new RegExp(PHONE_RE.source, "g");
// Any long run of digits with phone punctuation; only treated as a phone when it has 10–15 digits,
// so date ranges such as "2014 - 2017" are left alone.
const ANY_PHONE_ALL = /\+?\(?\d[\d\s().-]{7,}\d/g;
const LINK_ALL = /\b(?:https?:\/\/|www\.)\S+|\b(?:linkedin\.com|github\.com|gitlab\.com)\/\S+/gi;
const POSTCODE_ALL = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/g;
const ADDRESS_LABEL_ALL = /((?:Location|Address|Home address)\s*[:\-]\s*)[^\n|]+/gi;

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Removes every email address and phone number. Applied to everything sent to the AI. */
export function scrubContact(text: string): string {
  return text
    .replace(EMAIL_ALL, "[EMAIL]")
    .replace(UK_PHONE_ALL, "[PHONE]")
    .replace(ANY_PHONE_ALL, (m) => {
      const digits = m.replace(/\D/g, "").length;
      return digits >= 10 && digits <= 15 ? "[PHONE]" : m;
    });
}

/** The contact details found in the CV text (worked out in code, never by the AI). */
export function extractContact(text: string): Contact {
  const p = heuristicParse(text);
  return { name: p.name, email: p.email, phone: p.phone, location: p.location };
}

export function redact(text: string): { text: string; contact: Contact } {
  const contact = extractContact(text);
  const headline = heuristicParse(text).headline;
  let lines = text.split(/\r?\n/);

  // Contact details live in the block above the first section heading: replace that block whole.
  const firstHeading = lines.findIndex((l) => isSectionHeading(l));
  if (firstHeading > 0 && firstHeading <= 15) {
    lines = ["[NAME]", ...(headline ? [headline] : []), "[CONTACT DETAILS]", "", ...lines.slice(firstHeading)];
  }
  let out = lines.join("\n");

  out = out.replace(ADDRESS_LABEL_ALL, "$1[ADDRESS]").replace(LINK_ALL, "[LINK]").replace(POSTCODE_ALL, "[POSTCODE]");
  out = scrubContact(out);
  if (contact.name) {
    const nameRe = new RegExp(contact.name.split(/\s+/).map(escapeRegExp).join("\\s+"), "gi");
    out = out.replace(nameRe, "[NAME]");
  }
  if (contact.location.length >= 3) {
    out = out.replace(new RegExp(escapeRegExp(contact.location), "gi"), "[ADDRESS]");
  }
  return { text: out, contact };
}

/** Puts the real details back into text the AI returned (it may echo placeholders). */
export function restoreContact(text: string, contact: Contact): string {
  return text
    .replace(/\[NAME\]/g, contact.name)
    .replace(/\[EMAIL\]/g, contact.email)
    .replace(/\[PHONE\]/g, contact.phone)
    .replace(/\[ADDRESS\]/g, contact.location)
    .replace(/\[(?:CONTACT DETAILS|LINK|POSTCODE)\]/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
