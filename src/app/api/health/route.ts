import { NextResponse } from "next/server";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Public liveness check: says only whether the app is up and its settings are valid. What is
 * configured (AI, email, scheduler) is not public; the admin sees it on System health and in
 * /api/admin/summary.
 */
export function GET() {
  try {
    env();
    return NextResponse.json({ status: "ok", time: new Date().toISOString() });
  } catch {
    return NextResponse.json({ status: "error", error: "Invalid settings" }, { status: 500 });
  }
}
