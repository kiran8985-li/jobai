"use client";
import { useFormStatus } from "react-dom";

function Inner() {
  const { pending } = useFormStatus();
  return (
    <>
      <button
        type="submit"
        disabled={pending}
        className="flex min-h-11 items-center justify-center rounded-[12px] border border-line bg-surface px-5 font-bold hover:border-accent disabled:opacity-60"
      >
        {pending ? "Checking for new jobs…" : "Run scan now"}
      </button>
      {pending && (
        <p role="status" className="text-sm text-muted">
          Looking for new jobs, scoring them and preparing applications. This can take a minute.
        </p>
      )}
    </>
  );
}

export function ScanButton({ action }: { action: () => Promise<void> }) {
  return (
    <form action={action} className="flex flex-col gap-2 sm:items-start">
      <Inner />
    </form>
  );
}
