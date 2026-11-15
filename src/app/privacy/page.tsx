import Link from "next/link";

/** Placeholder. The full privacy notice is written in Prompt 10, before any tester uploads a CV. */
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-3xl font-extrabold tracking-tight">Privacy</h1>
      <div className="mt-6 rounded-[18px] border border-line bg-surface p-6">
        <p className="font-semibold">The privacy notice is being written</p>
        <p className="mt-1 text-sm text-muted">
          It will be published here before the beta opens. No CVs or personal data are collected until then.
        </p>
      </div>
      <Link href="/" className="mt-6 inline-flex min-h-11 items-center font-semibold text-accent">
        Back to home
      </Link>
    </main>
  );
}
