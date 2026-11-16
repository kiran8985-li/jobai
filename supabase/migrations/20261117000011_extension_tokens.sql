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
