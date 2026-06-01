'use client';

import { cn } from '@/lib/utils/cn';

interface RichTextViewerProps {
  content: string;
  className?: string;
}

function getRichTextClass(tagName: string) {
  switch (tagName) {
    case 'h1':
      return 'rtv-heading rtv-heading-1';
    case 'h2':
      return 'rtv-heading rtv-heading-2';
    case 'h3':
      return 'rtv-heading rtv-heading-3';
    case 'h4':
      return 'rtv-heading rtv-heading-4';
    case 'h5':
      return 'rtv-heading rtv-heading-5';
    case 'h6':
      return 'rtv-heading rtv-heading-6';
    case 'p':
      return 'rtv-paragraph';
    case 'ul':
      return 'rtv-list rtv-list-disc';
    case 'ol':
      return 'rtv-list rtv-list-decimal';
    case 'li':
      return 'rtv-list-item';
    case 'a':
      return 'rtv-link';
    case 'strong':
    case 'b':
      return 'rtv-strong';
    case 'em':
    case 'i':
      return 'rtv-em';
    case 'code':
      return 'rtv-inline-code';
    case 'pre':
      return 'rtv-code-block';
    case 'blockquote':
      return 'rtv-blockquote';
    case 'img':
      return 'rtv-image';
    default:
      return '';
  }
}

function enhanceRichTextContent(content: string) {
  if (typeof window === 'undefined' || !content) {
    return content;
  }

  try {
    const decoder = document.createElement('div');
    decoder.innerHTML = content;
    const decodedContent = decoder.innerHTML;

    const parser = new DOMParser();
    const parsedDocument = parser.parseFromString(`<div>${decodedContent}</div>`, 'text/html');
    const container = parsedDocument.body.firstElementChild;

    if (!container) {
      return decodedContent;
    }

    container.querySelectorAll('*').forEach((element) => {
      const tagName = element.tagName.toLowerCase();
      const tagClass = getRichTextClass(tagName);

      if (tagClass) {
        element.className = cn(element.className, tagClass);
      }

      if (tagName === 'a' && !element.hasAttribute('target')) {
        element.setAttribute('target', '_blank');
        element.setAttribute('rel', 'noopener noreferrer');
      }
    });

    return container.innerHTML;
  } catch {
    return content;
  }
}

export function RichTextViewer({ content, className }: RichTextViewerProps) {
  if (!content) {
    return null;
  }

  return (
    <div
      className={cn('rich-text-viewer', className)}
      dangerouslySetInnerHTML={{ __html: enhanceRichTextContent(content) }}
    />
  );
}
