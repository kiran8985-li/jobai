# Security review

Reviewed 16 November 2026, after Prompt 10, across the whole repository. "Fixed" items were
changed in this review; "OK" items were checked and needed no change.

## Summary

No high-severity issue is open. One moderate dependency advisory is accepted for now (see 9).

## Findings

| # | Area | Finding | Severity | Status |
| --- | --- | --- | --- | --- |
| 1 | Secrets in browser code | `npm run check:secrets` builds the app with fake values for every secret and searches the browser bundles: none found. Secret settings are read only in files marked `server-only`, so a browser component that imports them fails the build. | — | OK |
| 2 | Row Level Security | Every table in `public` has RLS on (checked by `npm run test:db`). Users read only their own rows; matches, tailored CVs and applications are written by the server only; admin tables are closed to users. Storage buckets: users read their own folder only; only the server writes tailored files. | — | OK |
| 3 | Auth on API routes | Every route checks one of: the signed-in user (`/api/cvs/*`, `/api/account/export`), the scheduler secret (`/api/cron/scan`), or the admin flag (`/api/admin/summary`). The middleware also guards `/api/admin`, `/api/cvs` and `/api/account`. | — | OK |
| 4 | Auth on server actions | Every user action starts with `requireUser()`; every admin action starts with `adminDb()`, which checks `is_admin`. Tested: a normal user calling an admin action directly changes nothing. Where an action uses the service-role client, every query is filtered to the signed-in user's id. | — | OK |
| 5 | Public health check | `/api/health` told anyone which parts were configured (AI, email, scheduler) and the apply mode. | Low | **Fixed**: now returns only `ok`; details moved to the admin summary. |
| 6 | Browser security headers | No headers stopped the site being framed by another site (click-jacking). | Medium | **Fixed**: `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `base-uri`, `form-action`, `object-src` restrictions, `nosniff`, a referrer policy, a permissions policy, HSTS, and no `X-Powered-By`. |
| 7 | Unvalidated input | Forms are checked with zod (lengths, formats, enums); ids are checked as UUIDs; redirect targets go through `safeNext()` (same-site only); notification links and job advert links are restricted to same-site paths and `http(s)` URLs; email subjects cannot carry line breaks. | — | OK |
| 8 | File uploads | 5 MB limit (in the browser, the server and the storage bucket); type checked by the file's first bytes, not just its name; stored under a random name in a private per-user folder; at most 10 CVs per user; text extraction errors are never shown or logged. Remaining risk: a crafted PDF could make the PDF reader slow; the size limit bounds it. | Low | OK |
| 9 | Dependencies | `npm audit`: PostCSS advisories inside Next.js (build-time CSS processing). The app only processes its own CSS, so there is no attacker-controlled CSS to exploit. The fix needs Next.js 16, a breaking upgrade. | Moderate | **Accepted**: upgrade to Next.js 16 after the beta. 15.5.29 is the latest 15.x. |
| 10 | Scheduler secret | Compared in constant time; secrets under 16 characters are refused; with no secret set, the route refuses every call; POST only. | — | OK |
| 11 | Personal data in logs | No CV text, answers or emails are logged. One error log could have echoed a database message; it now logs the error type only. | Low | **Fixed** |
| 12 | Personal data sent to the AI | Name, email, phone, address, links and postcodes are removed before any AI call, and the AI client removes emails and phone numbers again from everything it sends. Employers are sent as ids only when tailoring. | — | OK |
| 13 | AI consent | There was no way to withdraw AI consent, and AI calls did not check it. | Medium | **Fixed**: Account → Withdraw AI consent. Every AI call now checks consent first and falls back to the non-AI path without it. |
| 14 | Account deletion and export | Not built before this review. | High (UK GDPR) | **Fixed**: Account → Download my data (JSON) and Delete my account (files first, then the account; every user table cascades). The last admin cannot delete their own account. |
| 15 | Suspended users | Already blocked by RLS and middleware; suspension now also ends their sessions, and the login form says why. | — | OK (improved in Prompt 9) |
| 16 | Prompt injection from job adverts | Advert text goes into AI prompts and could try to steer the AI. Its effect is bounded: tailored CVs pass the fact check, and the eligibility check can move a score by at most +10. | Low | Accepted |
| 17 | Sending emails | Switched off in code (`EMAIL_SENDING_ENABLED = false`), so no application can be sent by mistake. | — | OK |
| 19 | Browser extension | Signs in with a 12-hour code stored only as a SHA-256 fingerprint; one code per user; Disconnect revokes it at once; suspended users are refused. The extension stores only the site address and the code, runs only when the user clicks, accepts messages only from its own popup, refuses LinkedIn, Indeed and non-web pages (checked in the extension, again inside the page, and by the server), never submits, and never answers sensitive questions. It needs access to https sites to fill the page the user asks for. | — | OK (added in Prompt 12) |
| 18 | Login abuse | Rate limits on sign-in, sign-up and verification emails come from Supabase Auth. The login error does not reveal whether an email has an account. | — | OK |

## How to repeat this review

```bash
npm run typecheck && npm run lint && npm test
npm run test:db
npm run check:secrets
npm run test:e2e        # needs a local Supabase; see README.md
npm audit --omit=dev
```
