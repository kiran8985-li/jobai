import { NextResponse } from "next/server";
import { effectiveApplyMode } from "@/lib/apply";
import { env, hasAI, hasSupabase } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Liveness check. Reports which parts are configured, never the values. */
export function GET() {
  try {
    const e = env();
    return NextResponse.json({
      status: "ok",
      time: new Date().toISOString(),
      applyMode: effectiveApplyMode(e.APPLY_MODE),
      signupMode: e.SIGNUP_MODE,
      configured: {
        supabase: hasSupabase(e),
        supabaseAdmin: Boolean(e.SUPABASE_SERVICE_ROLE_KEY),
        ai: hasAI(e),
        email: Boolean(e.RESEND_API_KEY && e.MAIL_FROM),
        cron: Boolean(e.CRON_SECRET),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { status: "error", error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 },
    );
  }
}
