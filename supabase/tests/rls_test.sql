-- Proves the sign-up and RLS rules. Any failed check raises and stops the run.
\set ON_ERROR_STOP on

create function pg_temp.act_as(p_role text, p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), false);
  perform set_config('role', p_role, false);
end $$;
create function pg_temp.reset() returns void language plpgsql as $$
begin
  perform set_config('role', 'none', false);
  perform set_config('request.jwt.claim.sub', '', false);
end $$;
grant execute on all functions in schema pg_temp to public;

do $$
declare
  admin_id uuid; alice_id uuid; bob_id uuid;
  tok_admin text; tok_alice text; tok_bob text; tok_carol text;
  n integer; ok boolean; job uuid;
begin
  insert into public.invites (email) values ('owner@example.com') returning token into tok_admin;
  insert into public.invites (email) values ('alice@example.com') returning token into tok_alice;
  insert into public.invites (email) values ('bob@example.com') returning token into tok_bob;
  insert into public.invites (email) values ('carol@example.com') returning token into tok_carol;

  -- 1. An uninvited email cannot register (with a made-up token or with none).
  begin
    insert into auth.users (email, encrypted_password, raw_user_meta_data)
    values ('mallory@example.com', 'x', jsonb_build_object('invite_token', 'made-up'));
    raise exception 'FAIL 1a: uninvited email registered';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    insert into auth.users (email) values ('mallory@example.com');
    raise exception 'FAIL 1b: uninvited email registered through a provider';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;

  -- 2. An invite for one email cannot be used by another.
  begin
    insert into auth.users (email, encrypted_password, raw_user_meta_data)
    values ('mallory@example.com', 'x', jsonb_build_object('invite_token', tok_alice));
    raise exception 'FAIL 2a: alice''s token used by another email';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    insert into auth.users (email, encrypted_password, raw_user_meta_data)
    values ('alice@example.com', 'x', jsonb_build_object('invite_token', tok_bob));
    raise exception 'FAIL 2b: bob''s token accepted for alice';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    insert into auth.users (email, encrypted_password) values ('alice@example.com', 'x');
    raise exception 'FAIL 2c: password sign-up accepted with no token';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;

  -- 3. Invited emails can register; the first account becomes the admin; token is not kept.
  insert into auth.users (email, encrypted_password, raw_user_meta_data, email_confirmed_at)
  values ('owner@example.com', 'x', jsonb_build_object('invite_token', tok_admin, 'name', 'Owner'), now())
  returning id into admin_id;
  insert into auth.users (email, encrypted_password, raw_user_meta_data, email_confirmed_at)
  values ('Alice@Example.com', 'x', jsonb_build_object('invite_token', tok_alice), now())
  returning id into alice_id;
  -- Bob registers but has NOT verified his email yet.
  insert into auth.users (email, encrypted_password, raw_user_meta_data)
  values ('bob@example.com', 'x', jsonb_build_object('invite_token', tok_bob))
  returning id into bob_id;
  -- Carol signs up with Google (no password, no token): the invited email is enough.
  insert into auth.users (email, email_confirmed_at) values ('carol@example.com', now());

  select is_admin into ok from public.profiles_user where id = admin_id;
  if not ok then raise exception 'FAIL 3a: first account is not admin'; end if;
  select count(*) into n from public.profiles_user where is_admin;
  if n <> 1 then raise exception 'FAIL 3b: expected exactly one admin, got %', n; end if;
  select count(*) into n from public.invites where used_at is null;
  if n <> 0 then raise exception 'FAIL 3c: % invites still unused', n; end if;
  select count(*) into n from auth.users where raw_user_meta_data ? 'invite_token';
  if n <> 0 then raise exception 'FAIL 3d: invite token kept in user metadata'; end if;

  -- 4. A used invite cannot be used again.
  delete from auth.users where email = 'carol@example.com';
  begin
    insert into auth.users (email, encrypted_password, raw_user_meta_data)
    values ('carol@example.com', 'x', jsonb_build_object('invite_token', tok_carol));
    raise exception 'FAIL 4: used invite accepted again';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;

  -- Seed data as the server would.
  insert into public.jobs (source, external_id, title, dedupe_key) values ('demo', '1', 'Python Developer', 'k1')
  returning id into job;
  insert into public.cvs (user_id, filename) values (admin_id, 'owner.pdf');
  insert into public.search_profiles (user_id, name) values (admin_id, 'Owner search');
  insert into public.applications (user_id, job_id, status) values (admin_id, job, 'dry_run');
  insert into public.notifications (user_id, kind, message) values (admin_id, 'info', 'hello owner');
  insert into public.notifications (user_id, kind, message) values (alice_id, 'info', 'hello alice');
  insert into public.source_status (name) values ('demo');

  -- 5. Alice (verified, normal user) sees only her own rows.
  perform pg_temp.act_as('authenticated', alice_id);
  -- 5.0 No CV row or file before AI consent; consent keeps its first timestamp.
  begin
    insert into public.cvs (user_id, filename) values (alice_id, 'alice.pdf');
    raise exception 'FAIL 5.0a: CV stored before consent';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    insert into storage.objects (bucket_id, name) values ('cvs', alice_id::text || '/a.pdf');
    raise exception 'FAIL 5.0b: CV file stored before consent';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  perform public.record_ai_consent();
  if public.record_ai_consent() is null then raise exception 'FAIL 5.0c: consent not recorded'; end if;
  insert into public.cvs (user_id, filename) values (alice_id, 'alice.pdf');
  insert into storage.objects (bucket_id, name) values ('cvs', alice_id::text || '/a.pdf');
  begin
    insert into storage.objects (bucket_id, name) values ('cvs', admin_id::text || '/planted.pdf');
    raise exception 'FAIL 5.0d: file written into another user''s folder';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  -- 5.1 Only one master CV at a time; approving another swaps it.
  insert into public.cvs (user_id, filename) values (alice_id, 'alice2.pdf');
  perform public.approve_cv((select id from public.cvs where filename = 'alice.pdf'));
  perform public.approve_cv((select id from public.cvs where filename = 'alice2.pdf'));
  select count(*) into n from public.cvs where approved;
  if n <> 1 then raise exception 'FAIL 5.1a: % master CVs', n; end if;
  begin
    perform public.approve_cv((select id from public.cvs where filename = 'owner.pdf'));
    raise exception 'FAIL 5.1b: approved another user''s CV';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  delete from public.cvs where filename = 'alice2.pdf';
  select count(*) into n from public.cvs;
  if n <> 1 then raise exception 'FAIL 5a: alice sees % cvs', n; end if;
  select count(*) into n from public.search_profiles;
  if n <> 0 then raise exception 'FAIL 5b: alice sees another user''s search profile'; end if;
  select count(*) into n from public.applications;
  if n <> 0 then raise exception 'FAIL 5c: alice sees another user''s application'; end if;
  select count(*) into n from public.notifications;
  if n <> 1 then raise exception 'FAIL 5d: alice sees % notifications', n; end if;
  select count(*) into n from public.profiles_user;
  if n <> 1 then raise exception 'FAIL 5e: alice sees % profiles', n; end if;
  select count(*) into n from public.jobs;
  if n <> 1 then raise exception 'FAIL 5f: alice cannot read the job catalogue'; end if;

  -- 6. Alice cannot write rows for someone else, or touch the owner's rows.
  begin
    insert into public.cvs (user_id, filename) values (admin_id, 'planted.pdf');
    raise exception 'FAIL 6a: alice inserted a CV for another user';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  update public.cvs set filename = 'hacked' where user_id = admin_id;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL 6b: alice updated another user''s CV'; end if;
  delete from public.search_profiles where user_id = admin_id;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL 6c: alice deleted another user''s profile'; end if;

  -- 7. Alice cannot make herself admin, and cannot write server-owned tables.
  begin
    update public.profiles_user set is_admin = true where id = alice_id;
    raise exception 'FAIL 7a: alice made herself admin';
  exception when insufficient_privilege then null;
  end;
  update public.profiles_user set name = 'Alice' where id = alice_id;
  begin
    insert into public.applications (user_id, job_id, status) values (alice_id, job, 'sent');
    raise exception 'FAIL 7b: alice forged an application';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.jobs (source, external_id, title, dedupe_key) values ('x', 'x', 'x', 'x');
    raise exception 'FAIL 7c: alice inserted a job';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.notifications set message = 'edited' where user_id = alice_id;
    raise exception 'FAIL 7d: alice edited a notification message';
  exception when insufficient_privilege then null;
  end;
  update public.notifications set is_read = true where user_id = alice_id;

  -- 8. Admin-only tables are closed to normal users.
  begin
    perform 1 from public.invites;
    raise exception 'FAIL 8a: alice read invites';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.ai_usage;
    raise exception 'FAIL 8b: alice read ai_usage';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.source_status set enabled = false;
    raise exception 'FAIL 8c: alice changed a job source';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.app_settings set value = 'open';
    raise exception 'FAIL 8d: alice opened sign-up';
  exception when insufficient_privilege then null;
  end;
  if public.is_admin() then raise exception 'FAIL 8e: alice counts as admin'; end if;

  -- 9. Bob (email not verified) can use nothing.
  perform pg_temp.act_as('authenticated', bob_id);
  select count(*) into n from public.jobs;
  if n <> 0 then raise exception 'FAIL 9a: unverified user read jobs'; end if;
  begin
    insert into public.cvs (user_id, filename) values (bob_id, 'bob.pdf');
    raise exception 'FAIL 9b: unverified user uploaded a CV';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;

  -- 10. A suspended user is locked out at once.
  perform pg_temp.reset();
  update public.profiles_user set is_active = false where id = alice_id;
  perform pg_temp.act_as('authenticated', alice_id);
  select count(*) into n from public.cvs;
  if n <> 0 then raise exception 'FAIL 10: suspended user still reads data'; end if;

  -- 11. The owner counts as admin; signed-out visitors get nothing.
  perform pg_temp.act_as('authenticated', admin_id);
  if not public.is_admin() then raise exception 'FAIL 11a: owner is not admin'; end if;
  perform pg_temp.act_as('anon', null);
  begin
    perform 1 from public.jobs;
    raise exception 'FAIL 11b: signed-out visitor read jobs';
  exception when insufficient_privilege then null;
  end;

  -- 12. Auto-apply consent rules hold in the database, for the user's own direct writes too.
  perform pg_temp.act_as('authenticated', admin_id);
  update public.search_profiles set auto_apply = true where user_id = admin_id;
  select auto_apply into ok from public.search_profiles where user_id = admin_id;
  if ok then raise exception 'FAIL 12a: auto-apply switched on without consent'; end if;
  update public.search_profiles set consent_at = '2001-01-01', auto_apply = true where user_id = admin_id;
  select auto_apply and consent_at > now() - interval '1 minute' into ok from public.search_profiles where user_id = admin_id;
  if not ok then raise exception 'FAIL 12b: consent time was backdated, or auto-apply did not turn on with consent'; end if;
  update public.search_profiles set consent_at = '2001-01-01' where user_id = admin_id;
  select consent_at > now() - interval '1 minute' into ok from public.search_profiles where user_id = admin_id;
  if not ok then raise exception 'FAIL 12c: consent time was changed after it was given'; end if;
  update public.search_profiles set consent_at = null where user_id = admin_id;
  select auto_apply into ok from public.search_profiles where user_id = admin_id;
  if ok then raise exception 'FAIL 12d: withdrawing consent left auto-apply on'; end if;
  insert into public.search_profiles (user_id, name, auto_apply) values (admin_id, 'sneaky', true);
  select bool_or(auto_apply) into ok from public.search_profiles where user_id = admin_id;
  if ok then raise exception 'FAIL 12e: new profile created with auto-apply on and no consent'; end if;
  begin
    for n in 1..9 loop
      insert into public.search_profiles (user_id, name) values (admin_id, 'p' || n);
    end loop;
    raise exception 'FAIL 12f: more than 10 search profiles allowed';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  -- Master pause is the user's own switch; admin flag still is not.
  update public.profiles_user set auto_apply_paused = true where id = admin_id;
  insert into public.screening_answers (user_id, key, answer) values (admin_id, 'notice_period', '1 month');
  perform pg_temp.act_as('authenticated', bob_id);
  select count(*) into n from public.screening_answers;
  if n <> 0 then raise exception 'FAIL 12g: another user read screening answers'; end if;
  perform pg_temp.reset();

  -- 13. Open mode: anyone can register, no invite needed.
  update public.app_settings set value = 'open' where key = 'signup_mode';
  insert into auth.users (email, encrypted_password) values ('newcomer@example.com', 'x');
  select count(*) into n from public.profiles_user p join auth.users u on u.id = p.id
  where u.email = 'newcomer@example.com' and not p.is_admin;
  if n <> 1 then raise exception 'FAIL 13: open sign-up did not create a normal profile'; end if;

  raise notice 'ALL DATABASE CHECKS PASSED';
end $$;

-- 14. Every table in public has RLS switched on.
do $$
declare missing text;
begin
  select string_agg(c.relname, ', ') into missing
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if missing is not null then raise exception 'FAIL 14: RLS is off for: %', missing; end if;
  raise notice 'RLS is on for every table';
end $$;
