"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { createExtensionToken, revokeExtensionTokens } from "@/lib/extension/tokens";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type ConnectState = { token?: string; expiresAt?: string; error?: string; disconnected?: boolean };

export async function connectExtension(): Promise<ConnectState> {
  const user = await requireUser();
  const e = env();
  if (!e.NEXT_PUBLIC_SUPABASE_URL || !e.SUPABASE_SERVICE_ROLE_KEY) return { error: "Not available right now." };
  try {
    return await createExtensionToken(createSupabaseAdminClient(), user.id);
  } catch {
    return { error: "Could not create a code. Please try again." };
  }
}

export async function disconnectExtension(): Promise<ConnectState> {
  const user = await requireUser();
  const e = env();
  if (e.NEXT_PUBLIC_SUPABASE_URL && e.SUPABASE_SERVICE_ROLE_KEY) await revokeExtensionTokens(createSupabaseAdminClient(), user.id);
  revalidatePath("/extension");
  return { disconnected: true };
}
