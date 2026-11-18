/** A UK number written as "+44 07…" has a stray 0 that forms reject; the number itself is unchanged. */
export function tidyPhone(phone: string | undefined): string {
  const p = (phone ?? "").trim();
  return p.replace(/^\+44\s*\(?0\)?\s*/, "+44 ");
}
