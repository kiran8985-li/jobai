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
