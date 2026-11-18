-- Explicit table permissions, so the app works the same on any Supabase project.
-- Newer Supabase projects no longer grant table access to signed-in users automatically.
-- Row Level Security still decides WHICH rows each user sees; these grants only allow the kind of access.

-- Start from nothing for the public roles.
revoke all on all tables in schema public from anon, authenticated;

-- Signed-in users: read their own data (RLS limits it to their rows).
grant select on public.profiles_user, public.cvs, public.search_profiles, public.screening_answers,
  public.jobs, public.matches, public.tailored_cvs, public.applications, public.notifications
  to authenticated;

-- Signed-in users: manage their own CVs, searches and saved answers (RLS checks ownership).
grant insert, update, delete on public.cvs, public.search_profiles, public.screening_answers to authenticated;

-- Column-level updates allowed by earlier migrations (re-stated after the revoke above).
grant update (name, auto_apply_paused) on public.profiles_user to authenticated;
grant update (is_read) on public.notifications to authenticated;

-- The server (service role) does everything else: scans, matching, tailoring, admin.
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
