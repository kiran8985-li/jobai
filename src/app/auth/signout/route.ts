import { NextResponse, type NextRequest } from "next/server";
import { hasSupabase } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** POST only, so a link or image on another site cannot sign a user out. */
export async function POST(request: NextRequest) {
  if (hasSupabase()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  return NextResponse.redirect(new URL("/login?notice=signed_out", request.nextUrl.origin), { status: 303 });
}
