# JobPilot AI – build prompts for Claude Code

The beta is the full product; the only difference is invite-only, email-verified sign-up. Testers are 8–10 IT people
using real CVs. Prompts 0–12.

Paste these one at a time, in order. Wait for each phase to finish, run the app, check the "Done when" list,
then commit before moving on. Every prompt assumes Claude Code has read `CLAUDE.md`.

Tip: start each phase in plan mode, read the plan, then approve it.

---

## Prompt 0 – Project setup

Read CLAUDE.md. Scaffold the project in the current folder: Next.js (App Router, TypeScript, Tailwind), ESLint,
Vitest. Add Supabase client helpers (browser, server, and a server-only admin client using the service role key),
a typed env loader that validates `.env.local` against `.env.example` and fails with a clear message, a base
layout with a responsive nav, and light/dark mode that follows the system and has a toggle. Initialise git, add a
`.gitignore` that excludes `.env*.local`, and copy `.env.example` as the template. Add a `/api/health` route.

Done when: `npm run dev` shows the landing placeholder, `npm test` runs, `/api/health` returns ok, and no secret is
readable from client code.

---

## Prompt 1 – Database and authentication

Create Supabase SQL migrations for every table in the CLAUDE.md data model, with Row Level Security so users only
see their own rows and admin-only tables are blocked for normal users. Implement login and sign-up with Google
and email, **invite-only**: sign-up requires a valid unused invite token (an invite is bound to an email).
Add `SIGNUP_MODE` (`invite` for the beta, `open` for later) and require email verification before first use.
The first account created becomes admin. Add middleware that protects the job seeker and admin routes, and an
`is_admin` server check for `/admin`. Build the login, sign-up and sign-out pages and an empty dashboard shell.

Done when: an uninvited email cannot register, an invited one can but cannot use the app until the email is verified, an invite for one email cannot be used by another, a normal user gets a 403 on `/admin`, and RLS
policies exist for all user tables (list them in a short `docs/rls.md`).

---

## Prompt 2 – CV upload, parsing and master CV

Build onboarding step 0 first: a required consent tick box (CV text is processed by DeepSeek, servers in China,
possible training unless opted out), stored with a timestamp; block CV upload until ticked. Then step 1. Accept PDF, .docx and .txt (max 5 MB), store the original in Supabase Storage, and extract
text with `unpdf` / `mammoth`. Port `reference/cvparse.py` to TypeScript: a heuristic parser as the fallback, and an
AI parser that asks DeepSeek for JSON in the same schema, then **verifies every employer, qualification and skill
against the raw CV text and drops anything not found**, recording flags. Create a "Review your CV" page where the user
edits name, headline, summary, skills, experience (add/remove bullets), education and certifications, then clicks
**Approve** to make it the master CV. Scanned PDFs with no text must show a clear message.

Add a `redact()` helper that strips name, email, phone and address from CV text before any AI call, and a function
that puts them back into the final output in code. AI never receives contact details.

Done when: no AI request ever contains the CV's email or phone (test it); `reference/sample_cv.txt` converted to PDF and to Word parses into the same structure as the Python
reference, the AI path and the fallback path both work (test with the key removed), and unapproved CVs are never
used by later phases. Add Vitest tests for the parser.

---

## Prompt 3 – Search profiles, preferences and consent

Build onboarding step 2 and the settings pages: one or more independent search profiles (the user can create several), each with roles, locations, minimum salary, employment
types, keywords, excluded keywords, minimum match (default 75), daily application limit (default 10). Add the
auto-apply settings page: an explicit consent checkbox with plain-English wording explaining what will be sent on
their behalf, a stored `consent_at`, a master on/off switch, and screening answers (right to work in the UK, notice
period, salary expectation, willing to relocate, and free-text custom answers). Show a clear warning that sensitive
questions are always skipped. Users can pause auto-apply at any time.

Done when: a profile can be created and edited, auto-apply cannot be switched on without consent, consent withdrawal
turns it off immediately, and the data is covered by RLS.

---

## Prompt 4 – Job sources, deduplication and the scan

Port `reference/sources.py` to TypeScript connectors behind one interface: Adzuna, Reed, Greenhouse, Lever and the
Demo source. Add a pipeline that: builds the distinct search queries from all active profiles, fetches from each
enabled source, normalises jobs to the common format, deduplicates on normalised title + company + location (keep
the version with the best apply method: email > ats > manual, and record `also_on`), upserts into `jobs`, and
records `source_status` and `scan_runs`. Expose it as `POST /api/cron/scan` protected by `CRON_SECRET`, and as
`npm run scan`. Add `.github/workflows/scan.yml` that calls the route every 15 minutes. Company feeds (Greenhouse,
Lever) run every scan; Adzuna and Reed run about once an hour with merged queries (per-source `min_interval`). One failing source must not
stop the others. Be polite: timeouts, no more than 1 request per second per source.

Done when: `npm run scan` with only the demo source fills `jobs`, running it twice creates no duplicates, a source
with a bad key shows its error in `source_status` while the others still run, and Vitest covers dedupe and
normalisation with mocked HTTP.

---

## Prompt 5 – Matching engine

Port the skill vocabulary from `reference/skills.py`. For each new job and each active profile compute a 0–100 score
(weights in CLAUDE.md) with matching skills, missing skills and one-line reasons, applying hard filters first.
Optionally let DeepSeek review jobs at or above `min_match − 10` for eligibility (seniority, right to work,
contract type), capped at 20 AI reviews per scan per user, with the keyword score as the fallback. Store results in
`matches`. Build the job list page (filter by score, location, source; sort by score or date) and the job detail
page showing the breakdown.

Done when: the demo jobs score sensibly against the sample CV profile (the Python developer jobs score highest,
the accountant job lowest), scores are explainable on the detail page, and tests cover the scoring edge cases.

---

## Prompt 6 – CV tailoring, fact check, PDF and Word

For a matched job, generate a tailored CV from the approved master CV: rewritten summary aimed at the role,
bullets reordered by relevance, wording aligned to the job's keywords **only where the master supports it**, skills
reordered with matched ones first. Implement the validator from CLAUDE.md rule 1: employers, titles, dates,
education and certifications must equal the master; every bullet must be supported by a master bullet (token
similarity threshold, and every number in it must appear in the master); every skill must exist in the master.
Drop and flag failures; if the AI output fails badly, fall back to reorder-only tailoring. Render a single-column
ATS-friendly PDF and Word file, store them in Supabase Storage, and save one tailored version per job so the user
can see exactly what was sent. Add the "My CVs" page with downloads and a flags panel.

Done when: a test that tries to smuggle in an invented skill, employer and number proves the validator removes
them, both files open correctly, and the text of the PDF can be extracted back out (ATS-readable).

---

## Prompt 7 – Auto-apply engine

After matching and tailoring, apply for each profile with consent and auto-apply on: only matches at or above
`min_match`, only jobs with no existing application, only up to today's `daily_limit`. For `apply_method = email`
build the email (short cover note, tailored CV attached, user's contact details). In `dry_run` store the full email
as `applications.status = dry_run` with a preview and send nothing; in `live` send via Resend. For `ats` and `manual`
jobs create a `manual` application with the prepared CV and answers so the user can submit in one click and mark it
applied. Apply the skip rules: unknown or sensitive screening questions → `skipped` plus a notification explaining
why. Record every step in `applications` and `notifications`. Make the engine idempotent and safe to re-run. Auto-apply is partly manual: label every application clearly as
**Sent** or **Waiting for you** (Manual Apply).

Done when: in dry run, a scan against the demo source creates sensible prepared applications, a job with a
sensitive question is skipped with a notification, the daily limit is respected, running the scan twice never
duplicates an application, and `live` refuses to run without consent and a configured `MAIL_FROM`.

---

## Prompt 8 – Dashboard and user pages

Follow the "Design direction" section in CLAUDE.md. Build the finished job seeker experience: dashboard (new matches, applications by status, skipped items needing
attention, last scan time), applications tracker with filters and a detail view showing the CV version and email
sent, notifications page with unread badge, and a "Run scan now" button for the signed-in user that only processes
their own profiles. Do not add any feedback button. Polish mobile layouts, empty states, loading states and error states. Keep light/dark mode
consistent.

Done when: every page works on a 375 px wide screen and in both themes, and an empty account shows helpful next steps.

---

## Prompt 9 – Admin panel

Build `/admin`: overview (users, jobs fetched, applications by status, last 10 scans), users and invites (create
invite and copy link, suspend, view activity), job sources (on/off, last run, count, last error, run one source
now), application log with filters, AI usage and cost estimates per user and per purpose with the daily limit
visible, and system health (scheduler last run, errors in the last 24 hours). All admin routes check `is_admin` on
the server.

Done when: a normal user cannot reach any admin route or API, and an admin can disable a source and see the next
scan skip it.

---

## Prompt 10 – Tests, security review, GDPR and handover

Add Playwright end-to-end tests for: invite → sign-up → upload CV → approve → create profile → run scan → see matches
→ see a prepared application. Run a security review of the whole repo: secrets in client bundles, RLS gaps, missing
auth checks on API routes, unvalidated input, file upload risks, and CRON_SECRET handling; fix what you find. Add
the privacy page, "export my data" (JSON download) and "delete my account and data". Write `README.md` with setup
steps, environment variables, how to run a scan, how to go live safely (switch `APPLY_MODE` only after a
successful dry run), and known limitations.

Done when: all tests pass, the security review has no open high issues, and a new developer can set the project up
from the README alone.

---

## Prompt 11 – Complete the product pages

Check every page listed in CLAUDE.md exists and works, and that all of them follow its "Design direction": landing, login/sign-up, onboarding, dashboard, jobs, job
detail, my CVs, applications, auto-apply settings, notifications, account, privacy, and all admin pages. The Admin link must show only for admins. Build any
that are missing. The beta must be the full product; only sign-up is invite-only.

Done when: every page in CLAUDE.md is reachable from the navigation and has working data, and `SIGNUP_MODE=open`
makes registration public with no other code change.

---

## Prompt 12 – Browser extension (after Prompts 0–11 work)

Build a Chrome (Manifest V3) extension in `/extension`. The user signs in once (short-lived token from the app).
On a job application page it shows the matching tailored CV, fills standard fields (name, email, phone, links,
work history, education, skills) and saved screening answers, and attaches the tailored PDF. It never clicks Submit,
never runs on LinkedIn or Indeed, skips sensitive or unknown questions and highlights them for the user, and stores
no CV data after the tab closes. Add a "Mark as applied" button that updates the application in the app.

Done when: on a sample Greenhouse/Lever-style form the fields fill correctly, nothing is submitted without the user,
and the extension does nothing on blocked sites.

---

## After the beta

Cover letters per job, interview preparation, reply tracking from the user's inbox, visa sponsorship filter, salary
insights, weekly progress report, subscription billing (Stripe), the Adzuna commercial licence, a UK/EU-hosted or no-training AI provider, and a
legal check of the privacy notice before charging customers.
