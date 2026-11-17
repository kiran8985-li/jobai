-- JobPilot AI: complete database setup. Paste all of this into Supabase SQL Editor and press Run, once.

-- ===== 20261115000001_schema.sql =====
-- JobPilot AI: tables. Row Level Security is switched on in 20261115000003_rls.sql.

-- One row per account. id is the Supabase auth user id.
create table public.profiles_user (
  id uuid primary key references auth.users (id) on delete cascade,
  name text,
  is_admin boolean not null default false,
  is_active boolean not null default true,
  -- When the user ticked the AI processing consent box (set in onboarding, Prompt 2).
  ai_consent_at timestamptz,
  created_at timestamptz not null default now()
);

-- An invite is bound to one email address and can be used once.
create table public.invites (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(email)),
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  used_at timestamptz,
  used_by uuid references auth.users (id) on delete set null
);
create unique index invites_one_open_per_email on public.invites (email) where used_at is null;

-- Server-side settings the database needs to know (currently: signup_mode).
create table public.app_settings (
  key text primary key,
  value text not null
);
insert into public.app_settings (key, value) values ('signup_mode', 'invite');

create table public.cvs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  filename text not null,
  storage_path text,
  raw_text text,
  profile_json jsonb,
  parsed_by text check (parsed_by in ('heuristic', 'ai')),
  approved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index cvs_user on public.cvs (user_id);

create table public.search_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  roles text[] not null default '{}',
  locations text[] not null default '{}',
  min_salary integer check (min_salary is null or min_salary >= 0),
  employment_types text[] not null default '{}',
  keywords text[] not null default '{}',
  exclude_keywords text[] not null default '{}',
  min_match integer not null default 75 check (min_match between 0 and 100),
  daily_limit integer not null default 10 check (daily_limit between 0 and 100),
  auto_apply boolean not null default false,
  consent_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Auto-apply can never be on without recorded consent.
  constraint auto_apply_needs_consent check (not auto_apply or consent_at is not null)
);
create index search_profiles_user on public.search_profiles (user_id);

create table public.screening_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null,
  answer text not null,
  updated_at timestamptz not null default now(),
  unique (user_id, key)
);

-- Shared job catalogue, written only by the scan.
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  external_id text not null,
  title text not null,
  company text,
  location text,
  salary_min integer,
  salary_max integer,
  employment_type text,
  description text,
  apply_url text,
  apply_email text,
  apply_method text not null default 'manual' check (apply_method in ('email', 'ats', 'manual')),
  questions jsonb not null default '[]',
  posted_at timestamptz,
  dedupe_key text not null unique,
  also_on text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index jobs_source_external on public.jobs (source, external_id);
create index jobs_created on public.jobs (created_at desc);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  search_profile_id uuid not null references public.search_profiles (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  score integer not null check (score between 0 and 100),
  matching_skills text[] not null default '{}',
  missing_skills text[] not null default '{}',
  reasons text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (search_profile_id, job_id)
);
create index matches_user_score on public.matches (user_id, score desc);

create table public.tailored_cvs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  cv_id uuid not null references public.cvs (id) on delete cascade,
  content_json jsonb not null,
  flags text[] not null default '{}',
  pdf_path text,
  docx_path text,
  created_at timestamptz not null default now(),
  unique (user_id, job_id)
);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  status text not null check (status in ('prepared', 'dry_run', 'sent', 'skipped', 'failed', 'manual')),
  method text check (method in ('email', 'ats', 'manual')),
  detail jsonb not null default '{}',
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One application per user per job, so re-running a scan can never apply twice.
  unique (user_id, job_id)
);
create index applications_user_created on public.applications (user_id, created_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  message text not null,
  link text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_user_created on public.notifications (user_id, created_at desc);

-- Admin-only tables.
create table public.source_status (
  name text primary key,
  enabled boolean not null default true,
  last_run timestamptz,
  last_count integer,
  last_error text
);

create table public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  purpose text not null,
  model text,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  ok boolean not null default true,
  created_at timestamptz not null default now()
);
create index ai_usage_user_created on public.ai_usage (user_id, created_at desc);

create table public.scan_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  new_jobs integer not null default 0,
  new_matches integer not null default 0,
  applications integer not null default 0,
  error text
);

-- ===== 20261115000002_auth.sql =====
-- Sign-up rules enforced in the database, so they hold even if someone calls
-- Supabase Auth directly and skips the app.

-- Runs before every new auth user. In invite mode the email must hold an unused invite.
-- Password sign-ups must also present the matching invite token (sent as user metadata).
-- Google / magic-link sign-ups prove ownership of the invited email through the provider,
-- so the email binding alone is checked for them.
create function public.enforce_invite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mode text;
  v_token text;
  v_invite public.invites%rowtype;
begin
  select value into v_mode from public.app_settings where key = 'signup_mode';

  if coalesce(v_mode, 'invite') <> 'open' then
    if new.email is null then
      raise exception 'JobPilot: an invite is required to sign up';
    end if;

    select * into v_invite
    from public.invites
    where email = lower(new.email) and used_at is null
    for update;

    if not found then
      raise exception 'JobPilot: no unused invite for this email address';
    end if;

    if coalesce(new.encrypted_password, '') <> '' then
      v_token := new.raw_user_meta_data ->> 'invite_token';
      if v_token is null or v_token <> v_invite.token then
        raise exception 'JobPilot: invite token does not match this email address';
      end if;
    end if;
  end if;

  -- The token has done its job; do not keep it in the user's metadata.
  if new.raw_user_meta_data ? 'invite_token' then
    new.raw_user_meta_data := new.raw_user_meta_data - 'invite_token';
  end if;
  return new;
end;
$$;

create trigger jobpilot_enforce_invite
  before insert on auth.users
  for each row execute function public.enforce_invite();

-- Runs after a new auth user is saved: creates the profile, makes the very first
-- account the admin, and marks the invite as used.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_first boolean;
begin
  -- Serialise so two simultaneous first sign-ups cannot both become admin.
  perform pg_advisory_xact_lock(hashtext('jobpilot_first_admin'));
  select not exists (select 1 from public.profiles_user) into v_first;

  insert into public.profiles_user (id, name, is_admin)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name', '')), ''),
    v_first
  );

  if new.email is not null then
    update public.invites
    set used_at = now(), used_by = new.id
    where email = lower(new.email) and used_at is null;
  end if;
  return new;
end;
$$;

create trigger jobpilot_handle_new_user
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- True when the caller has verified their email and has not been suspended.
-- Used by every RLS policy, so an unverified or suspended account reads nothing.
create function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users u
    join public.profiles_user p on p.id = u.id
    where u.id = (select auth.uid())
      and u.email_confirmed_at is not null
      and p.is_active
  );
$$;

-- True when the caller is an active admin.
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_active_user() and exists (
    select 1 from public.profiles_user p where p.id = (select auth.uid()) and p.is_admin
  );
$$;

revoke execute on function public.enforce_invite() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.is_active_user() from public, anon;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_active_user() to authenticated;
grant execute on function public.is_admin() to authenticated;

-- ===== 20261115000003_rls.sql =====
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

-- ===== 20261115000004_cv_upload.sql =====
-- Prompt 2: AI consent, CV files, master CV.

alter table public.cvs add column flags text[] not null default '{}';

-- A user has at most one master (approved) CV at a time.
create unique index cvs_one_master_per_user on public.cvs (user_id) where approved;

-- Records the user's consent to AI processing of their CV text. The first timestamp is kept.
create function public.record_ai_consent()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v timestamptz;
begin
  if not public.is_active_user() then
    raise exception 'JobPilot: not allowed';
  end if;
  update public.profiles_user
  set ai_consent_at = coalesce(ai_consent_at, now())
  where id = (select auth.uid())
  returning ai_consent_at into v;
  return v;
end;
$$;

create function public.has_ai_consent()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles_user p
    where p.id = (select auth.uid()) and p.ai_consent_at is not null
  );
$$;

revoke execute on function public.record_ai_consent() from public, anon;
revoke execute on function public.has_ai_consent() from public, anon;
grant execute on function public.record_ai_consent() to authenticated;
grant execute on function public.has_ai_consent() to authenticated;

-- No CV can be stored before consent, whatever the app does.
create policy cvs_need_consent on public.cvs
  as restrictive for insert to authenticated
  with check ((select public.has_ai_consent()));

-- Makes one CV the master and un-approves any previous master, in one step.
create function public.approve_cv(p_cv uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (select 1 from public.cvs where id = p_cv and user_id = (select auth.uid())) then
    raise exception 'JobPilot: CV not found';
  end if;
  update public.cvs set approved = false, updated_at = now()
  where user_id = (select auth.uid()) and approved and id <> p_cv;
  update public.cvs set approved = true, updated_at = now()
  where id = p_cv and user_id = (select auth.uid());
end;
$$;
revoke execute on function public.approve_cv(uuid) from public, anon;
grant execute on function public.approve_cv(uuid) to authenticated;

-- Private bucket for original CV files. Files live under "<user id>/<random>.<ext>".
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cvs', 'cvs', false, 5242880,
  array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain']
)
on conflict (id) do nothing;

create policy cvs_files_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'cvs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.is_active_user())
  );
create policy cvs_files_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'cvs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.is_active_user())
    and (select public.has_ai_consent())
  );
create policy cvs_files_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'cvs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.is_active_user())
  );

-- ===== 20261115000005_search_profiles.sql =====
-- Prompt 3: search profile rules, auto-apply consent, screening answers.

-- Master pause: stops auto-apply for every search profile without losing any setting.
alter table public.profiles_user add column auto_apply_paused boolean not null default false;
grant update (auto_apply_paused) on public.profiles_user to authenticated;

-- Consent rules, enforced on every write so they hold even if the app is skipped:
--  * no consent → auto-apply is forced off (withdrawing consent stops it at once);
--  * the consent time is set by the database when consent is first given and cannot be
--    backdated or changed afterwards.
create function public.search_profiles_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.consent_at is null then
    new.auto_apply := false;
  elsif tg_op = 'INSERT' or old.consent_at is null then
    new.consent_at := now();
  else
    new.consent_at := old.consent_at;
  end if;
  new.updated_at := now();

  if tg_op = 'INSERT' and (select count(*) from public.search_profiles where user_id = new.user_id) >= 10 then
    raise exception 'JobPilot: a user can have at most 10 search profiles';
  end if;
  return new;
end;
$$;

create trigger jobpilot_search_profiles_guard
  before insert or update on public.search_profiles
  for each row execute function public.search_profiles_guard();

-- Keep screening answers bounded.
alter table public.screening_answers
  add constraint screening_key_len check (char_length(key) between 1 and 220),
  add constraint screening_answer_len check (char_length(answer) between 1 and 500);

create function public.screening_answers_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.screening_answers where user_id = new.user_id) >= 40 then
    raise exception 'JobPilot: too many screening answers';
  end if;
  return new;
end;
$$;

create trigger jobpilot_screening_answers_guard
  before insert on public.screening_answers
  for each row execute function public.screening_answers_guard();

revoke execute on function public.search_profiles_guard() from public, anon, authenticated;
revoke execute on function public.screening_answers_guard() from public, anon, authenticated;

-- ===== 20261115000006_matching.sql =====
-- Prompt 5: matching.

alter table public.matches
  add column breakdown jsonb not null default '{}',
  -- Set when a hard filter removed the job for this search (excluded keyword, job type, salary, location).
  add column filtered_reason text,
  add column ai_reviewed boolean not null default false;

create index matches_profile_job on public.matches (search_profile_id, job_id);

-- Recent jobs a search has not been scored against yet. Server (service role) only.
create function public.jobs_to_match(p_profile uuid, p_limit integer)
returns setof public.jobs
language sql
stable
set search_path = ''
as $$
  select j.*
  from public.jobs j
  where j.created_at > now() - interval '45 days'
    and not exists (
      select 1 from public.matches m where m.search_profile_id = p_profile and m.job_id = j.id
    )
  order by j.created_at desc
  limit greatest(0, least(p_limit, 5000));
$$;
revoke execute on function public.jobs_to_match(uuid, integer) from public, anon, authenticated;
grant execute on function public.jobs_to_match(uuid, integer) to service_role;

-- Scores go stale when what they were based on changes. Clearing them makes the next scan
-- (or the app, straight away) score again with the new settings.
create function public.clear_matches_on_profile_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.roles is distinct from old.roles
    or new.locations is distinct from old.locations
    or new.min_salary is distinct from old.min_salary
    or new.employment_types is distinct from old.employment_types
    or new.keywords is distinct from old.keywords
    or new.exclude_keywords is distinct from old.exclude_keywords then
    delete from public.matches where search_profile_id = new.id;
  end if;
  return new;
end;
$$;
create trigger jobpilot_clear_matches_on_profile_change
  after update on public.search_profiles
  for each row execute function public.clear_matches_on_profile_change();

create function public.clear_matches_on_cv_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.approved or old.approved)
    and (new.approved is distinct from old.approved or new.profile_json is distinct from old.profile_json) then
    delete from public.matches where user_id = new.user_id;
  end if;
  return new;
end;
$$;
create trigger jobpilot_clear_matches_on_cv_change
  after update on public.cvs
  for each row execute function public.clear_matches_on_cv_change();

revoke execute on function public.clear_matches_on_profile_change() from public, anon, authenticated;
revoke execute on function public.clear_matches_on_cv_change() from public, anon, authenticated;

-- ===== 20261115000007_tailored_cvs.sql =====
-- Prompt 6: tailored CVs.

alter table public.tailored_cvs
  add column method text not null default 'reorder' check (method in ('ai', 'reorder')),
  add column updated_at timestamptz not null default now();

-- Private bucket for tailored CV files: "<user id>/<job id>.pdf" and ".docx".
-- Written by the server only; a user can read the files in their own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tailored', 'tailored', false, 5242880,
  array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do nothing;

create policy tailored_files_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'tailored'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.is_active_user())
  );

-- When the master CV changes, tailored CVs made from the old one are out of date.
-- Those already used for an application are kept (they show exactly what was sent or prepared);
-- the rest are removed so they are made again from the new master.
create or replace function public.clear_matches_on_cv_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.approved or old.approved)
    and (new.approved is distinct from old.approved or new.profile_json is distinct from old.profile_json) then
    delete from public.matches where user_id = new.user_id;
    delete from public.tailored_cvs t
    where t.user_id = new.user_id
      and not exists (select 1 from public.applications a where a.user_id = t.user_id and a.job_id = t.job_id);
  end if;
  return new;
end;
$$;

-- ===== 20261115000008_applications.sql =====
-- Prompt 7: auto-apply.

-- Which search an application was made for, so each search's daily limit can be counted.
alter table public.applications
  add column search_profile_id uuid references public.search_profiles (id) on delete set null;

create index applications_profile_created on public.applications (search_profile_id, created_at desc);
create index applications_user_status on public.applications (user_id, status);

-- ===== 20261116000009_dashboard.sql =====
-- Prompt 8: "Run scan now" cooldown, and fast unread counts.

-- When the user last asked for a scan of their own searches. Written by the server only.
alter table public.profiles_user add column last_manual_scan_at timestamptz;

create index notifications_user_unread on public.notifications (user_id) where not is_read;

-- ===== 20261116000010_invite_requests.sql =====
-- Prompt 11: "Request an invite" on the landing page.

create table public.invite_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email) and char_length(email) <= 254),
  name text check (char_length(name) <= 100),
  created_at timestamptz not null default now(),
  -- Set when the admin creates an invite for this request or dismisses it.
  handled_at timestamptz,
  outcome text check (outcome in ('invited', 'dismissed'))
);

-- Written and read by the server only (the landing page form, and the admin panel).
alter table public.invite_requests enable row level security;
revoke all on public.invite_requests from anon, authenticated;

-- ===== 20261117000011_extension_tokens.sql =====
-- Prompt 12: browser extension sign-in.

-- A short-lived code the user pastes into the extension. Only a SHA-256 fingerprint is stored, so a
-- copy of the database cannot be used to sign in as anyone.
create table public.extension_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_used_at timestamptz
);
create index extension_tokens_user on public.extension_tokens (user_id);

-- Server only.
alter table public.extension_tokens enable row level security;
revoke all on public.extension_tokens from anon, authenticated;
