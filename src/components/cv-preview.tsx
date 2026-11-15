import type { CvProfile } from "@/lib/cv/types";

/** Read-only view of a CV, in the same order as the PDF and Word files. */
export function CvPreview({ cv }: { cv: CvProfile }) {
  const h = "mt-4 border-b border-line pb-1 text-sm font-bold uppercase tracking-wide";
  return (
    <div className="rounded-[12px] border border-line bg-page p-4 text-sm sm:p-5">
      <p className="text-lg font-extrabold">{cv.name}</p>
      <p className="break-words text-xs text-muted">{[cv.email, cv.phone, cv.location].filter(Boolean).join(" | ")}</p>
      {cv.headline && <p className="mt-1">{cv.headline}</p>}
      {cv.summary && (
        <>
          <p className={h}>Summary</p>
          <p className="mt-2">{cv.summary}</p>
        </>
      )}
      {cv.skills.length > 0 && (
        <>
          <p className={h}>Skills</p>
          <p className="mt-2">{cv.skills.join(", ")}</p>
        </>
      )}
      {cv.experience.length > 0 && <p className={h}>Experience</p>}
      {cv.experience.map((e, i) => (
        <div key={i} className="mt-2">
          <p className="font-bold">{[e.title, e.company].filter(Boolean).join(", ")}</p>
          <p className="text-xs text-muted">{e.dates}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {e.bullets.map((b, j) => <li key={j}>{b}</li>)}
          </ul>
        </div>
      ))}
      {cv.projects.length > 0 && <p className={h}>Projects</p>}
      {cv.projects.map((p, i) => (
        <div key={i} className="mt-2">
          <p className="font-bold">{p.name}</p>
          {p.tech && <p className="text-xs text-muted">{p.tech}</p>}
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {p.bullets.map((b, j) => <li key={j}>{b}</li>)}
          </ul>
        </div>
      ))}
      {cv.education.length > 0 && <p className={h}>Education</p>}
      {cv.education.map((e, i) => (
        <p key={i} className="mt-2">
          <span className="font-bold">{[e.degree, e.institution].filter(Boolean).join(", ")}</span>
          {e.dates && <span className="text-muted"> · {e.dates}</span>}
        </p>
      ))}
      {cv.certifications.length > 0 && (
        <>
          <p className={h}>Certifications</p>
          <ul className="mt-2 list-disc pl-5">{cv.certifications.map((c, i) => <li key={i}>{c}</li>)}</ul>
        </>
      )}
    </div>
  );
}

/** What the fact check removed, shown wherever a tailored CV appears. */
export function FlagsPanel({ flags }: { flags: string[] }) {
  if (!flags.length) return null;
  return (
    <div className="rounded-[12px] border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
      <p className="font-bold">Fact check: {flags.length} thing{flags.length === 1 ? " was" : "s were"} removed or ignored</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">{flags.map((f, i) => <li key={i} className="break-words">{f}</li>)}</ul>
      <p className="mt-2">Nothing in this list is in the CV. Only facts from your approved master CV are used.</p>
    </div>
  );
}

const dl = "flex min-h-11 items-center rounded-[12px] border border-line px-4 text-sm font-bold hover:border-accent";
export function DownloadButtons({ base }: { base: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <a href={`${base}/pdf`} className={dl} download>Download PDF</a>
      <a href={`${base}/docx`} className={dl} download>Download Word</a>
    </div>
  );
}
