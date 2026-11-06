'use client';

import { Loader2, type LucideIcon } from 'lucide-react';
import type { PoolBucket, PoolStatus } from '@/lib/services/pool-api';

/** Shared look for the Selection pools screens (same tokens as the rest of admin). */
export const field = 'w-full px-3 py-2 border border-border rounded-xl bg-card text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-muted disabled:text-muted-foreground';
export const label = 'block text-sm font-medium text-slate-700 mb-1';
export const primaryBtn = 'inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:bg-brand-400 disabled:cursor-not-allowed transition-colors';
export const secondaryBtn = 'inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-slate-700 hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors';
export const iconBtn = 'rounded-lg p-1.5 text-slate-400 hover:bg-muted hover:text-slate-700 transition-colors';
export const card = 'rounded-2xl border border-border bg-card';
/** A titled block, as on the admin dashboard. */
export const panel = 'rounded-3xl border border-border bg-card overflow-hidden';

/** Title row of a panel: optional icon chip, title, subtitle and actions. */
export function PanelHeader({ icon: Icon, title, subtitle, actions, count }: {
  icon?: LucideIcon; title: string; subtitle?: React.ReactNode; actions?: React.ReactNode; count?: number;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 p-5 sm:px-6">
      <div className="flex min-w-0 items-start gap-3">
        {Icon && (
          <span className="shrink-0 rounded-xl bg-brand-50 p-2 text-brand-600">
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base text-slate-900">
            {title}
            {count !== undefined && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground tabular-nums">{count}</span>}
          </h2>
          {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** The admin empty state: an icon, a line saying what is missing, and what to do. */
export function EmptyState({ icon: Icon, title, text, action }: { icon: LucideIcon; title: string; text?: string; action?: React.ReactNode }) {
  return (
    <div className="px-6 py-12 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-slate-400">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>
      <p className="mt-3 font-medium text-slate-800">{title}</p>
      {text && <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{text}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Spinner() {
  return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div>;
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{children}</p>;
}

/** Initials for a display name such as "Bilal Ahmed" (falls back to the email). */
export const nameParts = (name?: string | null, email?: string | null) => {
  const parts = (name || email || '').trim().split(/\s+/);
  return { firstName: parts[0] || '', lastName: parts.length > 1 ? parts[parts.length - 1] : '' };
};

export const POOL_STATUS: Record<PoolStatus, { label: string; cls: string }> = {
  draft: { label: 'Draft', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  open: { label: 'Open', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  qualifying: { label: 'Qualifying', cls: 'bg-brand-50 text-brand-700 border-brand-200' },
  reviewing: { label: 'Reviewing', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  placing: { label: 'Placing', cls: 'bg-violet-50 text-violet-700 border-violet-200' },
  closed: { label: 'Closed', cls: 'bg-slate-100 text-slate-500 border-slate-200' },
};

export const BUCKETS: { key: PoolBucket; label: string; cls: string; dot: string }[] = [
  { key: 'invite_pending', label: 'Invite pending', cls: 'bg-slate-100 text-slate-600', dot: 'bg-slate-300' },
  { key: 'not_started', label: 'Not started', cls: 'bg-slate-100 text-slate-700', dot: 'bg-slate-400' },
  { key: 'in_progress', label: 'In progress', cls: 'bg-brand-50 text-brand-700', dot: 'bg-brand-500' },
  { key: 'needs_review', label: 'Needs review', cls: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
  { key: 'changes_requested', label: 'Changes requested', cls: 'bg-rose-50 text-rose-700', dot: 'bg-rose-500' },
  { key: 'completed', label: 'Completed', cls: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
  { key: 'stalled', label: 'Stalled', cls: 'bg-orange-50 text-orange-700', dot: 'bg-orange-500' },
  { key: 'withdrawn', label: 'Withdrawn / disqualified', cls: 'bg-slate-100 text-slate-500', dot: 'bg-slate-200' },
];
export const bucketMeta = (key: PoolBucket) => BUCKETS.find((b) => b.key === key) || BUCKETS[1];

export const DECISION: Record<string, { label: string; cls: string }> = {
  selected: { label: 'Selected', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  waitlisted: { label: 'Waitlisted', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  not_selected: { label: 'Not selected', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  withdrawn: { label: 'Withdrawn', cls: 'bg-slate-100 text-slate-500 border-slate-200' },
  disqualified: { label: 'Disqualified', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
};

export const WORK_STATUS: Record<string, { label: string; dot: string }> = {
  assigned: { label: 'To do', dot: 'bg-slate-300' },
  not_started: { label: 'To do', dot: 'bg-slate-300' },
  in_progress: { label: 'In progress', dot: 'bg-brand-500' },
  submitted: { label: 'Needs review', dot: 'bg-amber-500' },
  revision_needed: { label: 'Changes requested', dot: 'bg-rose-500' },
  completed: { label: 'Approved', dot: 'bg-emerald-500' },
};

export const SOURCE_LABEL: Record<string, string> = {
  quiz: 'Quiz score',
  task_review: 'Reviewed task',
  interview_review: 'Reviewed interview',
  manual: 'Entered by hand',
};

// ── Points ───────────────────────────────────────────────────────────────────
// A piece of work is worth points, set from its difficulty when it is added.
// These four steps are the whole scale; there are no weights or percentages.

export const DIFFICULTIES = ['easy', 'medium', 'hard', 'expert'] as const;
export type Difficulty = typeof DIFFICULTIES[number];

/** Mirrors the server's default curve (config/points.js). */
export const DIFFICULTY_POINTS_FALLBACK: Record<Difficulty, number> = {
  easy: 5, medium: 10, hard: 20, expert: 40,
};

export const DIFFICULTY_BLURB: Record<Difficulty, string> = {
  easy: 'A warm-up, or something read and summarised.',
  medium: 'The ordinary piece of work in a round.',
  hard: 'A project that takes real time.',
  expert: 'The hardest thing in the round.',
};

/** "12 pts" — plural-safe, and whole numbers stay whole. */
export const pts = (n: number) => `${Math.round(n * 100) / 100} pt${Math.abs(n) === 1 ? '' : 's'}`;

/** How one piece of work scored for one candidate. */
export const WORK_SCORE: Record<string, { label: string; cls: string }> = {
  scored: { label: 'Earned', cls: 'text-emerald-700' },
  // Course work only: part-finished on Edorax, already worth part of its points.
  in_progress: { label: 'In progress', cls: 'text-blue-700' },
  pending_review: { label: 'Waiting on review', cls: 'text-amber-700' },
  changes_requested: { label: 'Changes requested', cls: 'text-rose-700' },
  missing: { label: 'Not handed in', cls: 'text-slate-500' },
  not_assigned: { label: 'Never given', cls: 'text-slate-400' },
  // Aimed at another level: not owed, and not counted against them.
  not_targeted: { label: 'Not their level', cls: 'text-slate-400' },
  no_work: { label: 'No work', cls: 'text-slate-400' },
};

export function Chip({ cls, children }: { cls: string; children: React.ReactNode }) {
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${cls}`}>{children}</span>;
}

export const fmtDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

/** <input type="datetime-local"> wants local time without a zone. */
export const toLocalInput = (value?: string | null) => {
  if (!value) return '';
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : null);
