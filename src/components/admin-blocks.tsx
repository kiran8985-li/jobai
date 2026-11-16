/** Small server-safe building blocks shared by the admin pages. */

export const adminCard = "rounded-[18px] border border-line bg-surface p-5";

export function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className={adminCard}>
      <p className="break-words text-2xl font-extrabold tabular-nums sm:text-3xl">{value}</p>
      <p className="mt-1 text-sm text-muted">{label}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

/** A table that scrolls sideways inside its own box on small screens, never the whole page. */
export function Table({ head, rows, empty, caption }: { head: string[]; rows: React.ReactNode[][]; empty: string; caption?: string }) {
  if (!rows.length) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <div className="overflow-x-auto rounded-[12px] border border-line" role="region" aria-label={caption ?? head.join(", ")} tabIndex={0}>
      <table className="w-full min-w-[560px] text-left text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="bg-page">
          <tr>
            {head.map((h) => (
              <th key={h} scope="col" className="px-3 py-2 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line align-top">
              {r.map((c, j) => (
                <td key={j} className="break-words px-3 py-2">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const when = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }) : "Never";

export const adminButton = "flex min-h-11 items-center justify-center rounded-[12px] border border-line px-4 text-sm font-bold hover:border-accent";
export const adminPrimary = "flex min-h-11 items-center justify-center rounded-[12px] bg-accent px-5 text-sm font-bold text-white hover:bg-accent-hover";
export const adminDanger = "flex min-h-11 items-center justify-center rounded-[12px] px-4 text-sm font-bold text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950";
