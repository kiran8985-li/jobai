// Creates an invite and prints the sign-up link. Run: npm run invite -- someone@example.com
// Uses the server-only service role key from .env.local. Needed for the very first account
// (which becomes the admin); after that, invites are made in the admin panel.
import { createClient } from "@supabase/supabase-js";

const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("Usage: npm run invite -- someone@example.com");
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

// Reuse an open invite for this email if there is one.
let { data: invite, error } = await supabase
  .from("invites")
  .select("token")
  .eq("email", email)
  .is("used_at", null)
  .maybeSingle();
if (!error && !invite) {
  ({ data: invite, error } = await supabase.from("invites").insert({ email }).select("token").single());
}
if (error) {
  console.error("Could not create the invite:", error.message);
  process.exit(1);
}
console.log(`Invite for ${email} (works once, for this address only):\n`);
console.log(`${appUrl}/signup?token=${invite.token}&email=${encodeURIComponent(email)}\n`);
