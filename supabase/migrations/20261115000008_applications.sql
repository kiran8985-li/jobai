-- Prompt 7: auto-apply.

-- Which search an application was made for, so each search's daily limit can be counted.
alter table public.applications
  add column search_profile_id uuid references public.search_profiles (id) on delete set null;

create index applications_profile_created on public.applications (search_profile_id, created_at desc);
create index applications_user_status on public.applications (user_id, status);
