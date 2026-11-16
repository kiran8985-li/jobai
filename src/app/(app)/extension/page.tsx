import { requireUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ConnectPanel } from "./connect";

export const metadata = { title: "Browser extension – JobPilot AI" };

const card = "mt-4 rounded-[18px] border border-line bg-surface p-5 sm:p-6";

export default async function ExtensionPage() {
  const user = await requireUser();
  const e = env();
  let connected = false;
  if (e.NEXT_PUBLIC_SUPABASE_URL && e.SUPABASE_SERVICE_ROLE_KEY) {
    const { count } = await createSupabaseAdminClient().from("extension_tokens").select("id", { count: "exact", head: true }).eq("user_id", user.id).gt("expires_at", new Date().toISOString());
    connected = (count ?? 0) > 0;
  }
  return (
    <div className="max-w-2xl">
      <h1 className="text-3xl font-extrabold tracking-tight">Browser extension</h1>
      <p className="mt-2 text-sm text-muted">
        For jobs you apply to on an employer&apos;s site: the JobPilot AI extension for Chrome fills the application form with your
        details, your saved answers and the CV tailored for that job. You check everything and press Submit yourself.
      </p>
      <section className={card} aria-labelledby="c-h">
        <h2 id="c-h" className="text-lg font-bold">Connect</h2>
        <p className="mt-1 mb-3 text-sm text-muted">Get a code, then paste it into the extension. Codes last 12 hours.</p>
        <ConnectPanel connected={connected} />
      </section>
      <section className={card} aria-labelledby="w-h">
        <h2 id="w-h" className="text-lg font-bold">What it does, and does not do</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          <li>It only runs when you click it on an application page.</li>
          <li>It fills your name, email, phone, links, current role, education and skills, and attaches your tailored CV.</li>
          <li>It answers only questions you have saved answers for. Anything else is highlighted for you to answer.</li>
          <li>It never answers questions about disability, ethnicity, health, criminal record, religion, sexual orientation or similar.</li>
          <li>It never presses Submit, and it does not work on LinkedIn or Indeed.</li>
          <li>It keeps nothing about your CV once the tab is closed. Only the connection code is stored, until you disconnect.</li>
        </ul>
      </section>
      <section className={card} aria-labelledby="i-h">
        <h2 id="i-h" className="text-lg font-bold">Install (beta)</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
          <li>Ask the owner for the extension folder (the <code>extension</code> folder of the project).</li>
          <li>In Chrome, open <code>chrome://extensions</code> and switch on Developer mode.</li>
          <li>Choose &ldquo;Load unpacked&rdquo; and pick the folder.</li>
          <li>Click the JobPilot AI icon, enter this site&apos;s address ({e.NEXT_PUBLIC_APP_URL}) and your code.</li>
        </ol>
      </section>
    </div>
  );
}
