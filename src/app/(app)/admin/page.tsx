export const metadata = { title: "Admin – JobPilot AI" };

export default function AdminPage() {
  return (
    <div>
      <h1 className="text-3xl font-extrabold tracking-tight">Admin</h1>
      <div className="mt-6 rounded-[18px] border border-line bg-surface p-6">
        <p className="font-semibold">The admin panel is not built yet</p>
        <p className="mt-1 text-sm text-muted">
          Users, invites, job sources and usage arrive in a later phase. Until then, create invites with
          <code className="mx-1 rounded bg-accent-tint px-1.5 py-0.5">npm run invite -- someone@example.com</code>
        </p>
      </div>
    </div>
  );
}
