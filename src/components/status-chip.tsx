/** The one place application statuses get their label and colour. */
const STYLES: Record<string, { label: string; cls: string }> = {
  sent: { label: "Sent", cls: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300" },
  manual: { label: "Waiting for you", cls: "bg-accent-tint text-accent" },
  dry_run: { label: "Prepared (test mode)", cls: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  prepared: { label: "Prepared", cls: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  skipped: { label: "Skipped", cls: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  failed: { label: "Failed", cls: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" },
};

export function StatusChip({ status }: { status: string }) {
  const s = STYLES[status] ?? { label: status, cls: "border border-line text-muted" };
  return <span className={`inline-block whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold ${s.cls}`}>{s.label}</span>;
}
