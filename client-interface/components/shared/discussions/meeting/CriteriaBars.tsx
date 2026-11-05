import { DISCUSSION_CRITERIA, type CriteriaScores } from '@/lib/services/group-discussions-api';

/**
 * The five criteria as read-only bars, 0-100, with the middle marked: the
 * sliders start there, so the mark shows which way the mentor moved each one.
 */
export function CriteriaBars({ criteria, compact = false }: { criteria: CriteriaScores; compact?: boolean }) {
  return (
    <ul className={compact ? 'space-y-1.5' : 'space-y-2.5'}>
      {DISCUSSION_CRITERIA.map(({ key, label, hint }) => {
        const value = Math.round(criteria[key] ?? 0);
        return (
          <li key={key}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
              <span className="font-medium text-slate-700 dark:text-slate-300" title={hint}>{label}</span>
              <span className="tabular-nums text-muted-foreground">{value}%</span>
            </div>
            <div
              className={`relative overflow-hidden rounded-full bg-muted ${compact ? 'h-1.5' : 'h-2'}`}
              role="img"
              aria-label={`${label}: ${value} out of 100`}
            >
              <div className="h-full rounded-full bg-brand-600" style={{ width: `${value}%` }} />
              <span className="absolute inset-y-0 left-1/2 w-px bg-slate-400/70 dark:bg-slate-500" aria-hidden />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
