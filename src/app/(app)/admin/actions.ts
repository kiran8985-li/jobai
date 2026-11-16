"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { adminDb } from "@/lib/admin/data";
import { runConfiguredScan } from "@/lib/scan";
import { createSources } from "@/lib/sources/connectors";
import { env } from "@/lib/env";

// Every action starts with adminDb(), which checks is_admin on the server before anything else.

const email = z.string().trim().toLowerCase().pipe(z.email().max(254));
const uuid = z.uuid();

export async function createInvite(form: FormData): Promise<void> {
  const { db, adminId } = await adminDb();
  const parsed = email.safeParse(form.get("email"));
  if (!parsed.success) redirect("/admin/users?msg=bad_email");
  // An address that already has an account does not need an invite.
  const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (list?.users.some((u) => u.email?.toLowerCase() === parsed.data)) redirect("/admin/users?msg=has_account");
  const { data: open } = await db.from("invites").select("id").eq("email", parsed.data).is("used_at", null).maybeSingle();
  if (!open) await db.from("invites").insert({ email: parsed.data, created_by: adminId });
  revalidatePath("/admin/users");
  redirect(`/admin/users?msg=invited&email=${encodeURIComponent(parsed.data)}`);
}

export async function revokeInvite(form: FormData): Promise<void> {
  const { db } = await adminDb();
  const id = uuid.safeParse(form.get("id"));
  if (id.success) await db.from("invites").delete().eq("id", id.data).is("used_at", null);
  revalidatePath("/admin/users");
  redirect("/admin/users?msg=revoked");
}

/** Suspend or restore an account. An admin cannot suspend themselves or another admin. */
export async function setUserActive(form: FormData): Promise<void> {
  const { db, adminId } = await adminDb();
  const id = uuid.safeParse(form.get("id"));
  if (!id.success) redirect("/admin/users");
  const active = form.get("active") === "true";
  const back = `/admin/users/${id.data}`;
  if (id.data === adminId) redirect(`${back}?msg=self`);
  const { data: target } = await db.from("profiles_user").select("is_admin").eq("id", id.data).maybeSingle();
  if (!target) redirect("/admin/users");
  if (target.is_admin && !active) redirect(`${back}?msg=admin`);
  await db.from("profiles_user").update({ is_active: active }).eq("id", id.data);
  // A suspended user's sessions are ended, so they are locked out straight away.
  if (!active) await db.auth.admin.signOut(id.data, "global").catch(() => {});
  revalidatePath("/admin/users");
  redirect(`${back}?msg=${active ? "restored" : "suspended"}`);
}

const SOURCES = () => createSources(env()).map((s) => s.name);

export async function setSourceEnabled(form: FormData): Promise<void> {
  const { db } = await adminDb();
  const name = String(form.get("name") ?? "");
  if (!SOURCES().includes(name)) redirect("/admin/sources");
  const enabled = form.get("enabled") === "true";
  await db.from("source_status").upsert({ name, enabled }, { onConflict: "name" });
  revalidatePath("/admin/sources");
  redirect(`/admin/sources?msg=${enabled ? "on" : "off"}&source=${name}`);
}

/** Runs one source now, ignoring its "about hourly" wait. Also scores, tailors and prepares as usual. */
export async function runSourceNow(form: FormData): Promise<void> {
  await adminDb();
  const name = String(form.get("name") ?? "");
  if (!SOURCES().includes(name)) redirect("/admin/sources");
  let q: string;
  try {
    const r = await runConfiguredScan({ only: name });
    if (r.status === "already_running") q = "busy";
    else {
      const s = r.sources.find((x) => x.name === name);
      q = s?.state === "ran" ? `ran&count=${s.count}` : `state_${s?.state ?? "unknown"}`;
    }
  } catch {
    q = "failed";
  }
  revalidatePath("/admin/sources");
  redirect(`/admin/sources?msg=${q}&source=${name}`);
}

/** Turns an invite request into an invite (or dismisses it). */
export async function handleInviteRequest(form: FormData): Promise<void> {
  const { db, adminId } = await adminDb();
  const id = uuid.safeParse(form.get("id"));
  if (!id.success) redirect("/admin/users");
  const { data: req } = await db.from("invite_requests").select("email").eq("id", id.data).is("handled_at", null).maybeSingle();
  if (!req) redirect("/admin/users");
  const dismiss = form.get("outcome") === "dismissed";
  if (!dismiss) {
    const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (list?.users.some((u) => u.email?.toLowerCase() === req.email)) {
      await db.from("invite_requests").update({ handled_at: new Date().toISOString(), outcome: "dismissed" }).eq("id", id.data);
      redirect("/admin/users?msg=has_account");
    }
    const { data: open } = await db.from("invites").select("id").eq("email", req.email).is("used_at", null).maybeSingle();
    if (!open) await db.from("invites").insert({ email: req.email, created_by: adminId });
  }
  await db.from("invite_requests").update({ handled_at: new Date().toISOString(), outcome: dismiss ? "dismissed" : "invited" }).eq("id", id.data);
  revalidatePath("/admin/users");
  redirect(dismiss ? "/admin/users?msg=dismissed" : `/admin/users?msg=invited&email=${encodeURIComponent(req.email)}`);
}
