-- JobPilot AI: remove ALL sample data added for testing. Safe to run more than once.
-- Deleting the sample users also deletes their CVs, searches, answers, matches, tailored CVs,
-- applications, notifications, AI usage and extension tokens (they cascade).
delete from auth.users where email like 'sample.%@example.com';
delete from public.invites where email like 'sample.%@example.com';
delete from public.invite_requests where email like 'sample.%@example.com';
delete from public.jobs where external_id like 'sample:%';
-- Scan history and source status are only sample rows on a new project; the app rebuilds them on its first scan.
delete from public.scan_runs;
delete from public.source_status;
