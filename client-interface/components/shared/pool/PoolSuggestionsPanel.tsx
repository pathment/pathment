'use client';

import { useMemo, useState } from 'react';
import { Sparkles, Loader2, ArrowRight, X, AlertTriangle, ChevronDown } from 'lucide-react';
import type { ClaimableClan, PoolSuggestions } from '@/lib/services/handover-pool-api';

/**
 * The system's plan for the whole pool, accepted in one click.
 *
 * Every open offer arrives with a proposed clan already chosen: the active clan
 * in their programme with the fewest active (non-paused) mentees, spread across
 * the batch so nobody's clan takes everyone. If the plan looks right the admin
 * presses one button. Any row can be pointed elsewhere or skipped first, which
 * is the only reason the list is shown at all.
 */
const PREVIEW_ROWS = 5;

export function PoolSuggestionsPanel({
  data,
  clans,
  busy,
  onApply,
}: {
  data: PoolSuggestions | undefined;
  clans: ClaimableClan[];
  busy: boolean;
  onApply: (placements: { entryId: string; toClanId: string }[]) => void;
}) {
  // Only the admin's overrides are stored; every other row uses the suggestion,
  // so a refreshed suggestion set needs no syncing. Placed entries drop out of
  // `data`, taking their overrides with them.
  const [plan, setPlan] = useState<Record<string, string>>({});
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(false);

  const rows = useMemo(() => (data?.suggestions ?? []).filter((s) => !skipped.has(s.entryId)), [data, skipped]);
  const clanById = useMemo(() => new Map(clans.map((c) => [c.id, c])), [clans]);
  const placements = rows.map((s) => ({ entryId: s.entryId, toClanId: plan[s.entryId] || s.toClanId }));
  const clanCount = new Set(placements.map((p) => p.toClanId)).size;
  const unplaced = data?.unplaced ?? [];

  if (!data || (!data.suggestions.length && !unplaced.length)) return null;
  const visible = expanded ? rows : rows.slice(0, PREVIEW_ROWS);

  return (
    <section className="rounded-3xl border border-brand-200 bg-brand-50/40 p-5 dark:border-brand-500/30 dark:bg-brand-950/20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Sparkles className="h-4 w-4 text-brand-600" aria-hidden />
            Suggested placements
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {rows.length
              ? <>{rows.length} mentee{rows.length === 1 ? '' : 's'} spread across {clanCount} clan{clanCount === 1 ? '' : 's'} with the fewest active mentees. Inactive clans are skipped.</>
              : 'Nothing left to place from the suggestions.'}
          </p>
        </div>
        {!!rows.length && (
          <button
            type="button"
            onClick={() => onApply(placements)}
            disabled={busy}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
            Place all {rows.length}
          </button>
        )}
      </div>

      {!!rows.length && (
        <ul className="mt-4 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {visible.map((s) => {
            const chosenId = plan[s.entryId] || s.toClanId;
            const chosen = clanById.get(chosenId);
            const programId = clanById.get(s.toClanId)?.programId;
            const options = clans.filter((c) => c.programId === programId && c.id !== s.fromClan?.id && c.available);
            return (
              <li key={s.entryId} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">{s.menteeName}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {chosenId === s.toClanId ? s.reason : 'Chosen by you'}
                  </span>
                </span>
                <span className="hidden max-w-36 truncate text-xs text-muted-foreground sm:inline">{s.fromClan?.name || 'No clan'}</span>
                <ArrowRight className="hidden h-3.5 w-3.5 shrink-0 text-muted-foreground sm:inline" aria-hidden />
                <select
                  value={chosenId}
                  onChange={(e) => setPlan((p) => ({ ...p, [s.entryId]: e.target.value }))}
                  disabled={busy}
                  aria-label={`Clan for ${s.menteeName}`}
                  className="w-48 rounded-xl border border-border bg-card px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  {options.map((c) => (
                    <option key={c.id} value={c.id} disabled={c.full}>
                      {c.name} · {c.activeMentees} active{c.inactive ? ' · inactive' : ''}{c.full ? ' · full' : ''}
                    </option>
                  ))}
                </select>
                {chosen?.inactive && (
                  <span className="text-[11px] font-medium text-amber-700 dark:text-amber-300">Inactive clan</span>
                )}
                <button
                  type="button"
                  onClick={() => setSkipped((prev) => new Set(prev).add(s.entryId))}
                  disabled={busy}
                  aria-label={`Skip ${s.menteeName}`}
                  title="Leave them in the pool for now"
                  className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {rows.length > PREVIEW_ROWS && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-800 dark:text-brand-300"
        >
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden />
          {expanded ? 'Show fewer' : `Show all ${rows.length}`}
        </button>
      )}

      {!!unplaced.length && (
        <div className="mt-3 flex gap-2 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/25 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            {unplaced.length} could not be suggested: {[...new Set(unplaced.map((u) => u.reason))].join(' · ')}.
            {' '}Place them by hand below, or mark a clan active.
          </span>
        </div>
      )}
    </section>
  );
}

export default PoolSuggestionsPanel;
