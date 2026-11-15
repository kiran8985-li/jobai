"use client";
import Link from "next/link";
import { useActionState } from "react";
import { saveProfile, type ProfileState } from "@/app/(app)/profiles/actions";
import { Alert, inputClass, primaryButton } from "@/components/auth-ui";
import { EMPLOYMENT_TYPES, type SearchProfile } from "@/lib/search-profiles";

type Props = {
  profile?: SearchProfile;
  defaults: { minMatch: number; dailyLimit: number };
  from?: "onboarding";
};

const hint = "mt-1 block text-xs font-normal text-muted";

export function ProfileForm({ profile, defaults, from }: Props) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(saveProfile, {});
  const v = state.values;
  const text = (key: string, fallback: string) => (v ? String(v[key] ?? "") : fallback);
  const types = v ? ((v.employment_types as string[]) ?? []) : (profile?.employment_types ?? []);
  const join = (a?: string[]) => (a ?? []).join(", ");

  return (
    <form action={action} className="mt-4 space-y-5">
      {profile && <input type="hidden" name="id" value={profile.id} />}
      {from && <input type="hidden" name="from" value={from} />}

      <label className="block text-sm font-semibold">
        Name for this search
        <input name="name" required maxLength={60} defaultValue={text("name", profile?.name ?? "")} placeholder="For example: Python jobs in Manchester" className={inputClass} />
      </label>

      <label className="block text-sm font-semibold">
        Job titles
        <input name="roles" required defaultValue={text("roles", join(profile?.roles))} placeholder="Python Developer, Backend Engineer" className={inputClass} />
        <span className={hint}>Separate with commas. At least one.</span>
      </label>

      <label className="block text-sm font-semibold">
        Locations
        <input name="locations" defaultValue={text("locations", join(profile?.locations))} placeholder="Manchester, Leeds, Remote" className={inputClass} />
        <span className={hint}>Separate with commas. Leave empty for anywhere in the UK.</span>
      </label>

      <label className="block text-sm font-semibold">
        Minimum salary (£ a year)
        <input name="min_salary" inputMode="numeric" defaultValue={text("min_salary", profile?.min_salary?.toString() ?? "")} placeholder="45000" className={inputClass} />
        <span className={hint}>Optional. Jobs paying far below this are left out.</span>
      </label>

      <fieldset>
        <legend className="text-sm font-semibold">Job types</legend>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {EMPLOYMENT_TYPES.map((t) => (
            <label key={t.value} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-[12px] border border-line px-3 text-sm">
              <input type="checkbox" name="employment_types" value={t.value} defaultChecked={types.includes(t.value)} className="h-5 w-5 accent-[#6C4DFF]" />
              {t.label}
            </label>
          ))}
        </div>
        <span className={hint}>Tick none to include every type.</span>
      </fieldset>

      <label className="block text-sm font-semibold">
        Keywords to look for
        <input name="keywords" defaultValue={text("keywords", join(profile?.keywords))} placeholder="Django, AWS, fintech" className={inputClass} />
        <span className={hint}>Optional. Separate with commas.</span>
      </label>

      <label className="block text-sm font-semibold">
        Keywords to exclude
        <input name="exclude_keywords" defaultValue={text("exclude_keywords", join(profile?.exclude_keywords))} placeholder="Senior, PHP, unpaid" className={inputClass} />
        <span className={hint}>Jobs mentioning any of these are never matched.</span>
      </label>

      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block text-sm font-semibold">
          Minimum match (0 to 100)
          <input name="min_match" inputMode="numeric" required defaultValue={text("min_match", String(profile?.min_match ?? defaults.minMatch))} className={inputClass} />
          <span className={hint}>Only jobs scoring at least this are treated as matches.</span>
        </label>
        <label className="block text-sm font-semibold">
          Applications a day, at most
          <input name="daily_limit" inputMode="numeric" required defaultValue={text("daily_limit", String(profile?.daily_limit ?? defaults.dailyLimit))} className={inputClass} />
          <span className={hint}>Between 1 and 50.</span>
        </label>
      </div>

      {state.error && <Alert kind="error">{state.error}</Alert>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button type="submit" disabled={pending} className={`${primaryButton} sm:w-auto`}>
          {pending ? "Saving…" : profile ? "Save changes" : "Save this search"}
        </button>
        {!from && (
          <Link href="/profiles" className="flex min-h-11 items-center justify-center px-4 text-sm font-bold text-accent">
            Cancel
          </Link>
        )}
      </div>
    </form>
  );
}
