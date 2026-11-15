"use client";
import { useActionState, useState } from "react";
import { Alert, inputClass, primaryButton } from "@/components/auth-ui";
import { MAX_CUSTOM_ANSWERS, STANDARD_QUESTIONS } from "@/lib/screening";
import { saveScreening, type ScreeningState } from "./actions";

type Custom = { question: string; answer: string };

export function ScreeningForm({ answers, custom: initial }: { answers: Record<string, string>; custom: Custom[] }) {
  const [state, action, pending] = useActionState<ScreeningState, FormData>(saveScreening, {});
  const [values, setValues] = useState<Record<string, string>>(answers);
  const [custom, setCustom] = useState<Custom[]>(initial);
  const edit = (i: number, patch: Partial<Custom>) => setCustom(custom.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  return (
    <form action={action} className="mt-4 space-y-5">
      <input type="hidden" name="custom" value={JSON.stringify(custom)} />
      {STANDARD_QUESTIONS.map((q) => (
        <label key={q.key} className="block text-sm font-semibold">
          {q.label}
          {"options" in q ? (
            <select name={q.key} value={values[q.key] ?? ""} onChange={(e) => setValues({ ...values, [q.key]: e.target.value })} className={inputClass}>
              <option value="">Not answered (jobs asking this are skipped)</option>
              {q.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <input name={q.key} value={values[q.key] ?? ""} maxLength={500} placeholder={q.placeholder} onChange={(e) => setValues({ ...values, [q.key]: e.target.value })} className={inputClass} />
          )}
        </label>
      ))}

      <fieldset>
        <legend className="text-sm font-semibold">Your own extra answers</legend>
        <p className="mt-1 text-sm text-muted">For questions employers often ask you, such as “Do you have a driving licence?”</p>
        {custom.map((c, i) => (
          <div key={i} className="mt-3 rounded-[12px] border border-line p-4">
            <label className="block text-sm font-semibold">
              Question {i + 1}
              <input value={c.question} maxLength={200} onChange={(e) => edit(i, { question: e.target.value })} className={inputClass} />
            </label>
            <label className="mt-3 block text-sm font-semibold">
              Answer {i + 1}
              <input value={c.answer} maxLength={500} onChange={(e) => edit(i, { answer: e.target.value })} className={inputClass} />
            </label>
            <button
              type="button"
              onClick={() => setCustom(custom.filter((_, j) => j !== i))}
              className="mt-2 flex min-h-11 items-center rounded-[12px] px-3 text-sm font-bold text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950"
            >
              Remove<span className="sr-only"> question {i + 1}</span>
            </button>
          </div>
        ))}
        {custom.length < MAX_CUSTOM_ANSWERS && (
          <button
            type="button"
            onClick={() => setCustom([...custom, { question: "", answer: "" }])}
            className="mt-3 flex min-h-11 items-center rounded-[12px] border border-line px-4 text-sm font-bold hover:border-accent"
          >
            Add an answer
          </button>
        )}
      </fieldset>

      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.notice && <Alert kind="notice">{state.notice}</Alert>}
      <button type="submit" disabled={pending} className={`${primaryButton} sm:w-auto`}>
        {pending ? "Saving…" : "Save screening answers"}
      </button>
    </form>
  );
}
