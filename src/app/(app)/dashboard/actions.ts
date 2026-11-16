"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { runUserScan } from "@/lib/scan/user-scan";

/** "Run scan now". The user id comes from the session, never from the form. */
export async function scanNow(): Promise<void> {
  const user = await requireUser();
  const r = await runUserScan(user.id);
  revalidatePath("/", "layout");
  const q = r.ok
    ? `scan=done&jobs=${r.newJobs}&matches=${r.newMatches}&apps=${r.applications}`
    : r.reason === "cooldown"
      ? `scan=cooldown&wait=${r.minutesLeft}`
      : `scan=${r.reason}`;
  redirect(`/dashboard?${q}`);
}
