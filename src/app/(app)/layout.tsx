import { AppNav } from "@/components/app-nav";

/** Shell for signed-in pages. Auth and the server-side is_admin check arrive in Prompt 1. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <AppNav isAdmin={false} />
      <main className="px-4 py-6 sm:px-6 lg:ml-64 lg:px-10 lg:py-10">{children}</main>
    </div>
  );
}
