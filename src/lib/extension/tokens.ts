import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/** How long a connection code works. Short-lived on purpose: reconnect each working day. */
export const TOKEN_HOURS = 12;
const PREFIX = "jpx_";

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/** Creates a new code for the user. The plain code is returned once and never stored. */
export async function createExtensionToken(db: SupabaseClient, userId: string, now = Date.now()) {
  const token = PREFIX + randomBytes(24).toString("base64url");
  const expires = new Date(now + TOKEN_HOURS * 3_600_000).toISOString();
  // One connection at a time per user.
  await db.from("extension_tokens").delete().eq("user_id", userId);
  const { error } = await db.from("extension_tokens").insert({ user_id: userId, token_hash: hash(token), expires_at: expires });
  if (error) throw new Error(error.message);
  return { token, expiresAt: expires };
}

export async function revokeExtensionTokens(db: SupabaseClient, userId: string) {
  await db.from("extension_tokens").delete().eq("user_id", userId);
}

/**
 * The user a request from the extension belongs to, from its "Authorization: Bearer <code>" header.
 * Null when the code is missing, wrong, expired, or the account is suspended.
 */
export async function userFromExtensionRequest(db: SupabaseClient, headers: Headers, now = Date.now()): Promise<string | null> {
  const token = /^Bearer\s+(jpx_[A-Za-z0-9_-]{20,64})$/.exec(headers.get("authorization") ?? "")?.[1];
  if (!token) return null;
  const { data } = await db.from("extension_tokens").select("id, user_id, expires_at").eq("token_hash", hash(token)).maybeSingle();
  if (!data || Date.parse(data.expires_at as string) <= now) return null;
  const { data: profile } = await db.from("profiles_user").select("is_active").eq("id", data.user_id).maybeSingle();
  if (!profile?.is_active) return null;
  await db.from("extension_tokens").update({ last_used_at: new Date(now).toISOString() }).eq("id", data.id);
  return data.user_id as string;
}
