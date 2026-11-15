"use client";
import { useActionState } from "react";
import { login, type FormState } from "@/app/auth/actions";
import { Alert, inputClass, primaryButton } from "@/components/auth-ui";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(login, {});
  return (
    <form action={action} className="mt-4 space-y-4">
      {state.error && <Alert kind="error">{state.error}</Alert>}
      <input type="hidden" name="next" value={next} />
      <label className="block text-sm font-semibold">
        Email
        <input name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} className={inputClass} />
      </label>
      <label className="block text-sm font-semibold">
        Password
        <input name="password" type="password" autoComplete="current-password" required className={inputClass} />
      </label>
      <button type="submit" disabled={pending} className={primaryButton}>
        {pending ? "Logging in…" : "Log in"}
      </button>
    </form>
  );
}
