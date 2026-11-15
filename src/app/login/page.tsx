import Link from "next/link";

/** Placeholder. Login and invite-only sign-up are built in Prompt 1. */
export default function LoginPage() {
  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-3xl font-extrabold tracking-tight">Log in</h1>
      <div className="mt-6 rounded-[18px] border border-line bg-surface p-6">
        <p className="font-semibold">Sign-in is not available yet</p>
        <p className="mt-1 text-sm text-muted">Accounts open with the invite-only beta.</p>
      </div>
      <Link href="/" className="mt-6 inline-flex min-h-11 items-center font-semibold text-accent">
        Back to home
      </Link>
    </main>
  );
}
