# JobPilot AI – project brief

JobPilot AI is a UK web platform that finds jobs matching a user's CV, tailors the CV for each job, and
applies automatically within limits the user sets. First release: invite-only beta (8–10 IT-focused testers, about 2 weeks).
After the beta it becomes a monthly subscription product.

Read this file at the start of every session. Follow the rules below even when a prompt does not repeat them.

## Beta = the final product

The beta is the complete product with every page and feature below. The ONLY difference from the public launch is
access: sign-up is **invite-only with a verified email**. Do not cut pages or features for the beta. To open the
product to everyone later, switch `SIGNUP_MODE` from `invite` to `open`; nothing else should change.

**Beta plan.** 8–10 testers, all working in IT/computing, using real CVs and applying for real jobs like normal
customers. The site is focused on computer/IT jobs but works for any job type. Testers are normal users only: no
admin panel for them and **no in-app feedback button** (they report back to the owner in person). The owner keeps
their own notes. Success = at least half the testers get a reply or interview and no wrong application is sent.
Auto-apply is **fully automatic where it is safe** (owner's decision, 22 Nov 2026): by email, or by the **apply robot**,
which fills the employer's own application form on the server and presses Submit. The user gives one consent when they
start (no approval per application). Anything the robot must not or cannot do (a sensitive or unanswerable required
question, an "are you a robot" check, LinkedIn/Indeed) becomes a fully prepared Manual Apply with the reason. Every job
shows clearly whether it was sent or is waiting for the user.

## The core loop

Every 15 minutes a scan runs (company feeds such as Greenhouse/Lever every run; Adzuna and Reed about hourly, to respect
their limits): fetch new jobs from all enabled sources → clean and deduplicate → score each job
against every active search profile → for matches above the user's threshold, tailor the CV → apply
automatically (email or a supported integration) within the user's daily limit → notify the user.
Jobs that cannot be automated stay available as **Manual Apply** with a prepared application.

## Stack

| Part | Choice |
| --- | --- |
| App | Next.js (App Router) + TypeScript + Tailwind CSS, responsive, light and dark mode |
| Auth, database, files | Supabase: Auth (Google + email), Postgres with Row Level Security, Storage for CVs and PDFs |
| AI | DeepSeek API through its OpenAI-compatible endpoint (`openai` npm package with a custom `baseURL`). Model name comes from `DEEPSEEK_MODEL`; never hard-code it |
| Email | Resend (applications and alerts) |
| CV input | `unpdf` for PDF text, `mammoth` for .docx |
| CV output | `docx` package for Word, `@react-pdf/renderer` (or `pdf-lib`) for PDF; single-column ATS-friendly template |
| Scheduler | A protected route `/api/cron/scan` called every 15 minutes by a GitHub Actions workflow (`CRON_SECRET` header). Locally: `npm run scan` runs the same function |
| Tests | Vitest for logic, Playwright for a short end-to-end flow |

Note: Vercel Hobby cron only runs once a day, which is why the 15-minute schedule uses GitHub Actions.

## Non-negotiable rules

1. **Never invent CV content.** A tailored CV may only reorder, select and reword facts that exist in the user's
   approved master CV. Every bullet, skill, employer, date and number must trace back to the master. A validator
   enforces this in code; anything that fails is dropped and flagged, never sent.
2. **Dry run by default.** `APPLY_MODE=dry_run` prepares applications (CV, email, answers) and stores them but sends
   nothing; `ROBOT_MODE=dry_run` fills employer forms, keeps a screenshot, cuts the page off from the network and stops
   before Submit. Real sending needs `APPLY_MODE=live` / `ROBOT_MODE=live` AND the user's auto-apply consent.
3. **Skip, don't guess.** A question with no saved answer may be answered by AI **only from facts in the user's CV and
   saved answers** (every number must appear in the CV; never salary, right to work, notice, licences, location or other
   personal facts). If it still cannot be answered, or it is sensitive (disability, ethnicity, gender, health, criminal
   record, religion, sexual orientation), the application is not submitted and the user is notified. Never get past
   an "are you a robot" check.
4. **No LinkedIn or Indeed automation or scraping.** Allowed sources: official APIs (Adzuna, Reed), public ATS
   job-board feeds (Greenhouse, Lever, Ashby, Workable), partner feeds, and career pages only where robots.txt and
   the terms allow it, at a slow rate, behind a per-source on/off switch. Adzuna: free key is for evaluation; show "Jobs by Adzuna"
   attribution and get a commercial licence before charging customers.
5. **Invite-only, verified sign-up.** In `SIGNUP_MODE=invite` an account needs a valid, unused invite token bound to the
   email address, and the user must verify that email (Supabase email confirmation) before they can use the app.
6. **Secrets stay on the server.** `SUPABASE_SERVICE_ROLE_KEY`, `DEEPSEEK_API_KEY`, `RESEND_API_KEY`,
   `CRON_SECRET` are only read in server code. Never expose them to the browser, never commit `.env.local`.
7. **UK GDPR basics.** At sign-up show a required consent tick box saying CV text is processed by DeepSeek (servers
   in China, may be used for training unless opted out) and store the consent with a timestamp; no CV upload before
   consent. Provide "export my data" and "delete my data", keep a privacy page (what is stored, why, processors:
   DeepSeek, Supabase, Resend, retention), and never log CV contents. **Redact before AI:** strip name, email,
   phone and address from CV text before any AI call and re-insert them in the final CV/email in code. Keep the AI
   provider swappable behind one interface (a UK/EU-hosted or no-training provider is planned before paid launch).
8. **Cost and abuse limits.** Per-user daily AI call limit, per-user daily application limit, AI calls logged
   (user, purpose, tokens) for the admin cost page.
9. **Every AI call has a non-AI fallback** (heuristic parser, keyword matcher, reorder-only tailoring) so the app
   works offline and in tests with no key.
10. Row Level Security on every user table; admin pages check an `is_admin` flag on the server.

## Data model (Postgres)

`profiles_user` (id = auth user id, name, is_admin, is_active) · `invites` (email, token, used_at) ·
`cvs` (user, filename, storage path, raw_text, profile_json, parsed_by, approved) ·
`search_profiles` (user, name, roles[], locations[], min_salary, employment_types[], keywords[], exclude_keywords[],
min_match default 75, daily_limit default 10, auto_apply, consent_at, is_active) ·
`screening_answers` (user, key, answer) ·
`jobs` (source, external_id, title, company, location, salary_min/max, employment_type, description, apply_url,
apply_email, apply_method email|ats|manual, questions[], posted_at, dedupe_key unique, also_on[]) ·
`matches` (user, search_profile, job, score 0–100, matching_skills[], missing_skills[], reasons[]) ·
`tailored_cvs` (user, job, cv, content_json, flags[], pdf_path, docx_path) ·
`applications` (user, job, status prepared|dry_run|sent|skipped|failed|manual, method, detail, sent_at) ·
`notifications` (user, kind, message, link, is_read) · `source_status` (name, enabled, last_run, last_count, last_error) ·
`ai_usage` (user, purpose, model, tokens, ok) · `scan_runs` (started, finished, new_jobs, new_matches, applications, error).

## Pages

Public: landing (request invite), login/sign-up, privacy.
Job seeker: onboarding (upload CV → review → preferences), dashboard, job list (scores, matching/missing skills),
job detail (tailored CV preview, Apply or Manual Apply), my CVs (master + tailored, PDF/Word download),
applications tracker, auto-apply settings (consent, limits, screening answers), notifications, account (export/delete data).
Testers never see Admin: the Admin link and routes are visible only to `is_admin` users.
Admin: dashboard, users and invites, job sources (on/off, last run, errors), application log, AI usage and cost, system health.

## Matching score (0–100)

Role/title fit 35 · required-skill overlap 45 · location 10 · salary 10. Hard filters first (excluded keywords,
employment type, salary far below minimum). Show matching and missing skills and a one-line reason per job.
Optionally ask the AI to review jobs at or above `min_match − 10`, capped per scan, and use its adjustment.

## Browser extension (Prompt 12, after the core app works)

A Chrome extension that fills application forms from the approved master CV and the tailored CV for the job. The
user reviews and presses Submit themselves; it never submits on its own and never runs on LinkedIn or Indeed (submitting
automatically is the server-side apply robot's job, not the extension's). It
reads data only from the user's own account via a short-lived token.

## Reference code

`reference/` holds working Python from an earlier prototype: `cvparse.py` (text extraction, heuristic parser, AI
parse with verify-against-text step), `skills.py` (skill vocabulary and matcher), `sources.py` (Adzuna, Reed,
Greenhouse, Lever and demo connectors), `ai.py` (JSON-mode chat with usage logging and a daily limit),
`sample_cv.txt`. Port the logic to TypeScript; do not copy the Python into the app.

## Design direction

Modern, friendly and clean; mobile-first and fully responsive (works at 375 px), with light and dark mode.
- Accent: violet `#6C4DFF` (hover `#4B32D6`, tint `#EEEAFF`). Ink/dark sidebar `#14122B`, page background `#F5F5FB`,
  borders `#E6E4F2`. Success green, warning amber, error red for status chips only.
- Font: Plus Jakarta Sans (400–800), bold page titles, generous spacing, rounded cards (about 18 px) and controls (about 12 px).
- Layout: dark left sidebar on desktop that becomes a bottom or slide-out menu on phones; the Admin link shows only for admins.
- Status chips everywhere an application appears: Sent (green), Waiting for you (violet), Prepared/dry run (grey), Skipped (amber), Failed (red).
- Buttons at least 44 px tall, clear empty/loading/error states, no emoji.
- The reference mock-ups are in the "JobPilot AI – Front End" canvas; treat them as a guide, not a fixed spec.

## How to work

- Work one phase at a time from `PROMPTS.md`. Plan first, then build, then run it.
- After each phase: run the tests and the app, fix what breaks, and make a git commit.
- Keep files small and named by purpose. No secrets in code. Prefer boring, well-known libraries.
- If a requirement is unclear, ask one short question instead of guessing.
