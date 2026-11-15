import Link from "next/link";

export const inputClass =
  "mt-1 block min-h-11 w-full rounded-[12px] border border-line bg-surface px-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30";
export const primaryButton =
  "flex min-h-11 w-full items-center justify-center rounded-[12px] bg-accent px-6 font-bold text-white hover:bg-accent-hover disabled:opacity-60";
export const secondaryButton =
  "flex min-h-11 w-full items-center justify-center rounded-[12px] border border-line bg-surface px-6 font-bold hover:border-accent disabled:opacity-60";

/** Centred card used by the login, sign-up and verify pages. */
export function AuthShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <Link href="/" className="flex min-h-11 items-center gap-2 text-lg font-extrabold">
        <span aria-hidden className="grid h-8 w-8 place-items-center rounded-[10px] bg-accent text-sm text-white">
          JP
        </span>
        JobPilot AI
      </Link>
      <div className="mt-6 rounded-[18px] border border-line bg-surface p-6 sm:p-8">
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
        {children}
      </div>
    </main>
  );
}

export function Alert({ kind, children }: { kind: "error" | "notice"; children: React.ReactNode }) {
  const style =
    kind === "error"
      ? "border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
      : "border-line bg-accent-tint text-fg";
  return (
    <p role={kind === "error" ? "alert" : "status"} className={`mt-4 rounded-[12px] border px-4 py-3 text-sm ${style}`}>
      {children}
    </p>
  );
}
