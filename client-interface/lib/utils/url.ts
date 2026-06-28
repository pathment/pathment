/**
 * Make a user-pasted URL safe to use as an external `href`. A value like
 * "example.com/x" with no scheme is otherwise treated as a RELATIVE path and
 * resolves against the current site (e.g. app.com/mentor/example.com/x) instead
 * of opening the real external page. Prepend https:// when there's no scheme.
 */
export function toExternalHref(raw: string): string {
  const u = String(raw || '').trim();
  if (!u) return '#';
  if (/^(https?:\/\/|mailto:|tel:)/i.test(u)) return u;
  return `https://${u}`;
}
