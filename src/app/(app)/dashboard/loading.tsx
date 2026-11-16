/** Shown while this list page loads. (Kept off detail pages, so a missing item still answers HTTP 404.) */
export default function Loading() {
  return (
    <div className="max-w-3xl" role="status" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="h-9 w-56 animate-pulse rounded-[12px] bg-line" />
      <div className="mt-6 space-y-3">
        {[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-[18px] border border-line bg-surface" />)}
      </div>
    </div>
  );
}
