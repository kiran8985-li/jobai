"use client";
import { useActionState } from "react";
import { Alert, inputClass } from "@/components/auth-ui";
import { deleteAccount, type DeleteState } from "./actions";

export function DeleteForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState<DeleteState, FormData>(deleteAccount, {});
  return (
    <form action={action} className="mt-3 space-y-3">
      {state.error && <Alert kind="error">{state.error}</Alert>}
      <label className="block text-sm font-semibold">
        To confirm, type your email address: <span className="break-all font-normal">{email}</span>
        <input name="confirm" type="email" required autoComplete="off" className={inputClass} />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="flex min-h-11 items-center justify-center rounded-[12px] bg-red-700 px-5 font-bold text-white hover:bg-red-800 disabled:opacity-60"
      >
        {pending ? "Deleting…" : "Delete my account and data"}
      </button>
    </form>
  );
}
