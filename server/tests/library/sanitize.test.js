'use strict';

/**
 * Library rich-text sanitization (stored-XSS guard).
 *
 * Library articles are authored as HTML and later rendered with
 * dangerouslySetInnerHTML, so sanitizeRichText() must strip anything that can execute
 * while preserving the formatting the TipTap editor legitimately produces.
 */

const { sanitizeRichText } = require('../../src/utils/sanitizeHtml');

describe('sanitizeRichText — strips XSS vectors', () => {
  it('removes <script> tags and their contents', () => {
    const out = sanitizeRichText('<p>Hello</p><script>alert(document.cookie)</script>');
    expect(out).toBe('<p>Hello</p>');
    expect(out).not.toMatch(/script/i);
    expect(out).not.toMatch(/alert/);
  });

  it('strips inline event handlers (onerror, onclick, …)', () => {
    const out = sanitizeRichText('<img src=x onerror="fetch(\'//evil\')">');
    expect(out).not.toMatch(/onerror/i);
    expect(out).not.toMatch(/<img/i); // img isn't on the allowlist either
  });

  it('drops javascript: URLs on links', () => {
    const out = sanitizeRichText('<a href="javascript:alert(1)">click</a>');
    expect(out).not.toMatch(/javascript:/i);
    expect(out).toContain('click'); // text survives, dangerous href gone
  });

  it('drops data: URLs on links', () => {
    const out = sanitizeRichText('<a href="data:text/html,<script>alert(1)</script>">x</a>');
    expect(out).not.toMatch(/data:/i);
  });

  it('removes <style> blocks entirely', () => {
    const out = sanitizeRichText('<style>body{display:none}</style><p>ok</p>');
    expect(out).toBe('<p>ok</p>');
  });

  it('strips iframes and other embedding tags', () => {
    const out = sanitizeRichText('<iframe src="//evil"></iframe><p>safe</p>');
    expect(out).not.toMatch(/iframe/i);
    expect(out).toContain('<p>safe</p>');
  });
});

describe('sanitizeRichText — preserves legitimate editor formatting', () => {
  it('keeps headings, bold, italic, lists, code, blockquote', () => {
    const html = [
      '<h2>Title</h2>',
      '<p><strong>bold</strong> and <em>italic</em></p>',
      '<ul><li>one</li><li>two</li></ul>',
      '<ol><li>first</li></ol>',
      '<pre><code>const x = 1;</code></pre>',
      '<blockquote>quote</blockquote>',
    ].join('');
    const out = sanitizeRichText(html);
    expect(out).toContain('<h2>Title</h2>');
    expect(out).toContain('<strong>bold</strong>');
    expect(out).toContain('<em>italic</em>');
    expect(out).toContain('<li>one</li>');
    expect(out).toContain('<ol><li>first</li></ol>');
    expect(out).toContain('<code>const x = 1;</code>');
    expect(out).toContain('<blockquote>quote</blockquote>');
  });

  it('keeps safe http/https/mailto links and hardens them with rel/target', () => {
    const out = sanitizeRichText('<a href="https://example.com">link</a>');
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('link');
    expect(out).toMatch(/rel="noopener noreferrer nofollow"/);
    expect(out).toMatch(/target="_blank"/);
  });
});

describe('sanitizeRichText — edge cases', () => {
  it('returns null for null/undefined input', () => {
    expect(sanitizeRichText(null)).toBeNull();
    expect(sanitizeRichText(undefined)).toBeNull();
  });

  it('is idempotent — sanitizing already-clean HTML is a no-op', () => {
    const clean = sanitizeRichText('<p><strong>hi</strong></p><script>x</script>');
    expect(sanitizeRichText(clean)).toBe(clean);
  });
});
