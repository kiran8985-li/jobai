import Link from "next/link";
import { Alert } from "@/components/auth-ui";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { withdrawAiConsent } from "./actions";
import { DeleteForm } from "./delete-form";

export const metadata = { title: "Account – JobPilot AI" };

const card = "mt-4 rounded-[18px] border border-line bg-surface p-5 sm:p-6";
const button = "inline-flex min-h-11 items-center rounded-[12px] border border-line px-5 font-bold hover:border-accent";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data: me } = await supabase.from("profiles_user").select("ai_consent_at").eq("id", user.id).maybeSingle();
  const consent = me?.ai_consent_at as string | null | undefined;
  const withdrawn = (await searchParams).msg === "withdrawn";

  return (
    <div className="max-w-2xl">
      <h1 className="text-3xl font-extrabold tracking-tight">Account</h1>
      {withdrawn && <Alert kind="notice">Consent withdrawn. Nothing about you will be sent to the AI service, and auto-apply is off.</Alert>}

      <section className={card}>
        <dl className="space-y-2 text-sm">
          <div><dt className="inline text-muted">Name: </dt><dd className="inline font-semibold">{user.name ?? "Not set"}</dd></div>
          <div><dt className="inline text-muted">Email: </dt><dd className="inline break-all font-semibold">{user.email}</dd></div>
        </dl>
      </section>

      <section className={card} aria-labelledby="dl-h">
        <h2 id="dl-h" className="text-lg font-bold">Download your data</h2>
        <p className="mt-1 text-sm text-muted">
          A file with everything we hold about you: your CVs (text and structure), searches, answers, matches, tailored CVs,
          applications, notifications and AI usage.
        </p>
        <a href="/api/account/export" download className={`mt-3 ${button}`}>Download my data</a>
      </section>

      <section className={card} aria-labelledby="ai-h">
        <h2 id="ai-h" className="text-lg font-bold">AI processing</h2>
        {consent ? (
          <>
            <p className="mt-1 text-sm text-muted">
              You agreed on {new Date(consent).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })} that your CV
              text (without your name and contact details) may be sent to DeepSeek, an AI service with servers in China. You can
              withdraw this at any time. JobPilot AI then works without AI: it reads, scores and reorders your CV itself, and
              auto-apply is switched off.
            </p>
            <form action={withdrawAiConsent} className="mt-3">
              <button type="submit" className={button}>Withdraw AI consent</button>
            </form>
          </>
        ) : (
          <p className="mt-1 text-sm text-muted">
            You have not given consent, so nothing about you is sent to an AI service. To upload a CV you will be asked again on the{" "}
            <Link href="/onboarding" className="font-semibold text-accent">set-up page</Link>.
          </p>
        )}
      </section>

      <section className={`${card} border-red-300 dark:border-red-900`} aria-labelledby="del-h">
        <h2 id="del-h" className="text-lg font-bold">Delete your account</h2>
        <p className="mt-1 text-sm text-muted">
          This permanently deletes your account, CVs and their files, searches, answers, matches, tailored CVs, applications and
          notifications. It cannot be undone. Applications already sent to employers cannot be recalled. Read more in the{" "}
          <Link href="/privacy" className="font-semibold text-accent">privacy notice</Link>.
        </p>
        <DeleteForm email={user.email} />
      </section>
    </div>
  );
}
