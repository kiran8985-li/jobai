// Compares .env.local with .env.example and fails with a clear message.
// Run: npm run check-env   (also runs automatically before `npm run dev` and `npm run build`)
import { existsSync, readFileSync } from "node:fs";

function keys(file) {
  return new Set(
    readFileSync(file, "utf8")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => l.slice(0, l.indexOf("=")).trim()),
  );
}

if (!existsSync(".env.example")) {
  console.error("check-env: .env.example is missing. It is the template for .env.local.");
  process.exit(1);
}
const example = keys(".env.example");

if (!existsSync(".env.local")) {
  // Hosted builds (e.g. Vercel) set real environment variables instead of a file.
  if (process.env.CI || process.env.VERCEL) process.exit(0);
  console.error(
    "check-env: .env.local not found.\n  Fix: copy .env.example to .env.local and fill in what you have.\n" +
      "  Empty values are fine; the demo job source and offline fallbacks need no keys.",
  );
  process.exit(1);
}
const local = keys(".env.local");

const missing = [...example].filter((k) => !local.has(k));
const unknown = [...local].filter((k) => !example.has(k));

if (unknown.length) {
  console.warn(`check-env: .env.local has settings not in .env.example (typo?): ${unknown.join(", ")}`);
}
if (missing.length) {
  console.error(
    `check-env: .env.local is missing these settings from .env.example:\n  ${missing.join("\n  ")}\n` +
      "  Fix: add each line to .env.local (leave the value empty if you do not have it yet).",
  );
  process.exit(1);
}
console.log("check-env: .env.local matches .env.example");
