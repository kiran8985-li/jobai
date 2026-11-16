import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { markAllRead, markRead } from "./actions";

export const metadata = { title: "Notifications – JobPilot AI" };

type N = { id: string; kind: string; message: string; link: string | null; is_read: boolean; created_at: string };
const KIND: Record<string, string> = {
  application_sent: "Sent",
  application_dry_run: "Prepared",
  application_manual: "Waiting for you",
  application_skipped: "Skipped",
  application_failed: "Failed",
};

/** Only same-site links are followed, so a stored link can never send the user elsewhere. */
const safeLink = (l: string | null) => (l && l.startsWith("/") && !l.startsWith("//") ? l : null);

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const user = await requireUser();
  const unreadOnly = (await searchParams).show === "unread";
  const supabase = await createSupabaseServerClient();
  let q = supabase.from("notifications").select("id, kind, message, link, is_read, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(200);
  if (unreadOnly) q = q.eq("is_read", false);
  const { data } = await q;
  const rows = (data ?? []) as N[];
  const { count: unread } = await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("is_read", false);

  return (
    <div className="max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold tracking-tight">Notifications</h1>
        {(unread ?? 0) > 0 && (
          <form action={markAllRead}>
            <button type="submit" className="flex min-h-11 items-center rounded-[12px] border border-line px-4 text-sm font-bold hover:border-accent">Mark all as read</button>
          </form>
        )}
      </div>
      <nav aria-label="Show" className="mt-4 flex gap-2">
        {[{ v: "", l: "All" }, { v: "unread", l: `Unread (${unread ?? 0})` }].map((f) => {
          const on = (f.v === "unread") === unreadOnly;
          return (
            <Link key={f.v} href={f.v ? "/notifications?show=unread" : "/notifications"} aria-current={on ? "page" : undefined}
              className={`flex min-h-11 items-center rounded-full border px-4 text-sm font-bold ${on ? "border-accent bg-accent text-white" : "border-line bg-surface hover:border-accent"}`}>
              {f.l}
            </Link>
          );
        })}
      </nav>

      {rows.length === 0 ? (
        <div className="mt-6 rounded-[18px] border border-line bg-surface p-6">
          <p className="font-semibold">{unreadOnly ? "You are all caught up" : "No notifications yet"}</p>
          <p className="mt-1 text-sm text-muted">You will be told here whenever an application is sent, prepared for you, or skipped.</p>
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {rows.map((n) => {
            const link = safeLink(n.link);
            return (
              <li key={n.id} data-notification={n.is_read ? "read" : "unread"}
                className={`rounded-[18px] border p-4 ${n.is_read ? "border-line bg-surface" : "border-accent bg-accent-tint"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wide text-accent">
                      {!n.is_read && <span className="sr-only">Unread. </span>}
                      {KIND[n.kind] ?? "Update"} · {new Date(n.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </p>
                    <p className="mt-1 break-words text-sm">{n.message}</p>
                  </div>
                  {!n.is_read && (
                    <form action={markRead}>
                      <input type="hidden" name="id" value={n.id} />
                      <button type="submit" className="min-h-11 shrink-0 rounded-[12px] px-3 text-xs font-bold text-accent hover:bg-white/60 dark:hover:bg-white/10">Mark read</button>
                    </form>
                  )}
                </div>
                {link && <Link href={link} className="mt-1 inline-flex min-h-11 items-center text-sm font-bold text-accent">View</Link>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
