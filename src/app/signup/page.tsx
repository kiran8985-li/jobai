import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { env, hasSupabase } from "@/lib/env";
import { syncSignupMode } from "@/lib/signup-mode";
import { Alert, AuthShell } from "@/components/auth-ui";
import { GoogleButton } from "@/components/google-button";
import { SignupForm } from "./signup-form";

export const metadata = { title: "Sign up – JobPilot AI" };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; email?: string }>;
}) {
  if (await getSessionUser()) redirect("/dashboard");
  const sp = await searchParams;
  const token = sp.token?.trim().slice(0, 200) || undefined;
  const email = sp.email?.trim().toLowerCase().slice(0, 254) || undefined;
  const inviteOnly = env().SIGNUP_MODE === "invite";
  await syncSignupMode();

  if (inviteOnly && !token) {
    return (
      <AuthShell title="You need an invite">
        <p className="mt-3 text-sm text-muted">
          JobPilot AI is invite-only for now. If you have been invited, open the link in your invite email and it
          will bring you back here.
        </p>
        <Link href="/login" className="mt-4 inline-flex min-h-11 items-center font-semibold text-accent">
          Already have an account? Log in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Create your account">
      {!hasSupabase() && (
        <Alert kind="error">Sign-up is not set up yet. The site owner needs to add the Supabase settings.</Alert>
      )}
      <p className="mt-3 text-sm text-muted">
        {inviteOnly
          ? "Use the email address your invite was sent to. We will email you a link to verify it."
          : "We will email you a link to verify your address."}
      </p>
      <SignupForm token={token} email={email} lockEmail={inviteOnly && Boolean(email)} />
      <div className="my-5 flex items-center gap-3 text-xs font-semibold text-muted">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>
      <GoogleButton label="Sign up with Google" />
      {inviteOnly && (
        <p className="mt-2 text-xs text-muted">Google sign-up works only with the Google account for your invited email.</p>
      )}
      <Link href="/login" className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-accent">
        Already have an account? Log in
      </Link>
    </AuthShell>
  );
}
