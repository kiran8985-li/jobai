/** Progress chips shown across the set-up pages. */
const STEPS = ["Consent", "Upload CV", "Review CV", "Preferences"];

export function Steps({ current }: { current: number }) {
  return (
    <ol className="mt-4 flex flex-wrap gap-2 text-xs font-bold">
      {STEPS.map((s, i) => (
        <li
          key={s}
          aria-current={i === current ? "step" : undefined}
          className={`rounded-full px-3 py-1.5 ${
            i === current ? "bg-accent text-white" : i < current ? "bg-accent-tint text-accent" : "border border-line text-muted"
          }`}
        >
          {i + 1}. {s}
        </li>
      ))}
    </ol>
  );
}
