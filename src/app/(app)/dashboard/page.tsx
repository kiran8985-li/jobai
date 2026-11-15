import { requireUser } from "@/lib/auth";

export const metadata = { title: "Dashboard – JobPilot AI" };

export default async function DashboardPage() {
  const user = await requireUser();
  return (
    <div>
      <h1 className="text-3xl font-extrabold tracking-tight">
        {user.name ? `Welcome, ${user.name.split(" ")[0]}` : "Welcome"}
      </h1>
      <div className="mt-6 rounded-[18px] border border-line bg-surface p-6">
        <p className="font-semibold">Nothing here yet</p>
        <p className="mt-1 text-sm text-muted">
          Your matches and applications will appear here. The next step, uploading your CV, is coming soon.
        </p>
      </div>
    </div>
  );
}
