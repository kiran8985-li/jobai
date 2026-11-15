"use client";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { secondaryButton } from "./auth-ui";

/** Starts Google sign-in. In invite mode the database only accepts Google emails that hold an invite. */
export function GoogleButton({ next = "/dashboard", label }: { next?: string; label: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function go() {
    setBusy(true);
    setError("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
      });
      if (error) throw error;
    } catch {
      setError("Google sign-in is not available right now.");
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" onClick={go} disabled={busy} className={secondaryButton}>
        {busy ? "Opening Google…" : label}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
    </>
  );
}
