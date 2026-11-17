# Keys and accounts for real testing: one set at a time

Do one set, then tell Claude "Set N ready". Follow these rules for each item:

- **Safe to type in chat:** shown as `chat`. These are names, IDs and web addresses.
- **Secret:** shown as `secure form`. Never paste it in chat. Say "Set N ready" and Claude opens a secure form for you to paste it into.

---

## Set 1: Job search (finding jobs)

| # | What | Where to get it | How to give it |
| --- | --- | --- | --- |
| 1a | Adzuna **App ID** | https://developer.adzuna.com/signup, then Dashboard → API Access Details | chat |
| 1b | Adzuna **App Key** | Same page | secure form |
| 1c | Reed **API key** | https://www.reed.co.uk/developers/jobseeker (sign in, then "Register for an API key") | secure form |
| 1d | Company board names (optional) | A company's careers page on `job-boards.greenhouse.io/<name>` or `jobs.lever.co/<name>`. The `<name>` part is what you send, e.g. `monzo, deliveroo` | chat |

Test after this set: a scan pulls real UK jobs from Adzuna, Reed and the boards.

---

## Set 2: Resume AI (reading and tailoring CVs)

Pick **one** provider.

| # | What | Where to get it | How to give it |
| --- | --- | --- | --- |
| 2a | **Gemini** API key (with billing on, so it isn't rate-limited) | https://aistudio.google.com/apikey, then billing at https://aistudio.google.com/usage | secure form |
| 2a (or) | **DeepSeek** API key | https://platform.deepseek.com/api_keys (add a few pounds credit) | secure form |
| 2b | Monthly spending cap you set (e.g. £10) | In the provider's billing page | chat |

Test after this set: upload your resume, then check that AI reading, scoring and tailoring all succeed (no "reorder only" flags).

---

## Set 3: Database and login (Supabase)

| # | What | Where to get it | How to give it |
| --- | --- | --- | --- |
| 3a | Create a project (region: London) | https://supabase.com/dashboard/new | — |
| 3b | **Project URL** | Project → Settings → API | chat |
| 3c | **anon / public key** | Same page | chat |
| 3d | **service_role key** | Same page | secure form |
| 3e | Database password | The one you set when creating the project | secure form |

Test after this set: Claude creates the tables, then you sign up as the first (admin) account.

---

## Set 4: Email (verification emails, alerts)

| # | What | Where to get it | How to give it |
| --- | --- | --- | --- |
| 4a | A domain, e.g. `jobpilotai.co.uk` | Any registrar (Namecheap, Cloudflare, 123-reg) | chat |
| 4b | Resend account plus the domain verified | https://resend.com/domains | — |
| 4c | Resend **API key** | https://resend.com/api-keys | secure form |
| 4d | From address, e.g. `JobPilot AI <hello@jobpilotai.co.uk>` | Your choice | chat |

Test after this set: invite emails and verification emails arrive in a real inbox. (Sending job applications by email stays switched off.)

---

## Set 5: Website online (hosting and 15-minute scans)

| # | What | Where to get it | How to give it |
| --- | --- | --- | --- |
| 5a | Vercel account linked to GitHub. **Pro plan** is recommended: on the free plan, scans stop after 60 seconds | https://vercel.com/new, then import `kiran8985-li/jobai` | — |
| 5b | Site address, e.g. `https://jobpilotai.co.uk` | Vercel → Project → Domains | chat |
| 5c | GitHub secrets `APP_URL` and `CRON_SECRET` | https://github.com/kiran8985-li/jobai/settings/secrets/actions (Claude can generate the secret) | — |

Test after this set: the site works on the internet and scans run every 15 minutes.

---

## Set 6: Optional extras

| # | What | Where to get it | How to give it |
| --- | --- | --- | --- |
| 6a | Google sign-in: OAuth **Client ID** | https://console.cloud.google.com/apis/credentials | chat |
| 6b | Google OAuth **Client secret** | Same page | secure form |
| 6c | Privacy mailbox `privacy@<your domain>` | Your email provider | chat |
| 6d | Tester list (names and emails) for invites | — | chat |

---

### Suggested order

Set 2 (AI) → Set 1 (jobs) → Set 3 (Supabase) → Set 4 (email) → Set 5 (online) → Set 6.

Sets 1 and 2 can be tested straight away on this machine. Sets 3 to 5 make it real for testers.
