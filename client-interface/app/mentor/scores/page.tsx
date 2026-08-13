'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, Gauge, Loader2, Search } from 'lucide-react';
import { useClanPerformance } from '@/lib/hooks/mentor';
import { useClan, ALL_CLANS } from '@/lib/context/ClanContext';
import { SelectMenu } from '@/components/shared/SelectMenu';
import { usePagination } from '@/lib/hooks/shared/usePagination';
import { TablePagination } from '@/components/shared/TablePagination';

/**
 * Progress scores: the searchable table view of the same score the standings
 * page ranks by.
 *
 * The score used to be computed here, from a different weighting than the
 * standings page used, so the same mentee had two numbers depending on which
 * page you opened. Both are now the server's one score, so the two pages differ
 * only in presentation: this one searches and pages for a large clan, the other
 * is the podium.
 */

function scoreColor(s: number): string {
  if (s >= 80) return 'bg-emerald-500';
  if (s >= 70) return 'bg-brand-500';
  if (s >= 60) return 'bg-amber-500';
  return 'bg-red-500';
}

// The bands are the server's, so the filter cannot drift from the label shown.
const BAND_OPTS = [
  { value: 'all', label: 'All scores' },
  { value: 'Exceptional', label: 'Exceptional (90+)' },
  { value: 'Excellent', label: 'Excellent (80–89)' },
  { value: 'Strong', label: 'Strong (70–79)' },
  { value: 'Developing', label: 'Developing (60–69)' },
  { value: 'Needs attention', label: 'Needs attention (<60)' },
];

export default function MentorScores() {
  const router = useRouter();
  const { clans, activeClanId } = useClan();

  const [picked, setPicked] = useState<string | null>(null);
  const clanId = picked ?? (activeClanId !== ALL_CLANS ? activeClanId : clans[0]?.id ?? null);

  const { performance, loading, error, refetch } = useClanPerformance(clanId);

  const [search, setSearch] = useState('');
  const [band, setBand] = useState('all');
  const pagination = usePagination({ initialPage: 1, initialLimit: 15 });

  // Memoised so the filter below does not see a new array every render.
  const ranked = useMemo(() => performance?.ranked ?? [], [performance]);
  const notRanked = performance?.notRanked ?? [];

  const avg = ranked.length
    ? Math.round(ranked.reduce((n, m) => n + m.score, 0) / ranked.length)
    : 0;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ranked.filter(
      (m) => (!q || m.name.toLowerCase().includes(q)) && (band === 'all' || m.band === band)
    );
  }, [ranked, search, band]);

  useEffect(() => { pagination.setTotal(filtered.length); }, [filtered.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { pagination.reset(); }, [search, band, clanId]); // eslint-disable-line react-hooks/exhaustive-deps

  const pageItems = filtered.slice(
    (pagination.page - 1) * pagination.limit,
    pagination.page * pagination.limit
  );

  const filtersActive = search.trim() !== '' || band !== 'all';
  const clearFilters = () => { setSearch(''); setBand('all'); };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-slate-900 mb-2">Progress scores</h1>
        <p className="text-slate-600">
          One score per mentee, worked out on the server so it matches the standings and the app.
        </p>
      </div>

      {clans.length > 1 && (
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-xl w-fit">
          {clans.map((c) => (
            <button
              key={c.id}
              onClick={() => setPicked(c.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                clanId === c.id ? 'bg-card text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
        </div>
      ) : error ? (
        <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center">
          <p className="text-slate-600 mb-3">{error}</p>
          <button onClick={refetch} className="text-brand-600 hover:text-brand-700 text-sm font-medium">
            Try again
          </button>
        </div>
      ) : ranked.length === 0 && notRanked.length === 0 ? (
        <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center">
          <Gauge className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600">No mentees to score yet.</p>
        </div>
      ) : (
        <>
          <div className="bg-card rounded-2xl border border-slate-200 px-5 py-4 flex items-center gap-3">
            <Gauge className="w-5 h-5 text-brand-500" />
            <span className="text-sm text-slate-600">Clan average</span>
            <span className="ml-auto text-lg font-semibold text-slate-900 tabular-nums">{avg}</span>
          </div>

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
            <SelectMenu
              value={band}
              onChange={setBand}
              options={BAND_OPTS}
              ariaLabel="Filter by score"
              className="sm:w-56"
            />
          </div>

          {filtered.length === 0 ? (
            <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center">
              <Gauge className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-600 mb-3">No mentees match these filters.</p>
              {filtersActive && (
                <button
                  onClick={clearFilters}
                  className="text-brand-600 hover:text-brand-700 text-sm font-medium"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="bg-card rounded-2xl border border-slate-200 divide-y divide-slate-100">
                {pageItems.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => router.push(`/mentor/mentees/${m.id}`)}
                    className="w-full text-left flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors group"
                  >
                    <span className="w-6 text-center text-sm font-semibold text-slate-400 tabular-nums">
                      {m.rank}
                    </span>
                    <div className="w-9 h-9 bg-brand-100 rounded-full flex items-center justify-center shrink-0">
                      <span className="text-brand-700 text-xs font-medium">{m.avatar}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-slate-900 truncate">{m.name}</p>
                        <span className="text-[11px] text-slate-400">{m.band}</span>
                      </div>
                      <div className="mt-1 h-1.5 w-full max-w-xs rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${scoreColor(m.score)}`}
                          style={{ width: `${m.score}%` }}
                        />
                      </div>
                      {/* The parts, so the number is arguable rather than asserted. */}
                      <div className="flex flex-wrap gap-x-2.5 mt-1 text-[11px] text-slate-400">
                        {m.parts.map((p) => (
                          <span key={p.key}>
                            <span className="text-slate-600 font-medium">{p.score}</span>{' '}
                            {p.label.toLowerCase()}
                          </span>
                        ))}
                      </div>
                    </div>
                    <span className="text-lg font-semibold text-slate-900 tabular-nums shrink-0">
                      {m.score}
                    </span>
                    <ArrowUpRight className="w-4 h-4 text-slate-300 group-hover:text-brand-500 shrink-0" />
                  </button>
                ))}
              </div>

              {filtered.length > pagination.limit && <TablePagination pagination={pagination} />}
            </>
          )}

          {notRanked.length > 0 && (
            <div className="bg-card rounded-2xl border border-slate-200 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                Not scored yet
              </p>
              <div className="space-y-1.5">
                {notRanked.map((m) => (
                  <p key={m.id} className="text-sm text-slate-600">
                    <span className="text-slate-800">{m.name}</span>
                    <span className="text-slate-400">
                      {' '}
                      — {m.notRankedBecause ?? 'not enough reviewed work yet'}
                    </span>
                  </p>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
