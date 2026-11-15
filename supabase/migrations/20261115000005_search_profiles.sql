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
