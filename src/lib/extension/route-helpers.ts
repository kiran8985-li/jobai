import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "../env";
import { createSupabaseAdminClient } from "../supabase/admin";
import { userFromExtensionRequest } from "./tokens";

/** Every extension API call: checks the code, then hands over the user id and a database client. */
export async function withExtensionUser(request: Request, fn: (db: SupabaseClient, userId: string) => Promise<Response>): Promise<Response> {
  const e = env();
  if (!e.NEXT_PUBLIC_SUPABASE_URL || !e.SUPABASE_SERVICE_ROLE_KEY) return json({ error: "Unavailable" }, 503);
  const db = createSupabaseAdminClient();
  const userId = await userFromExtensionRequest(db, request.headers);
  if (!userId) return json({ error: "Not connected. Get a new connection code from JobPilot AI." }, 401);
  return fn(db, userId);
}

export const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
