-- Row Level Security. See docs/rls.md for the plain-English list.
-- The service role (server-only key) bypasses RLS; the scan and admin pages use it.
-- Tables with RLS on and no policy are closed to normal users entirely.

alter table public.profiles_user enable row level security;
alter table public.invites enable row level security;
alter table public.app_settings enable row level security;
alter table public.cvs enable row level security;
alter table public.search_profiles enable row level security;
alter table public.screening_answers enable row level security;
alter table public.jobs enable row level security;
alter table public.matches enable row level security;
alter table public.tailored_cvs enable row level security;
alter table public.applications enable row level security;
alter table public.notifications enable row level security;
alter table public.source_status enable row level security;
alter table public.ai_usage enable row level security;
alter table public.scan_runs enable row level security;

-- Signed-out visitors get nothing from any table.
revoke all on all tables in schema public from anon;

-- profiles_user: read own row; may change only their own name.
-- is_admin, is_active and ai_consent_at are written by the server only.
create policy profiles_select_own on public.profiles_user
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles_user
  for update to authenticated
  using (id = (select auth.uid()) and (select public.is_active_user()))
  with check (id = (select auth.uid()));
revoke insert, update, delete on public.profiles_user from authenticated;
grant update (name) on public.profiles_user to authenticated;

-- User-owned tables the user edits directly: full access to own rows only.
create policy cvs_own on public.cvs
  for all to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_user()))
  with check (user_id = (select auth.uid()) and (select public.is_active_user()));

create policy search_profiles_own on public.search_profiles
  for all to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_user()))
  with check (user_id = (select auth.uid()) and (select public.is_active_user()));

create policy screening_answers_own on public.screening_answers
  for all to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_user()))
  with check (user_id = (select auth.uid()) and (select public.is_active_user()));

-- Tables the server writes for the user: the user may only read their own rows.
create policy matches_select_own on public.matches
  for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_user()));
revoke insert, update, delete on public.matches from authenticated;

create policy tailored_cvs_select_own on public.tailored_cvs
  for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_user()));
revoke insert, update, delete on public.tailored_cvs from authenticated;

create policy applications_select_own on public.applications
  for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_user()));
revoke insert, update, delete on public.applications from authenticated;

-- notifications: read own; may only flip is_read.
create policy notifications_select_own on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_user()));
create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_user()))
  with check (user_id = (select auth.uid()));
revoke insert, update, delete on public.notifications from authenticated;
grant update (is_read) on public.notifications to authenticated;

-- jobs: shared catalogue, read-only for active users.
create policy jobs_select_active on public.jobs
  for select to authenticated using ((select public.is_active_user()));
revoke insert, update, delete on public.jobs from authenticated;

-- Admin-only tables: no policies, and no privileges for normal users.
revoke all on public.invites, public.app_settings, public.source_status, public.ai_usage, public.scan_runs
  from authenticated;
