import { buildExtensionPayload } from "@/lib/extension/payload";
import { isBlockedUrl } from "@/lib/extension/match-url";
import { json, withExtensionUser } from "@/lib/extension/route-helpers";

export const dynamic = "force-dynamic";

/** POST { url }: the user's details, saved answers and the job this tab belongs to. */
export async function POST(request: Request) {
  return withExtensionUser(request, async (db, userId) => {
    const body = (await request.json().catch(() => ({}))) as { url?: unknown };
    const url = typeof body.url === "string" ? body.url.slice(0, 2000) : "";
    if (!url || isBlockedUrl(url)) return json({ error: "JobPilot AI does not work on this site." }, 400);
    return json(await buildExtensionPayload(db, userId, url));
  });
}
