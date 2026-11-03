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

/**
 * A link that saves the file instead of opening it. Browsers ignore `download`
 * on another origin, so a Cloudinary file asks Cloudinary to send it as an
 * attachment. Signed URLs are left alone: changing them breaks the signature.
 */
export function downloadHref(url: string): string {
  if (!/res\.cloudinary\.com\//.test(url) || url.includes('/s--') || url.includes('fl_attachment')) return url;
  return url.replace('/upload/', '/upload/fl_attachment/');
}
