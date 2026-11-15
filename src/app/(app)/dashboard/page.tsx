import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { hasAiConsent, listCvs } from "@/lib/cv/store";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Dashboard – JobPilot AI" };

export default async function DashboardPage() {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const cvs = (await hasAiConsent(supabase, user.id)) ? await listCvs(supabase, user.id) : [];
  const master = cvs.find((c) => c.approved);
  const draft = cvs.find((c) => !c.approved);

  const next = master
    ? null
    : draft
      ? { title: "Review and approve your CV", body: "We have read your CV. Check it and approve it so it can be used.", href: `/cvs/${draft.id}/review`, cta: "Review my CV" }
      : { title: "Upload your CV", body: "Start by uploading your CV. You check and approve it before anything is used.", href: "/onboarding", cta: "Get started" };

  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-extrabold tracking-tight">
        {user.name ? `Welcome, ${user.name.split(" ")[0]}` : "Welcome"}
      </h1>
      <div className="mt-6 rounded-[18px] border border-line bg-surface p-6">
        {next ? (
          <>
            <p className="text-xs font-bold uppercase tracking-wide text-accent">Next step</p>
            <p className="mt-1 text-lg font-bold">{next.title}</p>
            <p className="mt-1 text-sm text-muted">{next.body}</p>
            <Link
              href={next.href}
              className="mt-4 inline-flex min-h-11 items-center rounded-[12px] bg-accent px-5 font-bold text-white hover:bg-accent-hover"
            >
              {next.cta}
            </Link>
          </>
        ) : (
          <>
            <p className="font-semibold">Your master CV is ready</p>
            <p className="mt-1 text-sm text-muted">
              Job preferences and matching are the next part of JobPilot AI to arrive. Your matches and applications
              will appear here.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
