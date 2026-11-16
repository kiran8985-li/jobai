import { AppNav } from "@/components/app-nav";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Shell for signed-in pages. The Admin link is decided here, on the server. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("is_read", false);
  return (
    <div className="min-h-screen">
      <AppNav isAdmin={user.isAdmin} userLabel={user.name ?? user.email} unread={count ?? 0} />
      <main className="px-4 py-6 sm:px-6 lg:ml-64 lg:px-10 lg:py-10">{children}</main>
    </div>
  );
}
