import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Shows an ← back link */
  backHref?: string;
  backLabel?: string;
  /** Right-side slot — pass any buttons/links */
  actions?: React.ReactNode;
}

export function PageHeader({ title, subtitle, backHref, backLabel = 'Back', actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
      <div>
        {backHref && (
          <Link
            href={backHref}
            className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-900 text-sm mb-3 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            {backLabel}
          </Link>
        )}
        <h1 className="text-2xl font-bold text-slate-900 mb-1">{title}</h1>
        {subtitle && <p className="text-slate-500 text-sm">{subtitle}</p>}
      </div>
      {actions && (
        <div className="mt-4 sm:mt-0 flex items-center gap-3">{actions}</div>
      )}
    </div>
  );
}
