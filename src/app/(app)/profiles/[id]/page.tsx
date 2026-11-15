import { notFound } from "next/navigation";
import { z } from "zod";
import { ProfileForm } from "@/components/profile-form";
import { requireUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { PROFILE_COLUMNS, type SearchProfile } from "@/lib/search-profiles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Edit search – JobPilot AI" };

export default async function EditProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("search_profiles").select(PROFILE_COLUMNS).eq("id", id.data).eq("user_id", user.id).maybeSingle();
  if (!data) notFound();
  const e = env();
  return (
    <div className="max-w-2xl">
      <h1 className="text-3xl font-extrabold tracking-tight">Edit search</h1>
      <div className="mt-6 rounded-[18px] border border-line bg-surface p-6">
        <ProfileForm profile={data as SearchProfile} defaults={{ minMatch: e.DEFAULT_MIN_MATCH, dailyLimit: e.DEFAULT_DAILY_LIMIT }} />
      </div>
    </div>
  );
}
