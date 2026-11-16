import { AdminNav } from "@/components/admin-ui";
import { requireAdmin } from "@/lib/auth";

/** Second lock after the middleware: every admin page re-checks is_admin on the server. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="max-w-5xl">
      <p className="text-xs font-bold uppercase tracking-wide text-accent">Admin</p>
      <AdminNav />
      <div className="mt-6">{children}</div>
    </div>
  );
}
