# How jobs are scored

Each job is scored 0–100 for each of a user's active searches, against their **approved master CV**.
A job at or above the search's minimum match (default 75) is a match.

## Hard filters (checked first; a filtered job gets no score and is never applied for)

| Filter | Rule |
| --- | --- |
| Excluded keywords | The title or description contains one of the search's excluded words (whole words only). |
| Job type | The advert states a type (permanent, contract, temporary, internship; full-time, part-time) the user did not choose. Unknown types pass. |
| Salary | The top of the pay range is under 80% of the user's minimum. Day and hourly rates are converted to yearly pay. |
| Location | The job is clearly abroad, or the user listed locations and the job is in none of them and is not remote. |

The reason is stored and shown on the job's page ("Left out of your matches").

## The score

| Part | Points | How |
| --- | --- | --- |
| Job title | 35 | How much of a wanted title appears in the job title. "Developer", "Engineer" and "Programmer" count as the same word. Marked down when the level differs (senior or junior). |
| Skills | 45 | Share of the skills named in the advert that are on the CV (its skill list plus skills named in its text). Half marks when the advert names no known skills. A small lift for the search's keywords. |
| Location | 10 | Full marks in one of the user's locations, remote when asked for, or anywhere in the UK when no locations are set. |
| Salary | 10 | Full marks at or above the minimum; half when a little under or not stated. |

The four parts, their reasons, and the matching and missing skills are stored with each match and
shown on the job's page.

## AI eligibility check (optional)

During the scheduled scan, jobs scoring at least (minimum match − 10) get one AI check of seniority,
right to work and contract type. The AI may move the score by −30 to +10. If it says "not eligible",
the score is held just below the minimum match, so the job can never be applied for automatically.

- At most 20 checks per user per scan, each job checked once, all counted against the daily AI limit.
- The AI is told level and skills only: headline, skills, job titles with dates, qualifications,
  right-to-work answer. No name, contact details or employers.
- No key, limit reached, or a bad reply → the keyword score stands.

## When scoring happens

- Right after a user saves a search, resumes one, or approves a CV (keyword scores, instant, no AI).
- In every scheduled scan, for jobs a search has not seen yet.
- Changing a search's titles, locations, salary, job types or keywords, or changing the master CV,
  clears that search's scores so they are worked out again. Changing only the minimum match or daily
  limit does not.

## Known limits

- Location is matched by name. A job in a town next to a chosen city is filtered unless that town
  is also listed; leave locations empty to accept anywhere in the UK.
- "Abroad" is a list of common countries and cities; an unusual foreign place name can slip through
  when no locations are set. Adzuna and Reed only return UK jobs; company feeds are the risk.
- Skills are recognised from a fixed vocabulary (`src/lib/skills.ts`), aimed at IT roles.
- The AI check has only been run against a stand-in AI server, not the real DeepSeek service.
