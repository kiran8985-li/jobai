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
