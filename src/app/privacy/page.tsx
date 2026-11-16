import Link from "next/link";
import { SITE } from "@/lib/site";

export const metadata = { title: "Privacy – JobPilot AI" };

const h2 = "mt-8 text-xl font-extrabold";
const p = "mt-2 text-sm leading-relaxed";
const ul = "mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed";

/**
 * The privacy notice. Plain English, written for the invite-only beta. It must be checked by
 * someone qualified before JobPilot AI charges customers (see the "After the beta" list in PROMPTS.md).
 */
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:py-16">
      <Link href="/" className="inline-flex min-h-11 items-center font-semibold text-accent">JobPilot AI</Link>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Privacy notice</h1>
      <p className="mt-1 text-sm text-muted">Last updated {SITE.noticeUpdated}. This covers the invite-only beta.</p>

      <h2 className={h2}>Who we are</h2>
      <p className={p}>
        JobPilot AI is run by {SITE.owner}, who decides how your data is used (the &ldquo;controller&rdquo; under UK GDPR). Questions,
        requests and complaints: <a className="font-semibold text-accent" href={`mailto:${SITE.privacyEmail}`}>{SITE.privacyEmail}</a>.
      </p>

      <h2 className={h2}>What we store, and why</h2>
      <ul className={ul}>
        <li><strong>Your account:</strong> name, email address and password (stored scrambled by our login provider). To let you sign in.</li>
        <li><strong>Your CV:</strong> the file you upload, its text, and the structured version you check and approve. To find, score and tailor jobs for you.</li>
        <li><strong>Your job searches and screening answers</strong> (for example notice period, right to work). To find jobs and fill in what employers ask.</li>
        <li><strong>Matches, tailored CVs and applications,</strong> including the exact email and CV prepared for each job. So you can see exactly what was prepared or sent.</li>
        <li><strong>Notifications</strong> and a record of <strong>AI use</strong> (what for and how much, never your CV text). To keep you informed and to control costs.</li>
        <li><strong>Consents,</strong> with the date you gave them. To show we asked.</li>
      </ul>
      <p className={p}>
        We do not ask for, and never answer on your behalf, questions about disability, ethnicity, health, criminal record,
        religion or sexual orientation. We do not sell your data or use it for advertising.
      </p>

      <h2 className={h2}>Our lawful basis</h2>
      <ul className={ul}>
        <li><strong>Contract:</strong> running your account and the service you asked for.</li>
        <li><strong>Consent:</strong> sending your CV text to the AI service, and applying for jobs on your behalf. You give each separately and can withdraw each at any time.</li>
      </ul>

      <h2 className={h2}>Who processes your data for us</h2>
      <ul className={ul}>
        <li>
          <strong>DeepSeek</strong> (AI service; servers in China). Only with your consent, it receives your CV text with your name, email,
          phone number and address removed, and the job adverts it is compared with. It reads your CV, checks eligibility and suggests
          wording. DeepSeek may use what it receives to train its AI models unless an opt-out is in place. China is not covered by a UK
          &ldquo;adequacy&rdquo; decision, so UK data protection law may not protect your data to the same standard there.
        </li>
        <li><strong>Supabase</strong> (database, login and file storage), in the region chosen for the service.</li>
        <li><strong>Resend</strong> (email). Not used during the beta: applications are prepared but not sent by email.</li>
        <li><strong>Job sites</strong> (Adzuna, Reed and companies&apos; public job boards). We only read job adverts from them; nothing about you is sent to them.</li>
      </ul>
      <p className={p}>We plan to move to an AI provider based in the UK or EU, or one that does not train on your data, before charging customers. If the provider changes, we will ask for your consent again.</p>

      <h2 className={h2}>How long we keep it</h2>
      <p className={p}>
        We keep your data while your account is open. When you delete your account, your CVs, files, searches, answers, matches,
        tailored CVs, applications and notifications are deleted immediately. A record of AI use is kept without your name, so costs
        still add up. Copies may remain in our providers&apos; backups for a short time (at most 30 days) before they are overwritten. Job
        adverts are public information; they are linked to you only through your matches and applications, which are deleted
        with your account.
      </p>

      <h2 className={h2}>Your rights</h2>
      <ul className={ul}>
        <li><strong>See your data:</strong> Account → Download my data.</li>
        <li><strong>Correct it:</strong> edit your CV on My CVs, and your searches and answers in their settings.</li>
        <li><strong>Delete it:</strong> Account → Delete my account and data.</li>
        <li><strong>Withdraw consent:</strong> Account → Withdraw AI consent, and Auto-apply → Withdraw consent for each search.</li>
        <li><strong>Object or ask a question:</strong> email {SITE.privacyEmail}.</li>
        <li>
          <strong>Complain:</strong> you can complain to the Information Commissioner&apos;s Office (ico.org.uk, 0303 123 1113), though we
          would like the chance to put things right first.
        </li>
      </ul>

      <h2 className={h2}>Cookies</h2>
      <p className={p}>
        We use only the cookies needed to keep you signed in. Your light or dark theme choice is saved in your own browser. There
        are no advertising or tracking cookies.
      </p>

      <h2 className={h2}>Applying on your behalf</h2>
      <p className={p}>
        When you switch on auto-apply for a search, JobPilot AI may contact employers in your name with your contact details, a CV
        tailored only from facts in your approved CV, a short cover note, and your saved answers. Each employer then holds that
        application under its own privacy notice.
      </p>
    </main>
  );
}
