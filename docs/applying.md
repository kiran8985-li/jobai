# Applying

After each scan has scored jobs and prepared a tailored CV for each match, the apply stage decides
what happens to every match that has no application yet.

| Situation | Result | Status shown |
| --- | --- | --- |
| Job takes email applications, search has consent and auto-apply on, all questions answered | Applied for automatically (in test mode: prepared and stored, nothing sent) | Sent / Prepared (test mode) |
| Job asks a sensitive question (disability, ethnicity, health, criminal record, religion, sexual orientation and similar) | Never applied for automatically; the user is told why | Skipped |
| Job asks a question the user has not saved an answer for | Not applied for; the user is told which answer to add | Skipped |
| Job is on an employer's own site, or auto-apply is off for the search | Everything prepared for the user to submit | Waiting for you |
| Auto-apply paused for everything | Email jobs wait; nothing is created until resumed | (none) |

## Email sending is switched off for now

`EMAIL_SENDING_ENABLED` in `src/lib/apply/index.ts` is `false`. Every application is prepared and
stored exactly as described below, and nothing is ever sent, even if `APPLY_MODE=live`. The sending
code (Resend, idempotency, record-before-send) is built and unit-tested, ready for later. To switch
it on: set the flag to `true`, then follow "Before going live" below.

## Safety rules

- **Test mode by default.** `APPLY_MODE=dry_run` prepares and stores the full email but sends nothing.
- **Live mode needs all of:** `APPLY_MODE=live`, `MAIL_FROM`, `RESEND_API_KEY`, the user's consent
  on that search, auto-apply switched on, and not paused. Without `MAIL_FROM` or the key the stage
  refuses to run and records why in the scan log.
- **One application per user per job** (database rule), so a re-run can never apply twice.
- **Recorded before sending.** In live mode the row is saved as "prepared", then marked sent or failed.
  Resend also receives an idempotency key, so the same application is delivered at most once.
- **Daily limit per search,** counted from midnight UK time. Skipped and manual applications do not
  use it up.
- **Demo jobs can never be mailed:** their addresses use reserved test domains (`example.com`).
- **No AI writes the email.** The cover note is built from the tailored CV (already fact-checked),
  the user's contact details and their saved answers. Replies go to the user's own email address.

## What the user can do

- On a job's page: see the exact email prepared or sent, download the CV, open the advert,
  **Mark as applied**, or **Try again** after adding a missing answer.
- The Applications page lists every application with its status.

## Before going live

1. Verify the sending domain in Resend (for example `applications@jobpilotai.co.uk`).
2. Set `MAIL_FROM`, `RESEND_API_KEY` and a monthly spend cap in Resend.
3. Review several prepared applications by hand in test mode first.
4. Remove `DEMO_SOURCE` before testers join.
