"use client";
import { useActionState } from "react";
import { signup, type FormState } from "@/app/auth/actions";
import { Alert, inputClass, primaryButton } from "@/components/auth-ui";

export function SignupForm({ token, email, lockEmail }: { token?: string; email?: string; lockEmail: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(signup, {});
  return (
    <form action={action} className="mt-4 space-y-4">
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {token && <input type="hidden" name="token" value={token} />}
      <label className="block text-sm font-semibold">
        Your name
        <input name="name" type="text" autoComplete="name" required maxLength={100} defaultValue={state.values?.name} className={inputClass} />
      </label>
      <label className="block text-sm font-semibold">
        Email
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={lockEmail ? email : (state.values?.email ?? email)}
          readOnly={lockEmail}
          className={`${inputClass} ${lockEmail ? "text-muted" : ""}`}
        />
        {lockEmail && (
          <span className="mt-1 block text-xs font-normal text-muted">Your invite only works with this address.</span>
        )}
      </label>
      <label className="block text-sm font-semibold">
        Password
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          className={inputClass}
        />
        <span className="mt-1 block text-xs font-normal text-muted">At least 10 characters.</span>
      </label>
      <button type="submit" disabled={pending} className={primaryButton}>
        {pending ? "Creating your account…" : "Create account"}
      </button>
    </form>
  );
}
