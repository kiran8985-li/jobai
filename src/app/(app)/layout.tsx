import { AppNav } from "@/components/app-nav";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Shell for signed-in pages. The Admin link is decided here, on the server. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="min-h-screen">
      <AppNav isAdmin={user.isAdmin} userLabel={user.name ?? user.email} />
      <main className="px-4 py-6 sm:px-6 lg:ml-64 lg:px-10 lg:py-10">{children}</main>
    </div>
  );
}
