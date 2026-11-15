import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { hasSupabase } from "@/lib/env";
import { safeNext } from "@/lib/paths";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const TYPES: EmailOtpType[] = ["signup", "email", "recovery", "invite", "magiclink", "email_change"];

/**
 * Verification link that works in any browser. Used when the Supabase email template points to
 * /auth/confirm?token_hash=...&type=signup (see docs/auth-setup.md).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const to = (path: string) => NextResponse.redirect(new URL(path, origin));
  if (!hasSupabase()) return to("/login?error=not_configured");

  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  if (!token_hash || !type || !TYPES.includes(type)) return to("/login?error=link");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash, type });
  if (error) return to("/login?error=link");
  return to(safeNext(searchParams.get("next")));
}
