const sanitize = require('sanitize-html');

/**
 * Sanitize Library rich-text HTML.
 *
 * Library articles are authored with the TipTap editor
 * (client-interface/components/shared/RichTextEditor.tsx: StarterKit + Link), so the
 * only legitimate output is a small set of formatting tags. Everything else — most
 * importantly <script>, inline event handlers (onerror=…), and javascript:/data:
 * URLs — is stripped. Without this, authored content was stored and rendered raw via
 * dangerouslySetInnerHTML, which is a stored-XSS vector (a curator could run script in
 * every reader's browser).
 *
 * The allowlist mirrors the editor's StarterKit nodes/marks plus links:
 *   p, br, hr, h1–h6, strong/b, em/i, s/strike, u, code, pre, blockquote, ul, ol, li, a
 */
const ALLOWED_TAGS = [
  'p', 'br', 'hr',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'b', 'em', 'i', 's', 'strike', 'u',
  'code', 'pre', 'blockquote',
  'ul', 'ol', 'li',
  'a'
];

const OPTIONS = {
  allowedTags: ALLOWED_TAGS,
  // Links keep href/title (+ the editor's styling class); rel/target are forced safe below.
  allowedAttributes: {
    a: ['href', 'title', 'class', 'rel', 'target']
  },
  // Only safe link schemes — drops javascript:, data:, vbscript:, etc.
  allowedSchemes: ['http', 'https', 'mailto'],
  allowProtocolRelative: false,
  // Harden every surviving link against tabnabbing.
  transformTags: {
    a: sanitize.simpleTransform('a', { rel: 'noopener noreferrer nofollow', target: '_blank' })
  },
  // Drop the contents of disallowed structural/script tags entirely (don't leak text).
  nonTextTags: ['style', 'script', 'textarea', 'option', 'noscript']
};

/**
 * @param {string|null|undefined} html  Raw HTML from the editor.
 * @returns {string|null}  Sanitized HTML, or null when input is empty/null.
 */
function sanitizeRichText(html) {
  if (html == null) return null;
  const cleaned = sanitize(String(html), OPTIONS);
  return cleaned;
}

module.exports = { sanitizeRichText, ALLOWED_TAGS };
