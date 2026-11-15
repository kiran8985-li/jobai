import { NextResponse, type NextRequest } from "next/server";
import { hasSupabase } from "@/lib/env";
import { safeNext } from "@/lib/paths";
import { syncSignupMode } from "@/lib/signup-mode";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Where Supabase sends the browser after Google sign-in or an email verification link. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const to = (path: string) => NextResponse.redirect(new URL(path, origin));
  if (!hasSupabase()) return to("/login?error=not_configured");
  await syncSignupMode();

  // Supabase reports a refused sign-up (for example no invite for this Google email) here.
  if (searchParams.get("error")) {
    const description = searchParams.get("error_description") ?? "";
    return to(/database error/i.test(description) ? "/login?error=invite" : "/login?error=auth");
  }

  const code = searchParams.get("code");
  if (!code) return to("/login?error=auth");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    // Typical cause: the email link was opened in a different browser from the one used to
    // sign up. The email is verified by then, so the user only needs to log in.
    return to("/login?notice=verified");
  }
  return to(safeNext(searchParams.get("next")));
}
