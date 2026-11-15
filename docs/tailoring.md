# Tailored CVs and the fact check

For each match, JobPilot AI prepares a version of the user's **approved master CV** aimed at that
job, then renders it as a PDF and a Word file. One version is kept per job, so the user can always
see exactly what was prepared or sent.

## Rule 1: nothing is invented

A tailored CV may only reorder, select and reword facts from the master CV. This is enforced by
code (`src/lib/tailor/validate.ts`), whatever produced the draft:

| Part | Rule |
| --- | --- |
| Name, contact details, headline | Always copied from the master. |
| Employers, job titles, dates | Always the master's entries, in the master's order. A job that is not on the master is removed. |
| Bullets | Each must be a rewording of one bullet **from the same job**: every figure must be in that bullet, no skill may be named that the bullet does not name, and at least 60% of its meaningful words must come from it. One master bullet can back only one tailored bullet. |
| Projects | Only the master's projects, with name and tools unchanged. They may be reordered. Bullets follow the same rule as job bullets, within the same project. |
| Skills | Only skills on the master, in the master's spelling. The rest follow in the master's order. |
| Summary | May be rewritten, but every figure and skill must be on the master and at least 75% of its meaningful words must come from the master, the job's title and company, or neutral filler. Otherwise the master's summary is used. |
| Education, certifications, languages | Always copied from the master. |

Everything removed is listed as a flag and shown to the user (job page and My CVs).
If the AI's draft invents a job, or more than half its bullets or skills are rejected, the whole
draft is discarded and the reorder-only version is used instead.

## Two ways of tailoring

- **AI** (when a key is set and the daily limit allows): rewrites the summary, picks and rewords
  bullets, orders skills. The AI is sent the headline, summary, skills, and each job's title, dates
  and bullets under an id (`E1`, `E2`). Projects are sent the same way (`P1`, `P2`) with their name and tools. It never sees the name, contact details, employers or
  education, so it cannot change them.
- **Reorder-only** (no AI, AI failure, or a rejected draft): no rewording at all. Skills the advert
  asks for move to the front; within each job the most relevant bullets move up.

## Files

- Single column, standard headings, real text, no tables, images or text boxes: the layout
  applicant tracking systems read most reliably. Tests extract the PDF's text back out to prove it.
- PDF: A4, DejaVu Sans (bundled in `assets/fonts/`) so accented names print correctly. Characters
  the font lacks (emoji, Chinese, Japanese, Korean) print as "?".
- Stored privately in the `tailored` bucket as `<user id>/<job id>.pdf` and `.docx`. Only the
  server writes there; a user can read only their own folder.
- Downloads: `/api/cvs/tailored/<job id>/pdf|docx` and `/api/cvs/master/pdf|docx` (signed-in user only).

## When a tailored CV is made

- In each scheduled scan: for every match at or above the minimum that has none yet, best first,
  at most 10 per user per scan.
- On demand: "Create a tailored CV" on any scored job's page ("Make it again" replaces it).
- When the master CV changes, tailored CVs not yet used for an application are removed and made
  again from the new master. Ones already used for an application are kept as a record.

## Known limits

- The word-overlap check is a safeguard, not proof. A reworded bullet that keeps the same words
  and figures but shifts the meaning ("supported" to "led") can pass. Users should read each CV.
- The real DeepSeek service has not been tested here; a stand-in AI server was used.
