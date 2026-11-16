"use client";
import Link from "next/link";

/** Shown when a signed-in page fails. No technical details are shown to the user. */
export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="max-w-xl rounded-[18px] border border-line bg-surface p-6" role="alert">
      <h1 className="text-xl font-extrabold">Something went wrong</h1>
      <p className="mt-2 text-sm text-muted">This page could not be loaded. Your data is safe. Please try again in a moment.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={reset} className="flex min-h-11 items-center rounded-[12px] bg-accent px-5 font-bold text-white hover:bg-accent-hover">Try again</button>
        <Link href="/dashboard" className="flex min-h-11 items-center rounded-[12px] border border-line px-5 font-bold hover:border-accent">Go to the dashboard</Link>
      </div>
    </div>
  );
}
