'use client';

import { Filter, X } from 'lucide-react';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Filtering a mentee's work by what kind of work it is (interviews, quizzes,
 * projects …) and where it stands. Shared by the mentee profile and the clan
 * review so both read the same type the same way.
 *
 * The filters sit behind one icon: both screens are already busy, so the
 * chips only take a row when the mentor asks for them, and the icon carries a
 * count while something is narrowing the list so a filtered view never looks
 * like missing work.
 */

const TYPE_LABEL: Record<string, string> = {
  interview: 'Interviews',
  quiz: 'Quizzes',
  assessment: 'Assessments',
  project: 'Projects',
  assignment: 'Assignments',
  exercise: 'Exercises',
  practical: 'Practicals',
  reading: 'Reading',
  video: 'Videos',
  course: 'Courses',
  discussion: 'Discussions',
  group_discussion: 'Group discussions',
  talk: 'Talks',
  open_source: 'Open source',
  custom: 'Custom',
};

/** The order chips appear in: the kinds people filter for most come first. */
const TYPE_ORDER = Object.keys(TYPE_LABEL);

/** A task's kind, the way the server decides it (a per-task override wins). */
export function taskTypeOf(t: any): string {
  return t?.typeOverride || t?.roadmapTask?.type || t?.type || 'custom';
}

export function typeLabel(type: string, singular = false): string {
  const label = TYPE_LABEL[type] || type.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
  if (!singular) return label;
  if (type === 'quiz') return 'Quiz';
  if (type === 'reading') return 'Reading';
  if (type === 'open_source') return 'Open source';
  if (type === 'custom') return 'Custom';
  return label.endsWith('s') ? label.slice(0, -1) : label;
}

/** The kinds present in a list, with how many of each, in a stable order. */
export function typeCounts(types: string[]): { type: string; count: number }[] {
  const m = new Map<string, number>();
  for (const t of types) m.set(t, (m.get(t) || 0) + 1);
  const rank = (t: string) => { const i = TYPE_ORDER.indexOf(t); return i === -1 ? TYPE_ORDER.length : i; };
  return [...m.entries()].map(([type, count]) => ({ type, count }))
    .sort((a, b) => rank(a.type) - rank(b.type) || a.type.localeCompare(b.type));
}

/** The funnel button. `active` is how many filters are narrowing the list. */
export function FilterToggle({ open, active, onClick }: {
  open: boolean; active: number; onClick: () => void;
}) {
  return (
    <button
      type="button" onClick={onClick} aria-expanded={open}
      aria-label={active ? `Filters (${active} on)` : 'Filters'}
      title="Filter by type and status"
      className={`relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-colors ${
        open || active
          ? 'border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-500/40 dark:bg-brand-500/15 dark:text-brand-300'
          : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:text-brand-700 dark:border-slate-700 dark:text-slate-300'}`}
    >
      <Filter className="h-3.5 w-3.5" />
      {active > 0 && (
        <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-semibold text-white">
          {active}
        </span>
      )}
    </button>
  );
}

export type ChipOption<K extends string> = { key: K; label: string; count?: number | null };

/** One labelled row of single-choice chips. */
export function ChipRow<K extends string>({ label, options, value, onChange }: {
  label: string; options: ChipOption<K>[]; value: K; onChange: (k: K) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label={label}>
      <span className="w-12 shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {options.map((o) => {
        const on = value === o.key;
        return (
          <button
            key={o.key} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.key)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
              on ? 'border-brand-600 bg-brand-600 text-white'
                : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'}`}
          >
            {o.label}
            {o.count != null && o.count > 0 && (
              <span className={`rounded-full px-1.5 text-[10px] font-semibold tabular-nums ${
                on ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Type chips for whatever kinds are in the list ('all' plus each one present). */
export function TypeChips({ types, value, onChange }: {
  types: { type: string; count: number }[]; value: string; onChange: (t: string) => void;
}) {
  const total = types.reduce((n, t) => n + t.count, 0);
  return (
    <ChipRow
      label="Type" value={value} onChange={onChange}
      options={[{ key: 'all', label: 'All types', count: total }, ...types.map((t) => ({ key: t.type, label: typeLabel(t.type), count: t.count }))]}
    />
  );
}

/** "Showing interviews · completed  ×": what is on, when the panel is closed. */
export function ActiveFilters({ parts, onClear }: { parts: string[]; onClear: () => void }) {
  if (!parts.length) return null;
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span>Showing <span className="font-medium text-slate-700 dark:text-slate-200">{parts.join(' · ')}</span></span>
      <button type="button" onClick={onClear} title="Clear filters"
        className="inline-flex items-center gap-0.5 rounded px-1 text-brand-600 hover:bg-brand-50 hover:text-brand-700 dark:hover:bg-brand-500/10">
        <X className="h-3 w-3" />Clear
      </button>
    </div>
  );
}
