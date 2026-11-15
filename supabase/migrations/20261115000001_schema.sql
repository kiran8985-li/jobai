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
