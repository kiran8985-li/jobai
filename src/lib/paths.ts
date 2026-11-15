/** Route rules shared by the middleware and tests. No secrets, no I/O. */

const PROTECTED = [
  "/dashboard",
  "/onboarding",
  "/jobs",
  "/applications",
  "/cvs",
  "/profiles",
  "/auto-apply",
  "/notifications",
  "/account",
  "/admin",
  "/api/admin",
  "/api/cvs",
];

function under(pathname: string, base: string) {
  return pathname === base || pathname.startsWith(base + "/");
}

/** Pages and APIs that need a signed-in, verified, active user. */
export function isProtectedPath(pathname: string): boolean {
  return PROTECTED.some((p) => under(pathname, p));
}

/** Pages and APIs that also need is_admin. */
export function isAdminPath(pathname: string): boolean {
  return under(pathname, "/admin") || under(pathname, "/api/admin");
}

/**
 * Where to send the user after login. Only same-site paths are allowed, so a crafted
 * link such as ?next=https://evil.example cannot redirect a user off the site.
 */
export function safeNext(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  if (/[\u0000-\u001f]/.test(next)) return fallback;
  return next;
}
