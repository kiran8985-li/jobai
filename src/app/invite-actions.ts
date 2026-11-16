"use server";
import { z } from "zod";
import { env } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type RequestState = { done?: boolean; error?: string; values?: { name: string; email: string } };

const schema = z.object({
  name: z.string().trim().max(100, "Keep your name under 100 characters."),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.").max(254)),
});

/**
 * "Request an invite" on the landing page. Stores the request for the admin; sends nothing.
 * The answer is the same whether or not the address is already known, so the form cannot be used
 * to find out who has an account. A hidden "website" field catches simple bots.
 */
export async function requestInvite(_prev: RequestState, form: FormData): Promise<RequestState> {
  const values = { name: String(form.get("name") ?? "").slice(0, 100), email: String(form.get("email") ?? "").slice(0, 254) };
  if (String(form.get("website") ?? "") !== "") return { done: true };
  const parsed = schema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form and try again.", values };
  const e = env();
  if (!e.NEXT_PUBLIC_SUPABASE_URL || !e.SUPABASE_SERVICE_ROLE_KEY) return { error: "Requests are not open yet. Please try again later.", values };
  const { error } = await createSupabaseAdminClient()
    .from("invite_requests")
    .upsert({ email: parsed.data.email, name: parsed.data.name || null }, { onConflict: "email", ignoreDuplicates: true });
  if (error) return { error: "We could not save your request. Please try again.", values };
  return { done: true };
}
