"use client";
import { useActionState } from "react";
import { requestInvite, type RequestState } from "@/app/invite-actions";
import { Alert, inputClass, primaryButton } from "./auth-ui";

export function RequestInviteForm() {
  const [state, action, pending] = useActionState<RequestState, FormData>(requestInvite, {});
  if (state.done) {
    return (
      <p role="status" className="rounded-[12px] border border-line bg-accent-tint px-4 py-3 text-sm">
        Thank you. Your request is with us. If a place opens up, you will get an invite link by email.
      </p>
    );
  }
  return (
    <form action={action} className="space-y-3" aria-label="Request an invite">
      {state.error && <Alert kind="error">{state.error}</Alert>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-semibold">
          Your name
          <input name="name" autoComplete="name" maxLength={100} defaultValue={state.values?.name} className={inputClass} />
        </label>
        <label className="block text-sm font-semibold">
          Email address
          <input name="email" type="email" required autoComplete="email" maxLength={254} defaultValue={state.values?.email} className={inputClass} />
        </label>
      </div>
      {/* Left empty by people; filled in by simple bots. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <button type="submit" disabled={pending} className={`${primaryButton} sm:w-auto`}>
        {pending ? "Sending…" : "Request an invite"}
      </button>
      <p className="text-xs text-muted">We only use your email to reply about the beta. See our privacy notice.</p>
    </form>
  );
}
