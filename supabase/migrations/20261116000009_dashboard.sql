-- Prompt 8: "Run scan now" cooldown, and fast unread counts.

-- When the user last asked for a scan of their own searches. Written by the server only.
alter table public.profiles_user add column last_manual_scan_at timestamptz;

create index notifications_user_unread on public.notifications (user_id) where not is_read;
