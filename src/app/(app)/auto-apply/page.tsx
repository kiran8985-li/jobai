import Link from "next/link";
import { Alert } from "@/components/auth-ui";
import { requireUser } from "@/lib/auth";
import { getMasterCv } from "@/lib/cv/store";
import { env } from "@/lib/env";
import { CUSTOM_PREFIX, STANDARD_KEYS } from "@/lib/screening";
import { PROFILE_COLUMNS, isAutoApplyOn, type SearchProfile } from "@/lib/search-profiles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { giveApplyConsent, setAutoApply, setPaused, withdrawApplyConsent } from "./actions";
import { ScreeningForm } from "./screening-form";

export const metadata = { title: "Auto-apply – JobPilot AI" };

const MESSAGES: Record<string, { kind: "error" | "notice"; text: string }> = {
  consent_given: { kind: "notice", text: "Consent saved. Auto-apply is still off for that search until you turn it on." },
  consent_withdrawn: { kind: "notice", text: "Consent withdrawn. Auto-apply is now off for that search." },
  auto_on: { kind: "notice", text: "Auto-apply is on for that search." },
  auto_off: { kind: "notice", text: "Auto-apply is off for that search." },
  paused: { kind: "notice", text: "All auto-apply is paused. Nothing will be sent until you resume." },
  resumed: { kind: "notice", text: "Auto-apply resumed for the searches where it is switched on." },
  tick: { kind: "error", text: "Tick the consent box first." },
  need_consent: { kind: "error", text: "Auto-apply cannot be turned on without your consent for that search." },
  need_cv: { kind: "error", text: "Approve a master CV before turning on auto-apply." },
  error: { kind: "error", text: "That did not work. Please try again." },
};

const card = "mt-4 rounded-[18px] border border-line bg-surface p-5 sm:p-6";
const button = "flex min-h-11 items-center justify-center rounded-[12px] px-4 text-sm font-bold";
const outline = `${button} border border-line hover:border-accent`;
const solid = `${button} bg-accent text-white hover:bg-accent-hover`;
const chip = "rounded-full px-3 py-1 text-xs font-bold";
const date = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

export default async function AutoApplyPage({ searchParams }: { searchParams: Promise<{ msg?: string; welcome?: string }> }) {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const sp = await searchParams;
  const [{ data: profileRows }, { data: me }, { data: answerRows }, master] = await Promise.all([
    supabase.from("search_profiles").select(PROFILE_COLUMNS).eq("user_id", user.id).order("created_at"),
    supabase.from("profiles_user").select("auto_apply_paused").eq("id", user.id).maybeSingle(),
    supabase.from("screening_answers").select("key, answer").eq("user_id", user.id).order("key"),
    getMasterCv(supabase, user.id),
  ]);
  const profiles = (profileRows ?? []) as SearchProfile[];
  const paused = me?.auto_apply_paused === true;
  const answers: Record<string, string> = {};
  const custom: { question: string; answer: string }[] = [];
  for (const r of answerRows ?? []) {
    if (STANDARD_KEYS.includes(r.key)) answers[r.key] = r.answer;
    else if (r.key.startsWith(CUSTOM_PREFIX)) custom.push({ question: r.key.slice(CUSTOM_PREFIX.length), answer: r.answer });
  }
  const msg = sp.msg ? MESSAGES[sp.msg] : undefined;
  const dryRun = env().APPLY_MODE === "dry_run";
  const anyOn = profiles.some((p) => p.auto_apply);

  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-extrabold tracking-tight">Auto-apply</h1>
      <p className="mt-2 text-sm text-muted">
        You decide, search by search, whether JobPilot AI may apply for you. It is off until you give consent and
        turn it on, and you can pause or withdraw at any time.
      </p>
      {sp.welcome === "1" && !msg && (
        <Alert kind="notice">Your search is saved. Auto-apply is optional: you can leave it off and apply to matches yourself.</Alert>
      )}
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      {dryRun && (
        <Alert kind="notice">
          <strong>Test mode is on.</strong> Applications are prepared so you can check them, but nothing is sent to
          employers yet.
        </Alert>
      )}

      <section className={card} aria-labelledby="pause-h">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="pause-h" className="text-lg font-bold">Pause everything</h2>
            <p className="mt-1 text-sm text-muted">
              {paused ? "Auto-apply is paused for all searches. Your settings are kept." : "One switch to stop all automatic applications at once."}
            </p>
          </div>
          <form action={setPaused}>
            <input type="hidden" name="paused" value={String(!paused)} />
            <button type="submit" className={paused ? solid : outline}>
              {paused ? "Resume auto-apply" : "Pause all auto-apply"}
            </button>
          </form>
        </div>
      </section>

      <h2 className="mt-8 text-xl font-extrabold">Your searches</h2>
      {profiles.length === 0 && (
        <div className={card}>
          <p className="font-semibold">No searches yet</p>
          <p className="mt-1 text-sm text-muted">Add a search first, then choose whether to auto-apply for it.</p>
          <Link href="/profiles/new" className={`${solid} mt-4 inline-flex`}>
            Add a search
          </Link>
        </div>
      )}
      {!master && profiles.length > 0 && (
        <Alert kind="notice">
          You need an approved master CV before auto-apply can be turned on.{" "}
          <Link href="/cvs" className="font-semibold text-accent">Go to My CVs</Link>
        </Alert>
      )}
      {profiles.map((p) => {
        const live = isAutoApplyOn(p, paused);
        return (
          <section key={p.id} className={card} aria-label={p.name} data-profile={p.name}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="min-w-0 break-words text-lg font-bold">{p.name}</h3>
              <span className={`${chip} ${live ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300" : p.auto_apply ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" : "border border-line text-muted"}`}>
                {live ? "Auto-apply on" : p.auto_apply ? (paused ? "On, but paused" : "On, but search is paused") : "Auto-apply off"}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted">
              Jobs scoring {p.min_match} or more, up to {p.daily_limit} application{p.daily_limit === 1 ? "" : "s"} a day.{" "}
              <Link href={`/profiles/${p.id}`} className="font-semibold text-accent">Change limits</Link>
            </p>

            {!p.consent_at ? (
              <form action={giveApplyConsent} className="mt-4">
                <input type="hidden" name="id" value={p.id} />
                <label className="flex cursor-pointer items-start gap-3 rounded-[12px] border border-line p-4 text-sm">
                  <input type="checkbox" name="consent" required className="mt-0.5 h-5 w-5 shrink-0 accent-[#6C4DFF]" />
                  <span>
                    I agree that JobPilot AI may apply for jobs on my behalf for this search. For each job scoring{" "}
                    {p.min_match} or more, up to {p.daily_limit} a day, it may send the employer an email in my name
                    with: my name and contact details, a CV tailored from my approved master CV, a short cover note,
                    and my saved screening answers where the job asks for them.
                  </span>
                </label>
                <button type="submit" className={`${solid} mt-3`}>Give consent for this search</button>
              </form>
            ) : (
              <div className="mt-4">
                <p className="text-sm">
                  <strong>Consent given on {date(p.consent_at)}.</strong>{" "}
                  <span className="text-muted">
                    JobPilot AI may email employers in your name with your contact details, a tailored CV, a short
                    cover note and your saved screening answers.
                  </span>
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <form action={setAutoApply}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="on" value={String(!p.auto_apply)} />
                    <button type="submit" className={p.auto_apply ? outline : solid}>
                      {p.auto_apply ? "Turn auto-apply off" : "Turn auto-apply on"}
                    </button>
                  </form>
                  <form action={withdrawApplyConsent}>
                    <input type="hidden" name="id" value={p.id} />
                    <button type="submit" className={`${button} text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950`}>
                      Withdraw consent
                    </button>
                  </form>
                </div>
              </div>
            )}
          </section>
        );
      })}

      <h2 className="mt-8 text-xl font-extrabold">Screening answers</h2>
      <section className={card}>
        <p className="text-sm text-muted">
          Some jobs ask questions when you apply. Save your answers here and they are used only when a job asks that
          question. If a job asks something you have not answered, the application is skipped and you are told why.
        </p>
        <div className="mt-4 rounded-[12px] border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <strong>Sensitive questions are always skipped.</strong> JobPilot AI never answers questions about
          disability, ethnicity, health, criminal record, religion or sexual orientation, and does not store answers
          to them. Jobs that ask are left for you to complete yourself.
        </div>
        <ScreeningForm answers={answers} custom={custom} />
      </section>
      {anyOn && !paused && dryRun && <p className="mt-4 text-sm text-muted">Reminder: test mode is on, so nothing is sent yet.</p>}
    </div>
  );
}
