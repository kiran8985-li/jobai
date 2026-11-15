import Link from "next/link";
import { AuthShell } from "@/components/auth-ui";

export const metadata = { title: "No access – JobPilot AI" };

/** Shown with HTTP 403 when a signed-in user without admin rights opens an admin page. */
export default function ForbiddenPage() {
  return (
    <AuthShell title="You do not have access to this page">
      <p className="mt-3 text-sm text-muted">This area is for the site administrator only.</p>
      <Link href="/dashboard" className="mt-4 inline-flex min-h-11 items-center font-semibold text-accent">
        Go to your dashboard
      </Link>
    </AuthShell>
  );
}
