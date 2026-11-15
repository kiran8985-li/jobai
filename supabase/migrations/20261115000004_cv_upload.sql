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
