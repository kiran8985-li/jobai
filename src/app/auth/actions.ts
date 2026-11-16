"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { env, hasSupabase } from "@/lib/env";
import { safeNext } from "@/lib/paths";
import { syncSignupMode } from "@/lib/signup-mode";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** `values` lets the form keep what was typed (never the password) after an error. */
export type FormState = { error?: string; notice?: string; values?: { email?: string; name?: string } };

const NOT_CONFIGURED = "Sign-in is not set up yet. The site owner needs to add the Supabase settings.";
const INVITE_INVALID =
  "This invite is not valid for this email address, or it has already been used. Use the email address your invite was sent to.";

const email = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.").max(254));

const loginSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password.").max(200),
});

const signupSchema = z.object({
  email,
  password: z.string().min(10, "Use at least 10 characters for your password.").max(200),
  name: z.string().trim().min(1, "Enter your name.").max(100),
  token: z.string().trim().max(200).optional(),
});

function firstError(err: z.ZodError): string {
  return err.issues[0]?.message ?? "Check the form and try again.";
}

export async function login(_prev: FormState, form: FormData): Promise<FormState> {
  if (!hasSupabase()) return { error: NOT_CONFIGURED };
  const values = { email: String(form.get("email") ?? "").slice(0, 254) };
  const parsed = loginSchema.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: firstError(parsed.error), values };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.code === "email_not_confirmed") {
      redirect(`/verify-email?email=${encodeURIComponent(parsed.data.email)}`);
    }
    // Same message for a wrong password and an unknown email, so accounts cannot be probed.
    return { error: "The email or password is not right.", values };
  }
  // A suspended account is turned away here with a clear reason, not just bounced back to this page.
  const { data: auth } = await supabase.auth.getUser();
  if (auth.user) {
    const { data: profile } = await supabase.from("profiles_user").select("is_active").eq("id", auth.user.id).maybeSingle();
    if (profile && !profile.is_active) {
      await supabase.auth.signOut();
      return { error: "This account has been suspended. Contact the site owner.", values };
    }
  }
  redirect(safeNext(form.get("next")?.toString()));
}

export async function signup(_prev: FormState, form: FormData): Promise<FormState> {
  const values = {
    email: String(form.get("email") ?? "").slice(0, 254),
    name: String(form.get("name") ?? "").slice(0, 100),
  };
  if (!hasSupabase()) return { error: NOT_CONFIGURED, values };
  const parsed = signupSchema.safeParse({
    email: form.get("email"),
    password: form.get("password"),
    name: form.get("name"),
    token: form.get("token") || undefined,
  });
  if (!parsed.success) return { error: firstError(parsed.error), values };
  const { email, password, name, token } = parsed.data;

  const e = env();
  if (e.SIGNUP_MODE === "invite" && !token) {
    return { error: "You need an invite to sign up. Open the link from your invite email.", values };
  }
  await syncSignupMode();

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // The database checks invite_token against the invite for this email, then discards it.
      data: token ? { name, invite_token: token } : { name },
      emailRedirectTo: `${e.NEXT_PUBLIC_APP_URL}/auth/callback?next=/dashboard`,
    },
  });
  if (error) {
    if (error.code === "weak_password") return { error: "That password is too weak. Try a longer one.", values };
    if (error.code === "over_email_send_rate_limit" || error.status === 429) {
      return { error: "Too many attempts. Wait a few minutes and try again.", values };
    }
    // The database refuses the new user when the invite check fails.
    if (e.SIGNUP_MODE === "invite") return { error: INVITE_INVALID, values };
    return { error: "We could not create your account. Try again in a moment.", values };
  }
  redirect(`/verify-email?email=${encodeURIComponent(email)}`);
}

export async function resendVerification(_prev: FormState, form: FormData): Promise<FormState> {
  if (!hasSupabase()) return { error: NOT_CONFIGURED };
  const parsed = email.safeParse(form.get("email"));
  if (!parsed.success) return { error: "Enter a valid email address." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data,
    options: { emailRedirectTo: `${env().NEXT_PUBLIC_APP_URL}/auth/callback?next=/dashboard` },
  });
  if (error && (error.status === 429 || error.code === "over_email_send_rate_limit")) {
    return { error: "Please wait a minute before asking for another email." };
  }
  // Same answer whether or not the address has an account.
  return { notice: "If that address has an account waiting, a new verification email is on its way." };
}
