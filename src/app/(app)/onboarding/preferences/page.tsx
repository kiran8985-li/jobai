import { Steps } from "@/components/onboarding-steps";
import { ProfileForm } from "@/components/profile-form";
import { requireUser } from "@/lib/auth";
import { env } from "@/lib/env";

export const metadata = { title: "Your job preferences – JobPilot AI" };

export default async function PreferencesPage() {
  await requireUser();
  const e = env();
  return (
    <div className="max-w-2xl">
      <h1 className="text-3xl font-extrabold tracking-tight">What jobs are you looking for?</h1>
      <Steps current={3} />
      <div className="mt-6 rounded-[18px] border border-line bg-surface p-6">
        <p className="text-sm text-muted">
          This is your first search. You can change it or add more searches later. Nothing is applied for
          automatically unless you switch auto-apply on in the next step.
        </p>
        <ProfileForm from="onboarding" defaults={{ minMatch: e.DEFAULT_MIN_MATCH, dailyLimit: e.DEFAULT_DAILY_LIMIT }} />
      </div>
    </div>
  );
}
