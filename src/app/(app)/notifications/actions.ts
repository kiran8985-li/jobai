"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Users may only change is_read on their own notifications (RLS and a column grant enforce this).

export async function markAllRead(): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  await supabase.from("notifications").update({ is_read: true }).eq("user_id", user.id).eq("is_read", false);
  revalidatePath("/", "layout");
}

export async function markRead(form: FormData): Promise<void> {
  const user = await requireUser();
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success) return;
  const supabase = await createSupabaseServerClient();
  await supabase.from("notifications").update({ is_read: true }).eq("id", id.data).eq("user_id", user.id);
  revalidatePath("/", "layout");
}
