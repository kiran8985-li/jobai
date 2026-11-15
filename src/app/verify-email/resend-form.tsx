"use client";
import { useActionState } from "react";
import { resendVerification, type FormState } from "@/app/auth/actions";
import { Alert, inputClass, secondaryButton } from "@/components/auth-ui";

export function ResendForm({ email }: { email?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(resendVerification, {});
  return (
    <form action={action} className="mt-5 space-y-3">
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.notice && <Alert kind="notice">{state.notice}</Alert>}
      <label className="block text-sm font-semibold">
        Email
        <input name="email" type="email" required defaultValue={email} className={inputClass} />
      </label>
      <button type="submit" disabled={pending} className={secondaryButton}>
        {pending ? "Sending…" : "Send the email again"}
      </button>
    </form>
  );
}
