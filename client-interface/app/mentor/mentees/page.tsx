'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Search, Users, Users2, Inbox, ListPlus } from 'lucide-react';
import { useMentorCohort } from '@/lib/hooks/mentor';
import { MenteeCard } from '@/components/mentor/MenteeCard';
import { PausedMenteesPanel } from '@/components/mentor/PausedMenteesPanel';
import { AssignTaskDrawer, type AssignDrawerMentee } from '@/components/mentor/AssignTaskDrawer';

type Filter = 'all' | 'attention' | 'on_track' | 'no_tasks';

export default function MentorMentees() {
  const router = useRouter();
  const { cohort, totals, loading, error, refetch } = useMentorCohort();
  const [search, setSearch] = useState('');
  const [clan, setClan] = useState('all');
  const [filter, setFilter] = useState<Filter>('all');
  // Assign drawer: 'single' targets one mentee, 'bulk' targets everyone in view.
  const [assign, setAssign] = useState<{ mode: 'single' | 'bulk'; mentee?: AssignDrawerMentee } | null>(null);

  // Allow deep-linking to the no-tasks view (e.g. from the Cockpit nudge).
  // Read from the URL on mount (client-only) to avoid a prerender Suspense boundary.
  useEffect(() => {
    const f = new URLSearchParams(window.location.search).get('filter');
    if (f === 'no_tasks' || f === 'attention' || f === 'on_track') setFilter(f as Filter);
  }, []);

  // Distinct clans across the cohort, for the clan filter.
  const clans = useMemo(() => {
    const map = new Map<string, string>();
    cohort.forEach((m) => { if (m.clan) map.set(m.clan.id, m.clan.name); });
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [cohort]);

  // How many of the (clan-scoped) mentees have never been given any work.
  const noTaskCount = useMemo(
    () => cohort.filter((m) => m.taskCount === 0 && (clan === 'all' || m.clan?.id === clan)).length,
    [cohort, clan]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cohort.filter((m) => {
      if (clan !== 'all' && m.clan?.id !== clan) return false;
      if (filter === 'attention' && !(m.risk !== 'low' || m.openBlockers > 0 || m.pendingApprovals > 0)) return false;
      if (filter === 'on_track' && !(m.risk === 'low' && m.momentum !== 'down')) return false;
      if (filter === 'no_tasks' && m.taskCount !== 0) return false;
      if (q && !(m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [cohort, search, clan, filter]);

  const FILTERS: { key: Filter; label: string; count?: number }[] = [
    { key: 'all', label: 'Everyone' },
    { key: 'attention', label: 'Needs attention' },
    { key: 'on_track', label: 'On track' },
    { key: 'no_tasks', label: 'No tasks yet', count: noTaskCount },
  ];

  // Targets for the "assign to everyone in view" bulk action.
  const bulkTargets: AssignDrawerMentee[] = filtered.map((m) => ({ id: m.id, name: m.name, risk: m.risk }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-slate-900 mb-1">My mentees</h1>
          <p className="text-slate-600">{totals ? `${totals.mentees} mentee${totals.mentees === 1 ? '' : 's'} across ${clans.length || 1} clan${clans.length === 1 ? '' : 's'}` : 'Your cohort across all your clans.'}</p>
        </div>
      </div>

      {/* Inactive mentees: suggested-to-pause queue + currently paused list. */}
      <div data-tour="paused-mentees">
        <PausedMenteesPanel />
      </div>

      {/* Search + status filter */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or email…"
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
          {FILTERS.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === f.key ? 'bg-card text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
              {f.label}
              {typeof f.count === 'number' && f.count > 0 && (
                <span className={`text-xs px-1.5 rounded-full ${filter === f.key ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-600'}`}>{f.count}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Clan filter chips */}
      {clans.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 text-xs text-slate-400"><Users2 className="w-3.5 h-3.5" />Clan:</span>
          <button onClick={() => setClan('all')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${clan === 'all' ? 'bg-brand-600 text-white' : 'bg-card border border-slate-200 text-slate-600 hover:border-slate-300'}`}>
            All clans
          </button>
          {clans.map((c) => (
            <button key={c.id} onClick={() => setClan(c.id)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${clan === c.id ? 'bg-brand-600 text-white' : 'bg-card border border-slate-200 text-slate-600 hover:border-slate-300'}`}>
              {c.name}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-600" /></div>
      ) : error ? (
        <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center">
          <p className="text-slate-600 mb-3">{error}</p>
          <button onClick={refetch} className="text-brand-600 hover:text-brand-700 text-sm font-medium">Try again</button>
        </div>
      ) : cohort.length === 0 ? (
        <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center">
          <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 font-medium">No mentees yet</p>
          <p className="text-slate-400 text-sm mt-1">Once mentees are placed in your clans, they show up here.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card rounded-2xl border border-slate-200 py-12 text-center">
          <p className="text-slate-500 text-sm">No mentees match your filters.</p>
        </div>
      ) : (
        <>
          {/* Bulk-assign bar — get everyone in the no-tasks view started at once. */}
          {filter === 'no_tasks' && filtered.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm text-amber-800 inline-flex items-center gap-2">
                <Inbox className="w-4 h-4 shrink-0" />
                {filtered.length} mentee{filtered.length === 1 ? '' : 's'} {filtered.length === 1 ? 'has' : 'have'} no tasks yet. Assign a roadmap or a custom task to get them moving.
              </p>
              <button
                onClick={() => setAssign({ mode: 'bulk' })}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium shrink-0"
              >
                <ListPlus className="w-4 h-4" />Assign to all {filtered.length}
              </button>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((m) => (
              <MenteeCard
                key={m.id}
                m={m}
                showClan
                onOpen={() => router.push(`/mentor/mentees/${m.id}`)}
                onAssign={() => setAssign({ mode: 'single', mentee: { id: m.id, name: m.name, risk: m.risk } })}
              />
            ))}
          </div>
        </>
      )}

      {assign && (
        <AssignTaskDrawer
          mode={assign.mode}
          mentee={assign.mentee}
          cohort={assign.mode === 'bulk' ? bulkTargets : undefined}
          onClose={() => setAssign(null)}
          onAssigned={refetch}
        />
      )}
    </div>
  );
}
