import { looksLikeHtml } from './html';

/**
 * Turn stored submission/feedback content into safe display HTML.
 *  - Rich-editor output (already HTML) is sanitized (strip scripts / event
 *    handlers / javascript: URIs) so user content can't run code in a reviewer's
 *    browser.
 *  - Legacy plain-text / markdown is converted to formatted HTML so old
 *    submissions (e.g. "**Counter App**") render properly instead of showing raw
 *    asterisks.
 */

const DANGEROUS_TAGS = /<\/?(script|style|iframe|object|embed|link|meta|form|input|button|svg|math)[^>]*>/gi;

export function sanitizeHtml(html: string): string {
  return String(html)
    .replace(DANGEROUS_TAGS, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')             // on* event handlers
    .replace(/(href|src)\s*=\s*("|')\s*javascript:[^"']*\2/gi, '$1=$2#$2'); // javascript: URIs
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Inline markdown: bold, italic (underscore only — '*' is too ambiguous when
 *  people use it as a bullet), inline code, links and bare URLs. */
function inline(s: string): string {
  return s
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^_])_([^_\n]+)_(?!_)/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
}

export function mdLiteToHtml(text: string): string {
  const lines = esc(text).replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;
  const ul = (l: string) => /^\s*[-*+]\s+/.test(l);
  const ol = (l: string) => /^\s*\d+\.\s+/.test(l);

  while (i < lines.length) {
    if (!lines[i].trim()) { i += 1; continue; }

    const h = lines[i].match(/^(#{1,4})\s+(.*)$/);
    if (h) { const n = h[1].length; out.push(`<h${n}>${inline(h[2])}</h${n}>`); i += 1; continue; }

    if (ul(lines[i]) || ol(lines[i])) {
      const ordered = ol(lines[i]);
      const items: string[] = [];
      while (i < lines.length && (ul(lines[i]) || ol(lines[i]))) {
        items.push(`<li>${inline(lines[i].replace(/^\s*([-*+]|\d+\.)\s+/, ''))}</li>`);
        i += 1;
      }
      out.push(`<${ordered ? 'ol' : 'ul'}>${items.join('')}</${ordered ? 'ol' : 'ul'}>`);
      continue;
    }

    // paragraph: gather consecutive plain lines (single newline → <br>)
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !ul(lines[i]) && !ol(lines[i]) && !/^#{1,4}\s/.test(lines[i])) {
      para.push(inline(lines[i]));
      i += 1;
    }
    out.push(`<p>${para.join('<br/>')}</p>`);
  }
  return out.join('');
}

export function renderRichContent(raw?: string | null): string {
  const s = String(raw || '').trim();
  if (!s) return '';
  return looksLikeHtml(s) ? sanitizeHtml(s) : mdLiteToHtml(s);
}
