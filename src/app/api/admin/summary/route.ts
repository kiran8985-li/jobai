import { NextResponse } from "next/server";
import { ForbiddenError, getSessionUser } from "@/lib/auth";
import { adminDb } from "@/lib/admin/data";
import { getHealth } from "@/lib/admin/health";

export const dynamic = "force-dynamic";

/**
 * Machine-readable health summary for the admin (for example, an uptime monitor run by the owner).
 * The middleware already refuses non-admins; this route checks again itself.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const { db } = await adminDb();
    const h = await getHealth(db);
    return NextResponse.json({ lastScanFinished: h.lastScanFinished, scanOverdue: h.scanOverdue, checks: h.checks, errors24h: h.errors.length });
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.json({ error: "Unavailable" }, { status: 500 });
  }
}
