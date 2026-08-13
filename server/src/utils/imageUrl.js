/**
 * Cloudinary delivery transforms.
 *
 * Uploads are stored as the ORIGINAL file — a profile picture straight off a
 * phone camera is routinely 3-6 MB. Nothing was ever transformed on the way out,
 * so a screen listing fifty people pulled fifty full-resolution photos. On a
 * phone that is the difference between a screen that loads and one that doesn't.
 *
 * Cloudinary transforms are URL-based and applied on delivery, so this is purely
 * a string rewrite: no re-upload, no migration, and existing rows benefit
 * immediately. Results are cached on their CDN after the first request.
 *
 *   .../upload/v123/pathment/avatars/x.jpg
 *   .../upload/c_fill,g_face,h_128,w_128/f_auto,q_auto/v123/pathment/avatars/x.jpg
 *
 * `f_auto` serves WebP/AVIF to clients that accept it and `q_auto` picks a
 * quality the eye cannot distinguish — together usually 80-90% smaller before
 * any resizing is considered.
 */

// Only rewrite URLs we recognise. Anything else (a Gravatar, an external avatar,
// a data: URI, or a null) must pass through untouched.
const CLOUDINARY_UPLOAD = /^(https?:\/\/res\.cloudinary\.com\/[^/]+\/(?:image|video)\/upload)\/(.+)$/;

/** Transforms already present in a URL, so we never stack ours on top twice. */
const ALREADY_TRANSFORMED = /(^|\/)(f_auto|q_auto|c_fill|c_thumb|w_\d+|h_\d+)/;

/**
 * Apply a delivery transform to a Cloudinary URL.
 *
 * @param {string|null} url  the stored URL
 * @param {string} transform e.g. 'c_fill,g_face,h_128,w_128'
 * @returns {string|null} the transformed URL, or the input unchanged
 */
function transformed(url, transform) {
  if (!url || typeof url !== 'string') return url;

  const match = url.match(CLOUDINARY_UPLOAD);
  if (!match) return url;

  const [, base, rest] = match;
  if (ALREADY_TRANSFORMED.test(rest)) return url;

  return `${base}/${transform}/${rest}`;
}

/**
 * A face-cropped square for lists, tables and comment threads.
 * 128px covers a 2x retina 64px avatar, which is the largest we render in a list.
 */
const avatarThumb = (url, size = 128) =>
  transformed(url, `c_fill,g_face,h_${size},w_${size},f_auto,q_auto`);

/**
 * Full-size, but format- and quality-optimised. For profile headers, where the
 * image is displayed large and cropping would be wrong.
 */
const avatarFull = (url) => transformed(url, 'f_auto,q_auto');

module.exports = { transformed, avatarThumb, avatarFull };
