"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ThemeToggle } from "./theme-toggle";

export type NavItem = { href: string; label: string };

export const seekerNav: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/jobs", label: "Jobs" },
  { href: "/applications", label: "Applications" },
  { href: "/cvs", label: "My CVs" },
  { href: "/auto-apply", label: "Auto-apply" },
  { href: "/notifications", label: "Notifications" },
  { href: "/account", label: "Account" },
];

/**
 * Dark left sidebar on desktop, top bar with a slide-out menu on phones.
 * `isAdmin` must come from a server-side check; the Admin link is hidden otherwise.
 */
export function AppNav({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const items = isAdmin ? [...seekerNav, { href: "/admin", label: "Admin" }] : seekerNav;

  const links = (
    <ul className="flex flex-col gap-1">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={() => setOpen(false)}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-11 items-center rounded-[12px] px-4 text-sm font-semibold transition-colors ${
                active ? "bg-[#6C4DFF] text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
              }`}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col bg-[#14122B] p-5 lg:flex">
        <Brand />
        <nav aria-label="Main" className="mt-8 flex-1">
          {links}
        </nav>
        <ThemeToggle className="text-white/70 hover:bg-white/10 hover:text-white" />
      </aside>

      {/* Phone top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between bg-[#14122B] px-4 py-2 lg:hidden">
        <Brand />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="mobile-menu"
          className="min-h-11 rounded-[12px] px-4 text-sm font-semibold text-white hover:bg-white/10"
        >
          {open ? "Close" : "Menu"}
        </button>
      </header>

      {/* Phone slide-out menu */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
          />
          <nav
            id="mobile-menu"
            aria-label="Main"
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-[#14122B] p-5"
          >
            <Brand />
            <div className="mt-8 flex-1">{links}</div>
            <ThemeToggle className="text-white/70 hover:bg-white/10 hover:text-white" />
          </nav>
        </div>
      )}
    </>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex min-h-11 items-center gap-2 text-lg font-extrabold text-white">
      <span aria-hidden className="grid h-8 w-8 place-items-center rounded-[10px] bg-[#6C4DFF] text-sm">
        JP
      </span>
      JobPilot AI
    </Link>
  );
}
