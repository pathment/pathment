'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Link as LinkIcon, ExternalLink, Copy, Check } from 'lucide-react';
import { toExternalHref } from '@/lib/utils/url';

/**
 * A resource link rendered as an external anchor + an inline "copy link" button.
 * Shared across the roadmap step viewer and the mentor/mentee task detail pages
 * so every resource link copies the same way.
 */
export function ResourceLink({ url, title, className }: { url: string; title?: string | null; className?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Link copied');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Could not copy the link');
    }
  };

  return (
    <li className={`flex items-center gap-2 group ${className || ''}`}>
      <a href={toExternalHref(url)} target="_blank" rel="noopener noreferrer" className="text-sm text-brand-600 hover:text-brand-800 hover:underline inline-flex items-center gap-1.5 min-w-0">
        <LinkIcon className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{title || url}</span><ExternalLink className="w-3 h-3 shrink-0" />
      </a>
      <button
        type="button"
        onClick={copy}
        title="Copy link"
        aria-label="Copy link"
        className="p-1 rounded-md text-slate-400 hover:text-brand-600 hover:bg-slate-100 dark:hover:bg-slate-700 shrink-0 transition-colors"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </li>
  );
}
