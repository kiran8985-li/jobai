import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { env, hasSupabase } from "@/lib/env";
import { safeNext } from "@/lib/paths";
import { Alert, AuthShell } from "@/components/auth-ui";
import { GoogleButton } from "@/components/google-button";
import { LoginForm } from "./login-form";

const ERRORS: Record<string, string> = {
  not_configured: "Sign-in is not set up yet. The site owner needs to add the Supabase settings.",
  invite: "That account has no invite. JobPilot AI is invite-only for now; sign up with the email address your invite was sent to.",
  suspended: "This account has been suspended. Contact the site owner.",
  auth: "We could not sign you in. Please try again.",
  link: "That link has expired or was already used. Log in, or ask for a new verification email.",
};
const NOTICES: Record<string, string> = {
  verified: "Your email is verified. Log in to continue.",
  signed_out: "You have been signed out.",
};

export const metadata = { title: "Log in – JobPilot AI" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; notice?: string }>;
}) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  if (await getSessionUser()) redirect(next);
  const configured = hasSupabase();
  const error = sp.error ? ERRORS[sp.error] : !configured ? ERRORS.not_configured : undefined;
  const notice = sp.notice ? NOTICES[sp.notice] : undefined;

  return (
    <AuthShell title="Log in">
      {error && <Alert kind="error">{error}</Alert>}
      {notice && <Alert kind="notice">{notice}</Alert>}
      <LoginForm next={next} />
      <div className="my-5 flex items-center gap-3 text-xs font-semibold text-muted">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>
      <GoogleButton next={next} label="Continue with Google" />
      {env().SIGNUP_MODE === "open" ? (
        <p className="mt-6 text-sm text-muted">
          New here?{" "}
          <Link href="/signup" className="font-semibold text-accent">Create an account</Link>
        </p>
      ) : (
        <p className="mt-6 text-sm text-muted">
          New here? JobPilot AI is invite-only for now. Open the link in your invite email, or{" "}
          <Link href="/#request" className="font-semibold text-accent">request an invite</Link>.
        </p>
      )}
    </AuthShell>
  );
}
