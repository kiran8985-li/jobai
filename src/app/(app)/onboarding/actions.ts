"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { CvFileError, MAX_CV_BYTES, extractText, mimeFor } from "@/lib/cv/extract";
import { parseCv } from "@/lib/cv/parse";
import { hasAiConsent } from "@/lib/cv/store";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ActionState = { error?: string };

const MAX_CVS_PER_USER = 10;

export async function giveConsent(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  if (form.get("consent") !== "on") {
    return { error: "Tick the box to continue. We cannot read your CV without this consent." };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("record_ai_consent");
  if (error) return { error: "We could not save your consent. Please try again." };
  revalidatePath("/onboarding");
  return {};
}

function cleanFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "cv";
  return base.replace(/[\u0000-\u001f<>:"|?*]/g, "").trim().slice(0, 120) || "cv";
}

export async function uploadCv(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  // No consent, no upload. The database refuses too; this gives the friendly message.
  if (!(await hasAiConsent(supabase, user.id))) {
    return { error: "Please give your consent first. Reload this page to see the consent step." };
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file to upload." };
  if (file.size > MAX_CV_BYTES) return { error: "This file is larger than 5 MB. Upload a smaller file." };

  const { count } = await supabase.from("cvs").select("id", { count: "exact", head: true }).eq("user_id", user.id);
  if ((count ?? 0) >= MAX_CVS_PER_USER) {
    return { error: `You have ${MAX_CVS_PER_USER} CVs stored. Delete one on the My CVs page before uploading another.` };
  }

  const data = new Uint8Array(await file.arrayBuffer());
  const filename = cleanFilename(file.name);
  let text: string;
  let kind: "pdf" | "docx" | "txt";
  try {
    ({ text, kind } = await extractText(filename, data));
  } catch (err) {
    if (err instanceof CvFileError) return { error: err.message };
    return { error: "We could not read this file. Try a different format." };
  }

  const path = `${user.id}/${randomUUID()}.${kind}`;
  const upload = await supabase.storage.from("cvs").upload(path, data, { contentType: mimeFor(kind), upsert: false });
  if (upload.error) return { error: "We could not store your file. Please try again." };

  // CV contents are never logged, here or anywhere else.
  const parsed = await parseCv(text, user.id);
  const { data: row, error } = await supabase
    .from("cvs")
    .insert({
      user_id: user.id,
      filename,
      storage_path: path,
      raw_text: text,
      profile_json: parsed.profile,
      parsed_by: parsed.parsedBy,
      flags: parsed.flags,
    })
    .select("id")
    .single();
  if (error || !row) {
    await supabase.storage.from("cvs").remove([path]);
    return { error: "We could not save your CV. Please try again." };
  }
  redirect(`/cvs/${row.id}/review`);
}
