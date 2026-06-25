'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Gauge, Loader2, TrendingUp, TrendingDown, Minus, ArrowUpRight, Search } from 'lucide-react';
import { useMentorCohort, type CohortMentee, type CohortMomentum } from '@/lib/hooks/mentor';
import { SelectMenu } from '@/components/shared/SelectMenu';
import { usePagination } from '@/lib/hooks/shared/usePagination';
import { TablePagination } from '@/components/shared/TablePagination';

// Blended progress score from real cohort stats (prototype weighting).
function scoreOf(m: CohortMentee): number {
  const base = m.absoluteProgress * 0.45 + m.relativeProgress * 0.35 + m.onTimeRate * 0.2;
  const nudge = m.momentum === 'up' ? 3 : m.momentum === 'down' ? -3 : 0;
  return Math.max(0, Math.min(100, Math.round(base + nudge)));
}

function MomentumIcon({ momentum }: { momentum: CohortMomentum }) {
  if (momentum === 'up') return <TrendingUp className="w-4 h-4 text-emerald-500" />;
  if (momentum === 'down') return <TrendingDown className="w-4 h-4 text-red-500" />;
  return <Minus className="w-4 h-4 text-slate-400" />;
}

function scoreColor(s: number): string {
  if (s >= 75) return 'bg-emerald-500';
  if (s >= 50) return 'bg-brand-500';
  if (s >= 30) return 'bg-amber-500';
  return 'bg-red-500';
}

// Score band buckets (match the bar colors).
function bandOf(s: number): 'strong' | 'ontrack' | 'watch' | 'risk' {
  if (s >= 75) return 'strong';
  if (s >= 50) return 'ontrack';
  if (s >= 30) return 'watch';
  return 'risk';
}

const MOMENTUM_OPTS = [
  { value: 'all', label: 'All momentum' },
  { value: 'up', label: 'Rising' },
  { value: 'flat', label: 'Steady' },
  { value: 'down', label: 'Slipping' },
];
const BAND_OPTS = [
  { value: 'all', label: 'All scores' },
  { value: 'strong', label: 'Strong (75+)' },
  { value: 'ontrack', label: 'On track (50–74)' },
  { value: 'watch', label: 'Watch (30–49)' },
  { value: 'risk', label: 'At risk (<30)' },
];

export default function MentorScores() {
  const router = useRouter();
  const { cohort, loading, error, refetch } = useMentorCohort();

  const [search, setSearch] = useState('');
  const [momentum, setMomentum] = useState('all');
  const [band, setBand] = useState('all');
  const pagination = usePagination({ initialPage: 1, initialLimit: 15 });

  // Full ranked list. Rank (position) is computed from the WHOLE cohort, so a
  // mentee's "#4" stays #4 even when the list is filtered or paged.
  const ranked = useMemo(
    () => cohort.map((m) => ({ m, score: scoreOf(m) })).sort((a, b) => b.score - a.score),
    [cohort]
  );
  const rankById = useMemo(() => {
    const map = new Map<string, number>();
    ranked.forEach((r, i) => map.set(r.m.id, i + 1));
    return map;
  }, [ranked]);
  const avg = ranked.length ? Math.round(ranked.reduce((n, r) => n + r.score, 0) / ranked.length) : 0;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ranked.filter(({ m, score }) =>
      (!q || m.name.toLowerCase().includes(q)) &&
      (momentum === 'all' || m.momentum === momentum) &&
      (band === 'all' || bandOf(score) === band)
    );
  }, [ranked, search, momentum, band]);

  // Page the filtered list (client-side; the cohort is already loaded).
  useEffect(() => { pagination.setTotal(filtered.length); }, [filtered.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { pagination.reset(); }, [search, momentum, band]); // eslint-disable-line react-hooks/exhaustive-deps
  const pageItems = filtered.slice((pagination.page - 1) * pagination.limit, pagination.page * pagination.limit);

  const filtersActive = search.trim() !== '' || momentum !== 'all' || band !== 'all';
  const clearFilters = () => { setSearch(''); setMomentum('all'); setBand('all'); };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-slate-900 mb-2">Progress scores</h1>
        <p className="text-slate-600">One blended score per mentee - output, fairness, and reliability together.</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-600" /></div>
      ) : error ? (
        <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center">
          <p className="text-slate-600 mb-3">{error}</p>
          <button onClick={refetch} className="text-brand-600 hover:text-brand-700 text-sm font-medium">Try again</button>
        </div>
      ) : ranked.length === 0 ? (
        <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center">
          <Gauge className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600">No mentees to score yet.</p>
        </div>
      ) : (
        <>
          <div className="bg-card rounded-2xl border border-slate-200 px-5 py-4 flex items-center gap-3">
            <Gauge className="w-5 h-5 text-brand-500" />
            <span className="text-sm text-slate-600">Cohort average</span>
            <span className="ml-auto text-lg font-semibold text-slate-900 tabular-nums">{avg}</span>
          </div>

          {/* Search + filters */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search mentees by name…"
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <SelectMenu value={momentum} onChange={setMomentum} options={MOMENTUM_OPTS} ariaLabel="Filter by momentum" className="sm:w-44" />
            <SelectMenu value={band} onChange={setBand} options={BAND_OPTS} ariaLabel="Filter by score" className="sm:w-48" />
          </div>

          {filtered.length === 0 ? (
            <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center">
              <Gauge className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-600 mb-3">No mentees match these filters.</p>
              {filtersActive && <button onClick={clearFilters} className="text-brand-600 hover:text-brand-700 text-sm font-medium">Clear filters</button>}
            </div>
          ) : (
            <>
              <div className="bg-card rounded-2xl border border-slate-200 divide-y divide-slate-100">
                {pageItems.map((r) => (
                  <button key={r.m.id} onClick={() => router.push(`/mentor/mentees/${r.m.id}`)}
                    className="w-full text-left flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors group">
                    <span className="w-6 text-center text-sm font-semibold text-slate-400 tabular-nums">{rankById.get(r.m.id)}</span>
                    <div className="w-9 h-9 bg-brand-100 rounded-full flex items-center justify-center shrink-0">
                      <span className="text-brand-700 text-xs font-medium">{r.m.avatar}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-slate-900 truncate">{r.m.name}</p>
                        <MomentumIcon momentum={r.m.momentum} />
                      </div>
                      <div className="mt-1 h-1.5 w-full max-w-xs rounded-full bg-slate-100 overflow-hidden">
                        <div className={`h-full rounded-full ${scoreColor(r.score)}`} style={{ width: `${r.score}%` }} />
                      </div>
                    </div>
                    <span className="text-lg font-semibold text-slate-900 tabular-nums shrink-0">{r.score}</span>
                    <ArrowUpRight className="w-4 h-4 text-slate-300 group-hover:text-brand-500 shrink-0" />
                  </button>
                ))}
              </div>

              {filtered.length > pagination.limit && (
                <TablePagination pagination={pagination} />
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
