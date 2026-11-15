import Link from "next/link";
import { Alert } from "@/components/auth-ui";
import { requireUser } from "@/lib/auth";
import { EMPLOYMENT_TYPES, MAX_PROFILES, PROFILE_COLUMNS, type SearchProfile } from "@/lib/search-profiles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { deleteProfile, setProfileActive } from "./actions";

export const metadata = { title: "Job searches – JobPilot AI" };

const chip = "rounded-full px-3 py-1 text-xs font-bold";
const typeLabel = (v: string) => EMPLOYMENT_TYPES.find((t) => t.value === v)?.label ?? v;

export default async function ProfilesPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("search_profiles").select(PROFILE_COLUMNS).eq("user_id", user.id).order("created_at");
  const profiles = (data ?? []) as SearchProfile[];
  const saved = (await searchParams).saved === "1";

  return (
    <div className="max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold tracking-tight">Job searches</h1>
        {profiles.length < MAX_PROFILES && (
          <Link href="/profiles/new" className="flex min-h-11 items-center rounded-[12px] bg-accent px-5 font-bold text-white hover:bg-accent-hover">
            Add a search
          </Link>
        )}
      </div>
      <p className="mt-2 text-sm text-muted">Each search runs on its own, with its own job titles, limits and auto-apply setting.</p>
      {saved && <Alert kind="notice">Search saved.</Alert>}

      {profiles.length === 0 ? (
        <div className="mt-6 rounded-[18px] border border-line bg-surface p-6">
          <p className="font-semibold">No searches yet</p>
          <p className="mt-1 text-sm text-muted">Add a search to tell JobPilot AI which jobs to look for.</p>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {profiles.map((p) => (
            <li key={p.id} className="rounded-[18px] border border-line bg-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h2 className="min-w-0 break-words text-lg font-bold">{p.name}</h2>
                <div className="flex flex-wrap gap-2">
                  <span className={`${chip} ${p.is_active ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300" : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"}`}>
                    {p.is_active ? "Searching" : "Paused"}
                  </span>
                  <span className={`${chip} ${p.auto_apply ? "bg-accent-tint text-accent" : "border border-line text-muted"}`}>
                    Auto-apply {p.auto_apply ? "on" : "off"}
                  </span>
                </div>
              </div>
              <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                <div><dt className="inline text-muted">Job titles: </dt><dd className="inline">{p.roles.join(", ")}</dd></div>
                <div><dt className="inline text-muted">Locations: </dt><dd className="inline">{p.locations.join(", ") || "Anywhere in the UK"}</dd></div>
                <div><dt className="inline text-muted">Minimum salary: </dt><dd className="inline">{p.min_salary ? `£${p.min_salary.toLocaleString("en-GB")}` : "Any"}</dd></div>
                <div><dt className="inline text-muted">Job types: </dt><dd className="inline">{p.employment_types.map(typeLabel).join(", ") || "Any"}</dd></div>
                <div><dt className="inline text-muted">Minimum match: </dt><dd className="inline">{p.min_match}</dd></div>
                <div><dt className="inline text-muted">Daily limit: </dt><dd className="inline">{p.daily_limit}</dd></div>
                {p.exclude_keywords.length > 0 && (
                  <div className="sm:col-span-2"><dt className="inline text-muted">Excluded: </dt><dd className="inline">{p.exclude_keywords.join(", ")}</dd></div>
                )}
              </dl>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href={`/profiles/${p.id}`} className="flex min-h-11 items-center rounded-[12px] border border-line px-4 text-sm font-bold hover:border-accent">
                  Edit
                </Link>
                <form action={setProfileActive}>
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="active" value={String(!p.is_active)} />
                  <button type="submit" className="flex min-h-11 items-center rounded-[12px] border border-line px-4 text-sm font-bold hover:border-accent">
                    {p.is_active ? "Pause this search" : "Resume this search"}
                  </button>
                </form>
                <form action={deleteProfile}>
                  <input type="hidden" name="id" value={p.id} />
                  <button type="submit" className="flex min-h-11 items-center rounded-[12px] px-4 text-sm font-bold text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950">
                    Delete
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-6 text-sm">
        <Link href="/auto-apply" className="font-semibold text-accent">
          Auto-apply settings and screening answers
        </Link>
      </p>
    </div>
  );
}
