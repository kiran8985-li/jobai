import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

/** Landing placeholder. The invite request form arrives in a later phase. */
export default async function Home({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const deleted = (await searchParams).deleted === "1";
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <span className="flex items-center gap-2 whitespace-nowrap text-lg font-extrabold">
          <span aria-hidden className="grid h-8 w-8 place-items-center rounded-[10px] bg-accent text-sm text-white">
            JP
          </span>
          JobPilot AI
        </span>
        <div className="flex items-center gap-1">
          <ThemeToggle className="px-3 text-muted hover:bg-accent-tint" />
          <Link
            href="/login"
            className="flex min-h-11 items-center whitespace-nowrap rounded-[12px] px-3 text-sm font-semibold text-accent hover:bg-accent-tint"
          >
            Log in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6 sm:pt-20">
        {deleted && (
          <p role="status" className="mb-6 rounded-[12px] border border-line bg-accent-tint px-4 py-3 text-sm">
            Your account and data have been deleted. Thank you for trying JobPilot AI.
          </p>
        )}
        <span className="inline-block rounded-full bg-accent-tint px-3 py-1 text-xs font-bold text-accent">
          Invite-only beta
        </span>
        <h1 className="mt-4 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
          Your CV, matched and sent to the right UK jobs.
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-muted">
          JobPilot AI finds jobs that fit your CV, tailors your CV for each one using only facts you have
          approved, and applies within the limits you set. Anything it cannot send is prepared for you to
          submit in one click.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/login"
            className="flex min-h-11 items-center justify-center rounded-[12px] bg-accent px-6 font-bold text-white hover:bg-accent-hover"
          >
            I have an invite
          </Link>
          <a
            href="#how"
            className="flex min-h-11 items-center justify-center rounded-[12px] border border-line bg-surface px-6 font-bold hover:border-accent"
          >
            How it works
          </a>
        </div>

        <section id="how" className="mt-20 grid gap-4 sm:grid-cols-3">
          {[
            ["Match", "Every 15 minutes we check UK job sources and score each job against your search profiles."],
            ["Tailor", "Your CV is reordered and reworded for the job. Nothing is invented: every line traces back to your master CV."],
            ["Apply", "Email applications go out within your daily limit. Others wait for you with everything prepared."],
          ].map(([title, body]) => (
            <div key={title} className="rounded-[18px] border border-line bg-surface p-6">
              <h2 className="text-lg font-bold">{title}</h2>
              <p className="mt-2 text-sm text-muted">{body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-line px-4 py-6 text-center text-sm text-muted">
        <Link href="/privacy" className="hover:text-accent">
          Privacy
        </Link>
      </footer>
    </div>
  );
}
