'use client';

import Link from 'next/link';
import { workspacePath } from '@/lib/services/workspace-scope';
import type { ReactNode } from 'react';

/**
 * The card used for workspaces you open from a grid — an intake, a selection
 * pool. Same shape as the programme card: a thin accent bar, the status, the
 * name and a line about it, a row of facts, and a footer with when it runs and
 * what to do next.
 *
 * The whole card opens `href` (a stretched link behind the content), and any
 * buttons in `actions` sit above that link, so they still work on their own.
 * A card that holds links of its own (`children`, e.g. a scenario's groups)
 * leaves `href` out and gives its main button an action with `onPrimary`.
 */
export interface EntityCardStat {
  label: string;
  value: ReactNode;
  /** Highlight a value that needs attention, e.g. applications waiting. */
  tone?: 'default' | 'attention' | 'good';
}

export function EntityCard({
  href,
  status,
  icon,
  title,
  description,
  tags = [],
  stats,
  children,
  footer,
  actions,
  primaryLabel = 'Open',
  onPrimary,
}: {
  /** Where the card opens. Leave out for a card whose content holds its own links. */
  href?: string;
  status: { label: string; cls: string };
  /** A photo or avatar for the thing, shown beside its name. */
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  tags?: string[];
  stats: EntityCardStat[];
  /** Muted text on the left of the footer — usually the dates. */
  footer?: ReactNode;
  /** Shown under the facts, above the footer (a list of what the item holds). */
  children?: ReactNode;
  /** Secondary buttons beside the primary one. */
  actions?: ReactNode;
  primaryLabel?: ReactNode;
  /** The primary button runs this instead of opening `href`. */
  onPrimary?: () => void;
}) {
  const primaryClass = 'inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700';
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-card transition-all hover:border-brand-300 hover:shadow-md">
      <div className="h-2 bg-gradient-to-r from-brand-600 via-brand-400 to-brand-200" aria-hidden="true" />
      <div className="flex flex-1 flex-col p-6">
        <span className={`inline-flex w-fit items-center rounded-full border px-3 py-1 text-xs font-medium ${status.cls}`}>{status.label}</span>

        <div className="mt-4 flex min-w-0 items-center gap-2.5">
          {icon}
          <h3 className="min-w-0 text-lg font-semibold text-slate-900">
            {/* Stretched link: the whole card opens the item. */}
            {href ? (
              <Link href={workspacePath(href)} className="after:absolute after:inset-0 after:content-[''] focus:outline-none focus-visible:underline">
                {title}
              </Link>
            ) : title}
          </h3>
        </div>
        {description && <p className="mt-1.5 line-clamp-2 text-sm text-slate-500">{description}</p>}

        {tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {tags.map((t) => (
              <span key={t} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">{t}</span>
            ))}
          </div>
        )}

        <dl className={`mt-5 grid gap-3 border-y border-border py-4 ${stats.length >= 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}>
          {stats.map((s) => (
            <div key={s.label} className="min-w-0">
              <dt className="truncate text-xs text-slate-500">{s.label}</dt>
              <dd className={`mt-1 truncate text-sm font-semibold tabular-nums ${
                s.tone === 'attention' ? 'text-amber-700' : s.tone === 'good' ? 'text-emerald-700' : 'text-slate-900'
              }`}>{s.value}</dd>
            </div>
          ))}
        </dl>

        {children && <div className="relative z-10 mt-4">{children}</div>}

        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-4">
          <span className="min-w-0 truncate text-sm text-slate-500">{footer}</span>
          {/* Above the stretched link, so these stay clickable. */}
          <div className="relative z-10 flex items-center gap-2">
            {actions}
            {onPrimary ? (
              <button type="button" onClick={onPrimary} className={primaryClass}>{primaryLabel}</button>
            ) : href ? (
              <Link href={workspacePath(href)} className={primaryClass}>{primaryLabel}</Link>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/** A secondary footer button in the card's style. */
export const entityCardSecondaryBtn =
  'inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-card px-3.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-brand-300 hover:text-brand-700';

/** "Aug 4 – Nov 21, 2026", "From Aug 4, 2026", or null when there are no dates. */
export function formatDateRange(start?: string | null, end?: string | null): string | null {
  const s = start ? new Date(start) : null;
  const e = end ? new Date(end) : null;
  const ok = (d: Date | null) => d && !Number.isNaN(d.getTime());
  const full = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  if (ok(s) && ok(e)) {
    const sameYear = s!.getFullYear() === e!.getFullYear();
    return `${sameYear ? s!.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : full(s!)} – ${full(e!)}`;
  }
  if (ok(s)) return `From ${full(s!)}`;
  if (ok(e)) return `Until ${full(e!)}`;
  return null;
}
