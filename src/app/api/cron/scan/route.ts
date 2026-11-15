import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { runConfiguredScan } from "@/lib/scan";
import { isCronAuthorized } from "@/lib/scan/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Called every 15 minutes by .github/workflows/scan.yml. POST only, secret required. */
export async function POST(request: NextRequest) {
  const e = env();
  if (!isCronAuthorized(request.headers, e.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!e.NEXT_PUBLIC_SUPABASE_URL || !e.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Database is not configured" }, { status: 503 });
  }
  try {
    const result = await runConfiguredScan();
    return NextResponse.json(result, { status: result.status === "already_running" ? 202 : 200 });
  } catch {
    return NextResponse.json({ error: "Scan failed" }, { status: 500 });
  }
}
