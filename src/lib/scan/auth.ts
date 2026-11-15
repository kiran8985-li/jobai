import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Checks the scheduler's secret. Accepts "Authorization: Bearer <secret>" or "x-cron-secret: <secret>".
 * With no CRON_SECRET configured the answer is always no: the scan route is never left open.
 */
export function isCronAuthorized(headers: Headers, secret: string | undefined): boolean {
  if (!secret || secret.length < 16) return false;
  const bearer = /^Bearer\s+(.+)$/i.exec(headers.get("authorization") ?? "")?.[1];
  const given = bearer ?? headers.get("x-cron-secret") ?? "";
  if (!given) return false;
  // Compare fixed-length digests so timing reveals nothing about the secret.
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}
