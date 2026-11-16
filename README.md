# JobPilot AI

A UK web app that finds jobs matching a person's CV, tailors their CV for each job using only facts
from their approved CV, and prepares or sends applications within limits they set. This release is
an invite-only beta.

- Project brief and rules: `CLAUDE.md` (the same text is in `AGENTS.md`)
- Build prompts: `PROMPTS.md` · original kit notes: `KIT-README.md`
- How each part works: `docs/` (scan, matching, tailoring, applying, admin, privacy and AI, security review, RLS)

## What you need

- Node.js 20 or later (22 recommended) and Git
- A Supabase project (free tier is fine for the beta)
- Optional: an AI key (DeepSeek, or any OpenAI-compatible provider), Adzuna and Reed keys,
  company board names for Greenhouse and Lever. Without them the app still works: it uses
  demo jobs and its non-AI fallbacks.

## Set up

1. Install:
   ```bash
   npm install
   ```
2. Copy the settings template and fill in what you have. Every line must be present; empty values are fine.
   ```bash
   cp .env.example .env.local
   ```
3. Create the database: in Supabase, open SQL Editor and run every file in `supabase/migrations/` in
   name order (01 to 09). Or with the Supabase CLI: `npx supabase link --project-ref <ref>` then
   `npx supabase db push`.
4. In Supabase → Authentication: keep **Confirm email** on, add your site's `/auth/callback` and
   `/auth/confirm` to the redirect URLs, and connect Resend as custom SMTP before inviting testers.
   Full steps: `docs/auth-setup.md`.
5. Start the app and create your own account first (the first account becomes the admin):
   ```bash
   npm run dev
   ```
   ```bash
   npm run invite -- you@example.com
   ```
   Open the printed link, sign up, and click the link in the verification email.
6. Invite testers from Admin → Users and invites (copy each link and send it yourself).

## Settings (`.env.local`)

| Setting | Needed | What it is |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase project URL and public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase server key. Server only; never share it |
| `NEXT_PUBLIC_APP_URL` | Yes | The site's address, used in links |
| `SIGNUP_MODE` | Yes | `invite` for the beta; `open` makes sign-up public with no other change |
| `CRON_SECRET` | For the schedule | A long random string (16+ characters) shared with the GitHub workflow |
| `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL`, `DEEPSEEK_BASE_URL` | Optional | The AI provider. Any OpenAI-compatible service works; Gemini was tested with `https://generativelanguage.googleapis.com/v1beta/openai` and `gemini-3.5-flash` |
| `AI_DAILY_LIMIT_PER_USER` | Optional | AI calls per user per day (default 200) |
| `AI_PRICE_INPUT_PER_MTOK`, `AI_PRICE_OUTPUT_PER_MTOK` | Optional | Your AI provider's US-dollar prices per million tokens, for the admin cost page |
| `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, `REED_API_KEY` | Optional | Job APIs. Adzuna's free key is for evaluation only |
| `GREENHOUSE_BOARDS`, `LEVER_COMPANIES` | Optional | Comma-separated company board names |
| `DEMO_SOURCE` | Optional | `true` adds 12 sample jobs. **Set to `false` before testers join** |
| `APPLY_MODE`, `RESEND_API_KEY`, `MAIL_FROM` | Later | For sending applications by email. Sending is switched off in code for now (see below) |
| `DEFAULT_MIN_MATCH`, `DEFAULT_DAILY_LIMIT`, `SCAN_INTERVAL_MIN`, `API_SOURCES_MIN_INTERVAL_MIN` | Optional | Defaults for new searches and scan timing |

`npm run dev` checks `.env.local` against `.env.example` and stops with a clear message if a line is missing.

## Running a scan

A scan fetches new jobs, scores them, tailors a CV for each match, and prepares applications.

```bash
npm run scan
```

- One source only (ignores its hourly wait): `npm run scan -- reed`
- Every 15 minutes in production: `.github/workflows/scan.yml` calls `POST /api/cron/scan`. Add two
  GitHub repository secrets: `APP_URL` (your site, no trailing slash) and `CRON_SECRET`.
- Users can also press **Run scan now** on their dashboard (once every 10 minutes each).

## Going live safely

Applications are prepared and shown to users, but **email sending is switched off in code**
(`EMAIL_SENDING_ENABLED = false` in `src/lib/apply/index.ts`). To switch it on later:

1. Run in test mode for at least a week and read several prepared applications by hand.
2. Verify your sending domain in Resend; set `RESEND_API_KEY`, `MAIL_FROM` and a monthly spend cap.
3. Set `DEMO_SOURCE=false`.
4. Change `EMAIL_SENDING_ENABLED` to `true`, then set `APPLY_MODE=live`.

Even then, nothing is sent for a search unless its owner gave consent and switched auto-apply on.
Details: `docs/applying.md`.

## Tests

```bash
npm run typecheck && npm run lint && npm test     # unit tests, no database needed
npm run test:db                                   # RLS and sign-up rules on a throwaway local Postgres
npm run check:secrets                             # proves no secret reaches browser code
```

End-to-end tests drive the real pages. They need a **local** Supabase (Docker) and **delete every
user** in it, so they refuse to run against anything but `localhost`:

```bash
npx supabase start
```

Put the local URL and keys that command prints into `.env.local`, plus `DEMO_SOURCE=true` and a
`CRON_SECRET`, then:

```bash
npm run test:e2e
```

More detailed browser checks for each phase are in `tests/e2e/*.cjs`
(run with `node --env-file=.env.local tests/e2e/<name>.cjs`); `tests/e2e/fake-ai.cjs` is a stand-in
AI server for the ones that need AI.

## Known limitations

- **Email sending is off.** Jobs that take email applications are prepared, not sent.
- **Most jobs are Manual Apply.** Adzuna, Reed and company boards rarely give an email address, so
  users submit on the employer's site with the prepared CV and mark it applied. A form-filling
  browser extension is Prompt 12.
- **Matching is keyword based.** It recognises a fixed list of skills (aimed at IT roles) and can be
  generous on title matches; the optional AI check reviews only jobs near the threshold.
- **Location is matched by name.** A town next to a chosen city is not matched unless listed.
- **The CV reader can add general words as skills** ("sales", "customer service"); users should
  review their CV before approving.
- **The fact check compares words and figures,** not meaning. Users should read each tailored CV.
- **The AI provider is DeepSeek (servers in China)** in the consent and privacy text. Switching to
  another provider means updating that text and asking users again.
- **Adzuna and Reed** are tested with recorded-style replies only until real keys are added.
- **Dependency advisory:** PostCSS inside Next.js; fixed by Next.js 16 (see `docs/security-review.md`).
- **The privacy notice** has not been checked by a lawyer; do that before charging customers.
- Before launch, make sure `privacy@jobpilotai.co.uk` (in `src/lib/site.ts`) is a real mailbox.
