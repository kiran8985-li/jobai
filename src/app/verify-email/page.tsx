import Link from "next/link";
import { AuthShell } from "@/components/auth-ui";
import { ResendForm } from "./resend-form";

export const metadata = { title: "Verify your email – JobPilot AI" };

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const email = (await searchParams).email?.trim().slice(0, 254);
  return (
    <AuthShell title="Check your email">
      <p className="mt-3 text-sm text-muted">
        We have sent a verification link{email ? " to " : ""}
        {email && <strong className="break-all text-fg">{email}</strong>}. Open it to finish setting up your
        account. You cannot use JobPilot AI until your email is verified.
      </p>
      <p className="mt-3 text-sm text-muted">Nothing after a few minutes? Check your spam folder, or send it again.</p>
      <ResendForm email={email} />
      <Link href="/login" className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-accent">
        Back to log in
      </Link>
    </AuthShell>
  );
}
