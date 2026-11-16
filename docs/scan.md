# The job scan

One scan = fetch jobs from every enabled source → clean → remove duplicates → store in `jobs`.
The saved jobs are then scored against every active search (see `docs/matching.md`). A tailored CV is then prepared for each new match (see `docs/tailoring.md`). Each match is then applied for, prepared for the user, or skipped (see `docs/applying.md`).

## Running it

| How | What |
| --- | --- |
| `npm run scan` | Runs one scan from your computer, using `.env.local`. |
| `npm run scan -- reed` | Runs one source only, ignoring its "about hourly" wait. |
| `POST /api/cron/scan` | The same scan, for the scheduler. Needs the `CRON_SECRET`. |
| `.github/workflows/scan.yml` | Calls that route every 15 minutes. |
| "Run scan now" on the dashboard | The same scan for one signed-in user: only their searches are used for job queries, and only their matches, CVs and applications are processed. At most once every 10 minutes per user. |

## Sources

| Source | Needs | Runs | Notes |
| --- | --- | --- | --- |
| Demo | `DEMO_SOURCE=true` | every scan | 12 sample jobs marked "[Demo vacancy]". Apply emails are `example.com`, so nothing reaches a real employer. Turn it off before real testers join. |
| Greenhouse | `GREENHOUSE_BOARDS=monzo,another` | every scan | Public company job boards. The value is the board name from the company's Greenhouse URL. |
| Lever | `LEVER_COMPANIES=palantir,another` | every scan | Public company postings. The value is the company name from its Lever URL. |
| Adzuna | `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` | about hourly | Official API. Show "Jobs by Adzuna" wherever its jobs appear; a commercial licence is needed before charging customers. |
| Reed | `REED_API_KEY` | about hourly | Official API. |

There is no LinkedIn or Indeed source and none may be added.

## Rules the scan follows

- **One failing source never stops the others.** Its error is stored in `source_status.last_error`
  (status only, for example `HTTP 401 (check the API key)`; never a URL, key or page content).
- **Polite:** at most one request a second per source, 15-second timeout per request.
- **Merged searches:** all active search profiles are combined into distinct job-title and location
  pairs, so ten users wanting the same search cost one request. Adzuna and Reed get at most 20
  searches per run and rotate through the rest on later runs.
- **Company feeds return every vacancy**, including non-UK ones; only jobs mentioning a word from
  someone's search are kept. Location is judged later, at matching.
- **Duplicates:** jobs with the same title + company + location (ignoring case, punctuation, "Ltd",
  ", UK" and similar) are one vacancy. The copy that is easiest to apply to is kept
  (email, then a supported application system, then manual) and the other sources are listed in `also_on`.
- **Safe to re-run:** a second scan updates rows and adds no duplicates. A scan does not start while
  another has been running for under 10 minutes.
- **Switched-off sources are skipped** (`source_status.enabled`; the admin panel will control this).
- **No searches yet → only the demo source runs.**

## Setting up the 15-minute schedule (after the site is deployed)

1. Pick a long random `CRON_SECRET` (at least 16 characters) and set it in the app's settings.
2. In the GitHub repository: Settings → Secrets and variables → Actions → add `APP_URL`
   (for example `https://jobpilotai.co.uk`) and `CRON_SECRET` (the same value).
3. The "Job scan" workflow then runs every 15 minutes. Until both secrets exist it does nothing.

GitHub can delay scheduled runs by several minutes at busy times, and pauses schedules on
repositories with no activity for 60 days.

## Known limits

- Adzuna and Reed are tested with recorded-style replies only until real keys are added.
- A hosting plan with a short time limit per request (for example 10 seconds) may cut a scan short
  when many company boards are configured; each board takes at least a second.
