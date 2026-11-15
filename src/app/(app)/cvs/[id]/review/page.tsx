import { notFound } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { normalizeProfile } from "@/lib/cv/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Steps } from "@/components/onboarding-steps";
import { ReviewForm } from "./review-form";

export const metadata = { title: "Review your CV – JobPilot AI" };

export default async function ReviewCvPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const supabase = await createSupabaseServerClient();
  const { data: cv } = await supabase
    .from("cvs")
    .select("id, filename, profile_json, parsed_by, flags, approved")
    .eq("id", id.data)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!cv) notFound();

  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-extrabold tracking-tight">Review your CV</h1>
      {!cv.approved && <Steps current={2} />}
      <p className="mt-4 text-sm text-muted">
        This is what we read from <strong className="text-fg">{cv.filename}</strong>
        {cv.parsed_by === "ai" ? " using AI" : " using our built-in reader"}. Check every part and correct anything
        that is wrong. Once approved it becomes your master CV: tailored CVs can only use what is written here.
      </p>
      {cv.flags.length > 0 && (
        <div className="mt-4 rounded-[18px] border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <p className="font-bold">We removed {cv.flags.length} item{cv.flags.length === 1 ? "" : "s"} we could not find in your file</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {cv.flags.map((f: string, i: number) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
          <p className="mt-2">If any of these are real, add them back below.</p>
        </div>
      )}
      <ReviewForm id={cv.id} initial={normalizeProfile(cv.profile_json)} approved={cv.approved} />
    </div>
  );
}
