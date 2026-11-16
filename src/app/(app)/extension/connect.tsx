"use client";
import { useState, useTransition } from "react";
import { CopyButton } from "@/components/admin-ui";
import { connectExtension, disconnectExtension, type ConnectState } from "./actions";

export function ConnectPanel({ connected }: { connected: boolean }) {
  const [state, setState] = useState<ConnectState>({});
  const [pending, start] = useTransition();
  const live = state.token || (connected && !state.disconnected);
  return (
    <div className="space-y-3">
      {state.error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{state.error}</p>}
      {state.token ? (
        <div className="rounded-[12px] border border-accent bg-accent-tint p-4" data-connection-code>
          <p className="text-sm font-semibold">Your connection code</p>
          <p className="mt-2 break-all font-mono text-sm" data-code>{state.token}</p>
          <p className="mt-2 text-xs text-muted">
            Paste it into the extension now. It is shown only once and works until{" "}
            {new Date(state.expiresAt!).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.
          </p>
          <div className="mt-3"><CopyButton text={state.token} label="Copy code" /></div>
        </div>
      ) : (
        <p className="text-sm text-muted" data-connected={live ? "yes" : "no"}>
          {live ? "The extension is connected." : "The extension is not connected."}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pending} onClick={() => start(async () => setState(await connectExtension()))}
          className="flex min-h-11 items-center rounded-[12px] bg-accent px-5 font-bold text-white hover:bg-accent-hover disabled:opacity-60">
          {live ? "Get a new code" : "Get a connection code"}
        </button>
        {live && (
          <button type="button" disabled={pending} onClick={() => start(async () => setState(await disconnectExtension()))}
            className="flex min-h-11 items-center rounded-[12px] px-4 font-bold text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950">
            Disconnect
          </button>
        )}
      </div>
    </div>
  );
}
