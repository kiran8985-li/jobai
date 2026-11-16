"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const TABS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users and invites" },
  { href: "/admin/sources", label: "Job sources" },
  { href: "/admin/applications", label: "Application log" },
  { href: "/admin/ai", label: "AI usage" },
  { href: "/admin/health", label: "System health" },
];

export function AdminNav() {
  const path = usePathname();
  return (
    <nav aria-label="Admin sections" className="-mx-1 mt-2 flex gap-2 overflow-x-auto px-1 pb-1">
      {TABS.map((t) => {
        const on = t.href === "/admin" ? path === "/admin" : path === t.href || path.startsWith(t.href + "/");
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className={`flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-bold ${on ? "border-accent bg-accent text-white" : "border-line bg-surface hover:border-accent"}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Copies an invite link. Falls back to a prompt where the clipboard is blocked. */
export function CopyButton({ text, label = "Copy link" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        } catch {
          window.prompt("Copy this link:", text);
        }
      }}
      className="flex min-h-11 shrink-0 items-center rounded-[12px] border border-line px-4 text-sm font-bold hover:border-accent"
    >
      {done ? "Copied" : label}
    </button>
  );
}
