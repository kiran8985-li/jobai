import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { hasAiConsent, listCvs } from "@/lib/cv/store";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Steps } from "@/components/onboarding-steps";
import { ConsentForm, UploadForm } from "./forms";

export const metadata = { title: "Set up – JobPilot AI" };

export default async function OnboardingPage() {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const consent = await hasAiConsent(supabase, user.id);
  const draft = consent ? (await listCvs(supabase, user.id)).find((c) => !c.approved) : undefined;

  return (
    <div className="max-w-2xl">
      <h1 className="text-3xl font-extrabold tracking-tight">Set up your CV</h1>
      <Steps current={consent ? 1 : 0} />
      <div className="mt-6 rounded-[18px] border border-line bg-surface p-6">
        {!consent ? (
          <>
            <h2 className="text-lg font-bold">Before you upload: how your CV is processed</h2>
            <ConsentForm />
          </>
        ) : (
          <>
            <h2 className="text-lg font-bold">Upload your CV</h2>
            <p className="mt-1 text-sm text-muted">
              We read it into a structured CV for you to check. Nothing is used until you approve it.
            </p>
            <UploadForm />
          </>
        )}
      </div>
      {draft && (
        <p className="mt-4 text-sm">
          You have a CV waiting for review:{" "}
          <Link href={`/cvs/${draft.id}/review`} className="font-semibold text-accent">
            continue reviewing {draft.filename}
          </Link>
        </p>
      )}
    </div>
  );
}
