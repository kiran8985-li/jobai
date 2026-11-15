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
