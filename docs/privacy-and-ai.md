# How CV data is protected when the AI is used

**Rule:** the AI provider never receives a person's name, email address, phone number or address.

1. **Consent first.** A user must tick the consent box (DeepSeek, servers in China, possible training)
   before any upload. The timestamp is stored in `profiles_user.ai_consent_at`. The database and the
   file bucket refuse a CV without it.
2. **Redact before sending** (`src/lib/cv/redact.ts`, `redact()`):
   - the block above the first section heading (where contact details live) is replaced whole;
   - every email address, phone number, link and UK postcode anywhere in the text is replaced;
   - the person's name and stated location are replaced wherever they appear.
3. **Safety net in the AI client** (`src/lib/ai/index.ts`, `chatJson()`): everything sent is scrubbed
   for emails and phone numbers again, so a future caller that forgets step 2 still cannot leak them.
4. **Contact details are added back by code**, from the user's own file, never from the AI's reply.
5. **Nothing invented gets in.** Every employer, job title, date, qualification, certification, skill
   and bullet the AI returns is checked against the CV text; anything not found is removed and shown
   to the user as a flag (`verifyAgainstText()`).
6. **Nothing is used until approved.** Later phases must load CVs through `getMasterCv()`
   (`src/lib/cv/store.ts`), which only returns the approved master CV.
7. **CV contents are never logged.** `ai_usage` records user, purpose, model and token counts only.

## Known limits (be honest with testers)

- Redaction is pattern-based. A name written unusually (initials only, a nickname), an address with
  no label and no postcode in the body text, or an employer name that identifies the person can
  still reach the AI. Job titles, employers and dates are sent: the AI needs them to do its job.
- All AI calls go through one interface (`src/lib/ai/provider.ts`), so DeepSeek can be replaced by a
  UK/EU-hosted or no-training provider without other code changes.

## Tests

`tests/cv-ai.test.ts` proves no AI request contains the sample CV's name, email, phone or location,
and that invented content is removed. `tests/e2e/cv-flow.cjs` checks the same on the wire against a
stand-in AI server.
