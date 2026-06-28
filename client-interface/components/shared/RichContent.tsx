'use client';

import { renderRichContent } from '@/lib/utils/richText';

/**
 * Renders stored rich-text (or legacy markdown/plain-text) content safely with
 * `prose` styling. Use anywhere a submission / feedback / description is shown,
 * so editor output and old plain-text both display formatted and consistent.
 */
export function RichContent({
  html,
  className = '',
  emptyText = 'No description provided.',
}: {
  html?: string | null;
  className?: string;
  emptyText?: string;
}) {
  const __html = renderRichContent(html);
  if (!__html) return <p className={`text-sm text-slate-400 ${className}`}>{emptyText}</p>;
  return (
    <div
      className={`prose prose-sm max-w-none dark:prose-invert prose-a:text-brand-600 prose-a:break-words ${className}`}
      dangerouslySetInnerHTML={{ __html }}
    />
  );
}
