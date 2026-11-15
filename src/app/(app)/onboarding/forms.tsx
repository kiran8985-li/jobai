"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { Alert, primaryButton } from "@/components/auth-ui";
import { giveConsent, uploadCv, type ActionState } from "./actions";

export function ConsentForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(giveConsent, {});
  return (
    <form action={action} className="mt-4 space-y-4">
      {state.error && <Alert kind="error">{state.error}</Alert>}
      <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-[12px] border border-line p-4 text-sm">
        <input type="checkbox" name="consent" required className="mt-0.5 h-5 w-5 shrink-0 accent-[#6C4DFF]" />
        <span>
          I agree that the text of my CV is sent to <strong>DeepSeek</strong>, an AI company whose servers are in{" "}
          <strong>China</strong>, so JobPilot AI can read and tailor my CV. DeepSeek may use that text to train its AI
          models unless an opt-out is in place.
        </span>
      </label>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
        <li>Your name, email address, phone number and address are removed before anything is sent.</li>
        <li>You can delete your CVs and your account at any time.</li>
        <li>
          Full details are in the{" "}
          <Link href="/privacy" className="font-semibold text-accent">
            privacy notice
          </Link>
          .
        </li>
      </ul>
      <button type="submit" disabled={pending} className={primaryButton}>
        {pending ? "Saving…" : "I agree, continue"}
      </button>
    </form>
  );
}

const MAX = 5 * 1024 * 1024;

export function UploadForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(uploadCv, {});
  const [local, setLocal] = useState("");
  const [picked, setPicked] = useState("");
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (local) e.preventDefault();
      }}
      className="mt-4 space-y-4"
    >
      {(local || state.error) && <Alert kind="error">{local || state.error}</Alert>}
      <label className="block text-sm font-semibold">
        Your CV file
        <input
          type="file"
          name="file"
          required
          accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
          onChange={(e) => {
            const f = e.target.files?.[0];
            setPicked(f ? f.name : "");
            setLocal(f && f.size > MAX ? "This file is larger than 5 MB. Choose a smaller file." : "");
          }}
          className="mt-1 block min-h-11 w-full rounded-[12px] border border-dashed border-line bg-surface p-3 text-sm file:mr-3 file:min-h-9 file:rounded-[10px] file:border-0 file:bg-accent-tint file:px-4 file:font-semibold file:text-accent"
        />
      </label>
      <p className="text-sm text-muted">PDF, Word (.docx) or text file, up to 5 MB. Scanned or photographed CVs cannot be read.</p>
      <button type="submit" disabled={pending} className={primaryButton}>
        {pending ? "Reading your CV…" : "Upload and read my CV"}
      </button>
      {pending && (
        <p role="status" className="text-sm text-muted">
          Reading {picked || "your CV"}. This can take up to a minute.
        </p>
      )}
    </form>
  );
}
