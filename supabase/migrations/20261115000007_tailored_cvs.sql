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
