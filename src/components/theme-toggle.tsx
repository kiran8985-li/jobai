"use client";
import { useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

function read(): Theme {
  try {
    const v = localStorage.getItem("theme");
    if (v === "light" || v === "dark") return v;
  } catch {}
  return "system";
}

function apply(theme: Theme) {
  const dark =
    theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

/** Cycles System → Light → Dark. Remembers the choice in this browser only. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    setTheme(read());
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (read() === "system") apply("system");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  function next() {
    const order: Theme[] = ["system", "light", "dark"];
    const t = order[(order.indexOf(theme) + 1) % order.length];
    setTheme(t);
    try {
      localStorage.setItem("theme", t);
    } catch {}
    apply(t);
  }

  const name = theme === "system" ? "System" : theme === "light" ? "Light" : "Dark";
  const label = `Theme: ${name}`;
  return (
    <button
      type="button"
      onClick={next}
      aria-label={`${label}. Click to change.`}
      className={`min-h-11 rounded-[12px] whitespace-nowrap px-3 text-sm font-semibold transition-colors ${className}`}
    >
      <span className="hidden sm:inline">Theme: </span>
      {name}
    </button>
  );
}
