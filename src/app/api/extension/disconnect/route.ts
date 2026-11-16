import { revokeExtensionTokens } from "@/lib/extension/tokens";
import { json, withExtensionUser } from "@/lib/extension/route-helpers";

export const dynamic = "force-dynamic";

/** Signs the extension out: its code stops working at once. */
export async function POST(request: Request) {
  return withExtensionUser(request, async (db, userId) => {
    await revokeExtensionTokens(db, userId);
    return json({ ok: true });
  });
}
