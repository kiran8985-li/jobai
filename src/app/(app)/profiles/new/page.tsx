import { ProfileForm } from "@/components/profile-form";
import { requireUser } from "@/lib/auth";
import { env } from "@/lib/env";

export const metadata = { title: "Add a search – JobPilot AI" };

export default async function NewProfilePage() {
  await requireUser();
  const e = env();
  return (
    <div className="max-w-2xl">
      <h1 className="text-3xl font-extrabold tracking-tight">Add a search</h1>
      <div className="mt-6 rounded-[18px] border border-line bg-surface p-6">
        <ProfileForm defaults={{ minMatch: e.DEFAULT_MIN_MATCH, dailyLimit: e.DEFAULT_DAILY_LIMIT }} />
      </div>
    </div>
  );
}
