# Row Level Security (RLS)

Every table in `public` has RLS switched on (`supabase/migrations/20261115000003_rls.sql`).
"Active user" below means: signed in, email verified, and not suspended (`is_active_user()`).
Signed-out visitors (`anon`) have no access to any table. The server-only service role key
bypasses RLS; only the scan, the invite script and admin code (after an `is_admin` check) use it.

## User tables

| Table | Policy | What a normal user can do |
| --- | --- | --- |
| `profiles_user` | `profiles_select_own`, `profiles_update_own` | Read their own row. Change only their own `name` and `auto_apply_paused`. Cannot change `is_admin`, `is_active` or `ai_consent_at`. |
| `cvs` | `cvs_own`, `cvs_need_consent` | Read, add, change and delete their own CVs. No CV can be added before AI consent is recorded. |
| `search_profiles` | `search_profiles_own` | Read, add, change and delete their own search profiles. |
| `screening_answers` | `screening_answers_own` | Read, add, change and delete their own answers. |
| `matches` | `matches_select_own` | Read their own matches. Written by the server only. |
| `tailored_cvs` | `tailored_cvs_select_own` | Read their own tailored CVs. Written by the server only. |
| `applications` | `applications_select_own` | Read their own applications. Written by the server only, so an application cannot be forged. |
| `notifications` | `notifications_select_own`, `notifications_update_own` | Read their own. Change only `is_read`. |
| `jobs` | `jobs_select_active` | Any active user can read the shared job catalogue. Written by the scan only. |

## CV files (Supabase Storage, private bucket `cvs`)

| Policy | What a normal user can do |
| --- | --- |
| `cvs_files_select_own`, `cvs_files_insert_own`, `cvs_files_delete_own` | Read, add and delete files only inside their own folder (`<user id>/...`). Adding a file needs AI consent. Files are limited to 5 MB and to PDF, Word (.docx) and plain text. |

## Admin-only tables (no policies, no privileges: closed to normal users)

`invites`, `app_settings`, `source_status`, `ai_usage`, `scan_runs`.

## Rules enforced in the database as well as the app

- **Invite-only sign-up.** A trigger on `auth.users` refuses a new account unless the email holds an
  unused invite. Password sign-ups must also present that invite's token. This holds even when
  someone calls Supabase Auth directly and skips the app. `SIGNUP_MODE=open` turns the check off.
- **First account is the admin**; every later account is a normal user.
- **Unverified or suspended accounts read and write nothing** (every policy calls `is_active_user()`).
- **No CV before AI consent.** `record_ai_consent()` stores the timestamp (the first one is kept); the
  `cvs` table and the file bucket both refuse inserts until it exists.
- **One master CV per user** (unique index on approved CVs); `approve_cv()` swaps it in one step.
- **Auto-apply needs consent.** A trigger on `search_profiles` forces `auto_apply` off whenever
  `consent_at` is empty, so withdrawing consent stops auto-apply in the same write. The database sets
  the consent time itself; it cannot be backdated or changed. A check constraint backs this up.
- **Master pause.** `profiles_user.auto_apply_paused` is the user's own switch (the only columns a
  user can change on their profile row are `name` and this one).
- **Bounded data.** At most 10 search profiles and 40 screening answers per user.
- **One application per user per job** (unique constraint), so a re-run can never apply twice.

## How this is tested

- `npm run test:db` applies the migrations to a throwaway local Postgres and runs
  `supabase/tests/rls_test.sql` (sign-up rules, per-user isolation, admin tables, suspension).
- `node --env-file=.env.local tests/e2e/auth-flow.cjs` and `tests/e2e/cv-flow.cjs` and `tests/e2e/profiles-flow.cjs` drive the real pages against a local
  Supabase (`npx supabase start`). Never run it against a real project: it wipes and creates users.
