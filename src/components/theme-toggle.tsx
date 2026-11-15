"use client";
import { useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

function apply(theme: Theme) {
  const dark =
    theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

/** Cycles System → Light → Dark. Remembers the choice in this browser only. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    let saved: Theme = "system";
    try {
      saved = (localStorage.getItem("theme") as Theme) || "system";
    } catch {}
    setTheme(saved);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      let t: Theme = "system";
      try {
        t = (localStorage.getItem("theme") as Theme) || "system";
      } catch {}
      if (t === "system") apply("system");
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

  const label = theme === "system" ? "Theme: system" : theme === "light" ? "Theme: light" : "Theme: dark";
  return (
    <button
      type="button"
      onClick={next}
      aria-label={`${label}. Click to change.`}
      className={`min-h-11 rounded-[12px] px-3 text-sm font-semibold transition-colors ${className}`}
    >
      {label}
    </button>
  );
}

/** Inline script run before paint so the page never flashes the wrong theme. */
export const themeInitScript = `(function(){try{var t=localStorage.getItem('theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){if(matchMedia('(prefers-color-scheme: dark)').matches)document.documentElement.classList.add('dark');}})();`;
