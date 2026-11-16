# Setting up sign-in on your Supabase project

Do these once, in order.

## 1. Create the tables

Supabase dashboard → SQL Editor. Paste and run each file in `supabase/migrations/`, in name order
(`...01_schema.sql`, `...02_auth.sql`, `...03_rls.sql`, `...04_cv_upload.sql`, `...05_search_profiles.sql`, `...06_matching.sql`, `...07_tailored_cvs.sql`, `...08_applications.sql`, `...09_dashboard.sql`). Or, with the Supabase CLI:
`npx supabase link --project-ref <your-ref>` then `npx supabase db push`.

## 2. Check the Auth settings (Authentication → Sign In / Providers)

- **Confirm email: ON.** This is what makes email verification compulsory. If it is off, Supabase
  marks every new account as verified and the rule is lost.
- **Allow new users to sign up: ON** (the database trigger does the invite check).
- **Anonymous sign-ins: OFF.**
- **URL Configuration:** Site URL = your app address. Add `<app address>/auth/callback` and
  `<app address>/auth/confirm` to Redirect URLs (for local work: `http://localhost:3000/...`).

## 3. Google sign-in (optional; email sign-in works without it)

Create an OAuth client in Google Cloud Console, then paste its client ID and secret into
Authentication → Providers → Google. Supabase shows the callback address to give Google.
In invite mode a Google account only gets in if its email holds an invite.

## 4. Recommended: verification links that work in any browser

By default the link in the verification email only signs the user in when opened in the same
browser they signed up in. Opened elsewhere, the email is still verified and they are asked to
log in. To make it seamless, change Authentication → Emails → "Confirm signup" so the link is:

`{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/dashboard`

## 5. Create your own account (it becomes the admin)

1. Fill in the three Supabase values in `.env.local`.
2. `npm run invite -- you@example.com` prints a sign-up link. It works once, for that address only.
3. Open the link, sign up, click the link in the verification email.

The **first** account created becomes the admin, so create yours before inviting anyone.
Invite testers the same way until the admin panel (Prompt 9) is built.

## Opening sign-up later

Set `SIGNUP_MODE=open` and restart or redeploy. The app tells the database at start-up; no code
change. It needs `SUPABASE_SERVICE_ROLE_KEY` to do that. Without it the database stays invite-only.

## Supabase's built-in email limit

The free built-in mailer sends only a few emails an hour. That is enough to set up your own
account. Before inviting testers, connect Resend as custom SMTP (Authentication → Emails → SMTP).
