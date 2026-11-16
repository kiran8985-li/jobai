import Link from "next/link";
import { Table, adminButton, adminCard, adminDanger, adminPrimary, when } from "@/components/admin-blocks";
import { CopyButton } from "@/components/admin-ui";
import { Alert, inputClass } from "@/components/auth-ui";
import { adminDb, listUsers } from "@/lib/admin/data";
import { env } from "@/lib/env";
import { createInvite, revokeInvite } from "../actions";

export const metadata = { title: "Users and invites – Admin" };

const MSG: Record<string, { kind: "notice" | "error"; text: string }> = {
  invited: { kind: "notice", text: "Invite created. Copy the link below and send it to them. It works once, for that email address only." },
  revoked: { kind: "notice", text: "Invite withdrawn. The link no longer works." },
  bad_email: { kind: "error", text: "Enter a valid email address." },
  has_account: { kind: "error", text: "That email address already has an account." },
};

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ msg?: string; email?: string }> }) {
  const { db } = await adminDb();
  const sp = await searchParams;
  const [users, { data: invites }, { data: apps }] = await Promise.all([
    listUsers(db),
    db.from("invites").select("id, email, token, created_at, used_at").order("created_at", { ascending: false }).limit(200),
    db.from("applications").select("user_id").limit(10000),
  ]);
  const appCount = new Map<string, number>();
  for (const a of apps ?? []) appCount.set(a.user_id as string, (appCount.get(a.user_id as string) ?? 0) + 1);
  const base = env().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const link = (i: { token: string; email: string }) => `${base}/signup?token=${i.token}&email=${encodeURIComponent(i.email)}`;
  const open = (invites ?? []).filter((i) => !i.used_at);
  const msg = MSG[sp.msg ?? ""];

  return (
    <>
      <h1 className="text-3xl font-extrabold tracking-tight">Users and invites</h1>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}

      <section className={`mt-6 ${adminCard}`} aria-labelledby="inv-h">
        <h2 id="inv-h" className="text-lg font-bold">Invite a tester</h2>
        <form action={createInvite} className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="block flex-1 text-sm font-semibold">
            Their email address
            <input name="email" type="email" required maxLength={254} autoComplete="off" className={inputClass} />
          </label>
          <button type="submit" className={adminPrimary}>Create invite link</button>
        </form>
        <p className="mt-2 text-xs text-muted">Invite emails are not sent automatically yet: copy the link and send it yourself.</p>

        <h3 className="mt-6 text-sm font-bold">Open invites ({open.length})</h3>
        {open.length === 0 ? (
          <p className="mt-1 text-sm text-muted">No open invites.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {open.map((i) => (
              <li key={i.id} data-invite={i.email} className={`rounded-[12px] border p-3 ${sp.email === i.email ? "border-accent" : "border-line"}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-all text-sm font-semibold">{i.email}</p>
                    <p className="text-xs text-muted">Created {when(i.created_at)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <CopyButton text={link(i)} />
                    <form action={revokeInvite}>
                      <input type="hidden" name="id" value={i.id} />
                      <button type="submit" className={adminDanger}>Withdraw</button>
                    </form>
                  </div>
                </div>
                <p className="mt-2 break-all rounded-[10px] bg-page p-2 font-mono text-xs" data-invite-link>{link(i)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={`mt-6 ${adminCard}`} aria-labelledby="u-h">
        <h2 id="u-h" className="text-lg font-bold">Users ({users.length})</h2>
        <div className="mt-3">
          <Table
            caption="Users"
            head={["Name and email", "Status", "Applications", "Joined", "Last sign-in", ""]}
            empty="No users yet."
            rows={users.map((u) => [
              <span key="n" data-user={u.email}>
                <span className="block font-semibold">{u.name ?? "No name"}{u.is_admin ? " (admin)" : ""}</span>
                <span className="block break-all text-muted">{u.email}</span>
              </span>,
              !u.is_active ? <span className="font-bold text-red-700 dark:text-red-300">Suspended</span> : !u.verified ? "Email not verified" : "Active",
              appCount.get(u.id) ?? 0,
              when(u.created_at),
              when(u.last_sign_in_at),
              <Link key="v" href={`/admin/users/${u.id}`} className={adminButton}>View</Link>,
            ])}
          />
        </div>
      </section>

      <section className={`mt-6 ${adminCard}`} aria-labelledby="used-h">
        <h2 id="used-h" className="text-lg font-bold">Used invites</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {(invites ?? []).filter((i) => i.used_at).map((i) => (
            <li key={i.id} className="break-all">{i.email} <span className="text-muted">· used {when(i.used_at)}</span></li>
          ))}
          {(invites ?? []).every((i) => !i.used_at) && <li className="text-muted">None yet.</li>}
        </ul>
      </section>
    </>
  );
}
