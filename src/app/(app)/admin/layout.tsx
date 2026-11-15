import { requireAdmin } from "@/lib/auth";

/** Second lock after the middleware: every admin page re-checks is_admin on the server. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <>{children}</>;
}
