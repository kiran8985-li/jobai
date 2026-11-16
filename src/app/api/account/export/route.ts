import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { exportUserData } from "@/lib/account/data";
import { env } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** "Download my data": a JSON file of everything held about the signed-in user, and nobody else. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const e = env();
  if (!e.NEXT_PUBLIC_SUPABASE_URL || !e.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  const data = await exportUserData(createSupabaseAdminClient(), user.id, user.email);
  const day = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="jobpilot-ai-my-data-${day}.json"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
