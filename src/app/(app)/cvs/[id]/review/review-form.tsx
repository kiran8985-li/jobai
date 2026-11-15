"use client";
import { useActionState, useRef, useState } from "react";
import { Alert, inputClass, primaryButton, secondaryButton } from "@/components/auth-ui";
import type { CvProfile } from "@/lib/cv/types";
import { saveCv, type SaveState } from "../../actions";

const card = "mt-4 rounded-[18px] border border-line bg-surface p-5";
const smallButton = "flex min-h-11 items-center rounded-[12px] px-3 text-sm font-bold";
const removeButton = `${smallButton} text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950`;
const addButton = `${smallButton} border border-line hover:border-accent`;

function Field(props: { label: string; value: string; onChange: (v: string) => void; type?: string; autoComplete?: string }) {
  return (
    <label className="block text-sm font-semibold">
      {props.label}
      <input
        type={props.type ?? "text"}
        value={props.value}
        autoComplete={props.autoComplete ?? "off"}
        onChange={(e) => props.onChange(e.target.value)}
        className={inputClass}
      />
    </label>
  );
}

/** A list of one-line items with add and remove (skills, certifications, bullets). */
function ListEditor(props: { label: string; items: string[]; onChange: (v: string[]) => void; addLabel: string; long?: boolean }) {
  const { items, onChange } = props;
  return (
    <fieldset>
      <legend className="text-sm font-semibold">{props.label}</legend>
      {items.length === 0 && <p className="mt-1 text-sm text-muted">None yet.</p>}
      <ul className="mt-1 space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2">
            {props.long ? (
              <textarea
                value={item}
                rows={2}
                aria-label={`${props.label} ${i + 1}`}
                onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
                className={`${inputClass} mt-0 py-2`}
              />
            ) : (
              <input
                value={item}
                aria-label={`${props.label} ${i + 1}`}
                onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
                className={`${inputClass} mt-0`}
              />
            )}
            <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} className={removeButton}>
              Remove<span className="sr-only"> {props.label} {i + 1}</span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => onChange([...items, ""])} className={`${addButton} mt-2`}>
        {props.addLabel}
      </button>
    </fieldset>
  );
}

export function ReviewForm({ id, initial, approved }: { id: string; initial: CvProfile; approved: boolean }) {
  const [p, setP] = useState<CvProfile>(initial);
  const [state, action, pending] = useActionState<SaveState, FormData>(saveCv, {});
  // Which button was pressed. Defaults to "save", so nothing is ever approved by accident.
  const intent = useRef<HTMLInputElement>(null);
  const setIntent = (v: "save" | "approve") => {
    if (intent.current) intent.current.value = v;
  };
  const set = <K extends keyof CvProfile>(key: K, value: CvProfile[K]) => setP((old) => ({ ...old, [key]: value }));
  const setExp = (i: number, patch: Partial<CvProfile["experience"][number]>) =>
    set("experience", p.experience.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  const setEdu = (i: number, patch: Partial<CvProfile["education"][number]>) =>
    set("education", p.education.map((e, j) => (j === i ? { ...e, ...patch } : e)));

  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="profile" value={JSON.stringify(p)} />
      <input type="hidden" name="intent" ref={intent} defaultValue="save" />

      <section className={card}>
        <h2 className="text-lg font-bold">About you</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field label="Name" value={p.name} onChange={(v) => set("name", v)} autoComplete="name" />
          <Field label="Headline" value={p.headline} onChange={(v) => set("headline", v)} />
          <Field label="Email" type="email" value={p.email} onChange={(v) => set("email", v)} autoComplete="email" />
          <Field label="Phone" type="tel" value={p.phone} onChange={(v) => set("phone", v)} autoComplete="tel" />
          <Field label="Location" value={p.location} onChange={(v) => set("location", v)} />
        </div>
        <label className="mt-4 block text-sm font-semibold">
          Summary
          <textarea value={p.summary} rows={4} onChange={(e) => set("summary", e.target.value)} className={`${inputClass} py-2`} />
        </label>
      </section>

      <section className={card}>
        <h2 className="text-lg font-bold">Skills</h2>
        <div className="mt-3">
          <ListEditor label="Skill" items={p.skills} onChange={(v) => set("skills", v)} addLabel="Add a skill" />
        </div>
      </section>

      <section className={card}>
        <h2 className="text-lg font-bold">Experience</h2>
        {p.experience.length === 0 && <p className="mt-1 text-sm text-muted">No jobs found. Add your work history below.</p>}
        {p.experience.map((e, i) => (
          <div key={i} className="mt-4 rounded-[12px] border border-line p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Job title" value={e.title} onChange={(v) => setExp(i, { title: v })} />
              <Field label="Employer" value={e.company} onChange={(v) => setExp(i, { company: v })} />
              <Field label="Dates" value={e.dates} onChange={(v) => setExp(i, { dates: v })} />
            </div>
            <div className="mt-4">
              <ListEditor label="Bullet" long items={e.bullets} onChange={(v) => setExp(i, { bullets: v })} addLabel="Add a bullet" />
            </div>
            <button type="button" onClick={() => set("experience", p.experience.filter((_, j) => j !== i))} className={`${removeButton} mt-3`}>
              Remove this job
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => set("experience", [...p.experience, { title: "", company: "", dates: "", bullets: [] }])}
          className={`${addButton} mt-4`}
        >
          Add a job
        </button>
      </section>

      <section className={card}>
        <h2 className="text-lg font-bold">Education</h2>
        {p.education.length === 0 && <p className="mt-1 text-sm text-muted">None yet.</p>}
        {p.education.map((e, i) => (
          <div key={i} className="mt-4 rounded-[12px] border border-line p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Qualification" value={e.degree} onChange={(v) => setEdu(i, { degree: v })} />
              <Field label="Where" value={e.institution} onChange={(v) => setEdu(i, { institution: v })} />
              <Field label="Dates" value={e.dates} onChange={(v) => setEdu(i, { dates: v })} />
            </div>
            <button type="button" onClick={() => set("education", p.education.filter((_, j) => j !== i))} className={`${removeButton} mt-3`}>
              Remove this qualification
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => set("education", [...p.education, { degree: "", institution: "", dates: "" }])}
          className={`${addButton} mt-4`}
        >
          Add a qualification
        </button>
      </section>

      <section className={card}>
        <h2 className="text-lg font-bold">Certifications</h2>
        <div className="mt-3">
          <ListEditor label="Certification" items={p.certifications} onChange={(v) => set("certifications", v)} addLabel="Add a certification" />
        </div>
      </section>

      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.notice && <Alert kind="notice">{state.notice}</Alert>}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button type="submit" onClick={() => setIntent("approve")} disabled={pending} className={primaryButton}>
          {pending ? "Saving…" : approved ? "Save changes to my master CV" : "Approve as my master CV"}
        </button>
        {!approved && (
          <button type="submit" onClick={() => setIntent("save")} disabled={pending} className={secondaryButton}>
            Save and finish later
          </button>
        )}
      </div>
      <p className="mt-3 text-sm text-muted">
        By approving, you confirm everything above is true. JobPilot AI never adds facts that are not in your master CV.
      </p>
    </form>
  );
}
