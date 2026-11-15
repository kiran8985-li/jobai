import Link from "next/link";
import { Alert } from "@/components/auth-ui";
import { requireUser } from "@/lib/auth";
import { listCvs } from "@/lib/cv/store";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { deleteCv } from "./actions";

export const metadata = { title: "My CVs – JobPilot AI" };

export default async function CvsPage({ searchParams }: { searchParams: Promise<{ approved?: string }> }) {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const cvs = await listCvs(supabase, user.id);
  const approved = (await searchParams).approved === "1";

  return (
    <div className="max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold tracking-tight">My CVs</h1>
        <Link
          href="/onboarding"
          className="flex min-h-11 items-center rounded-[12px] bg-accent px-5 font-bold text-white hover:bg-accent-hover"
        >
          Upload a CV
        </Link>
      </div>
      {approved && <Alert kind="notice">Your master CV is approved. JobPilot AI will only ever use facts from it.</Alert>}

      {cvs.length === 0 ? (
        <div className="mt-6 rounded-[18px] border border-line bg-surface p-6">
          <p className="font-semibold">No CVs yet</p>
          <p className="mt-1 text-sm text-muted">Upload your CV to start. You check and approve it before it is used.</p>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {cvs.map((cv) => (
            <li key={cv.id} className="rounded-[18px] border border-line bg-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-bold">{cv.filename}</p>
                  <p className="mt-1 text-sm text-muted">
                    Uploaded {new Date(cv.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    {cv.flags.length > 0 && ` · ${cv.flags.length} item${cv.flags.length === 1 ? "" : "s"} removed when reading`}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    cv.approved
                      ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
                      : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                  }`}
                >
                  {cv.approved ? "Master CV" : "Needs your approval"}
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href={`/cvs/${cv.id}/review`}
                  className="flex min-h-11 items-center rounded-[12px] border border-line px-4 text-sm font-bold hover:border-accent"
                >
                  {cv.approved ? "View or edit" : "Review and approve"}
                </Link>
                <form action={deleteCv}>
                  <input type="hidden" name="id" value={cv.id} />
                  <button
                    type="submit"
                    className="flex min-h-11 items-center rounded-[12px] px-4 text-sm font-bold text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950"
                  >
                    Delete
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
