import "server-only";
import { redirect } from "next/navigation";
import { hasSupabase } from "./env";
import { createSupabaseServerClient } from "./supabase/server";

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  isAdmin: boolean;
};

/** The signed-in, verified, active user, or null. Always checked with Supabase, never from the cookie alone. */
export async function getSessionUser(): Promise<SessionUser | null> {
  if (!hasSupabase()) return null;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email || !user.email_confirmed_at) return null;

  const { data: profile } = await supabase
    .from("profiles_user")
    .select("name, is_admin, is_active")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || !profile.is_active) return null;

  return { id: user.id, email: user.email, name: profile.name, isAdmin: profile.is_admin === true };
}

/** For signed-in pages: returns the user or sends the visitor to the login page. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export class ForbiddenError extends Error {}

/**
 * For admin pages, server actions and admin API routes. The middleware already answers 403,
 * this is the second lock so no admin code runs without its own server-side check.
 */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.isAdmin) throw new ForbiddenError("Admin access required");
  return user;
}
