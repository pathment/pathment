'use client';
import { Avatar } from '@/components/shared/Avatar';

import { useMemo, useState } from 'react';
import { useClan, isHistoricalMentorScope } from '@/lib/context/ClanContext';
import { usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';
import { Loader2, Search, Users, Inbox, ListPlus } from 'lucide-react';
import { useMentorCohort } from '@/lib/hooks/mentor';
import {
  needsMentorAttention,
  mentorAttentionReason,
} from '@/lib/mentorAttention';
import { PausedMenteesPanel } from '@/components/mentor/PausedMenteesPanel';
import type { AssignDrawerMentee } from '@/components/mentor/AssignTaskDrawer';
import dynamic from 'next/dynamic';

type Filter = 'all' | 'attention' | 'on_track' | 'no_tasks' | 'blockers';

const AssignTaskDrawer = dynamic(() =>
  import('@/components/mentor/AssignTaskDrawer').then(
    (module) => module.AssignTaskDrawer,
  ),
);

export default function MentorMenteesPage() {
  return (
    <Suspense
      fallback={<p className="text-muted-foreground">Loading mentees…</p>}
    >
      <MentorMentees />
    </Suspense>
  );
}

function MentorMentees() {
  const params = useSearchParams();
  const pathname = usePathname();
  const { cohort, totals, hiddenByClan, loading, error, refetch } =
    useMentorCohort();
  const { clans: mentoredClans, activeClanId } = useClan();
  const activeClan = mentoredClans.find((c) => c.id === activeClanId) ?? null;
  const activeClanName = activeClan?.name ?? null;
  const historical = isHistoricalMentorScope(mentoredClans, activeClanId);
  const [search, setSearch] = useState('');
  const requestedFilter = params.get('filter');
  const filter: Filter = [
    'attention',
    'on_track',
    'no_tasks',
    'blockers',
  ].includes(requestedFilter ?? '')
    ? (requestedFilter as Filter)
    : 'all';
  const setFilter = (value: Filter) => {
    const next = new URLSearchParams(params.toString());
    if (value === 'all') next.delete('filter');
    else next.set('filter', value);
    window.history.replaceState(
      null,
      '',
      `${pathname}${next.size ? `?${next}` : ''}`,
    );
  };
  const [assign, setAssign] = useState<{
    mode: 'single' | 'bulk';
    mentee?: AssignDrawerMentee;
  } | null>(null);

  // Distinct clans present in the (already clan-scoped) cohort — for the
  // subtitle only. This page used to carry its own clan chips on top of the
  // sidebar picker: two controls for one choice, which could disagree and left
  // the mentor unsure which one was in charge. The sidebar is the only one.
  const clans = useMemo(() => {
    const map = new Map<string, string>();
    cohort.forEach((m) => {
      if (m.clan) map.set(m.clan.id, m.clan.name);
    });
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [cohort]);

  // How many of the (clan-scoped) mentees have never been given any work.
  const noTaskCount = useMemo(
    () => cohort.filter((m) => m.taskCount === 0).length,
    [cohort],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cohort.filter((m) => {
      if (filter === 'attention' && !needsMentorAttention(m)) return false;
      if (filter === 'on_track' && needsMentorAttention(m)) return false;
      if (filter === 'blockers' && m.openBlockers === 0) return false;
      if (filter === 'no_tasks' && m.taskCount !== 0) return false;
      if (
        q &&
        !(m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q))
      )
        return false;
      return true;
    });
  }, [cohort, search, filter]);

  const FILTERS: { key: Filter; label: string; count?: number }[] = [
    { key: 'all', label: 'Everyone', count: cohort.length },
    {
      key: 'attention',
      label: 'Needs attention',
      count: cohort.filter(needsMentorAttention).length,
    },
    { key: 'on_track', label: 'On track' },
    { key: 'blockers', label: 'Roadblocks' },
    { key: 'no_tasks', label: 'No tasks yet', count: noTaskCount },
  ];

  // Targets for the "assign to everyone in view" bulk action.
  const bulkTargets: AssignDrawerMentee[] = filtered.map((m) => ({
    id: m.id,
    name: m.name,
    risk: m.risk,
    level: m.level,
    avatarUrl: m.profilePictureUrl,
    clanName: m.clan?.name ?? null,
    taskCount: m.taskCount,
    pendingApprovals: m.pendingApprovals,
    openBlockers: m.openBlockers,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-slate-900 mb-1">My mentees</h1>
          <p className="text-slate-600">
            {totals
              ? `${totals.mentees} mentee${totals.mentees === 1 ? '' : 's'} across ${clans.length || 1} clan${clans.length === 1 ? '' : 's'}`
              : 'Your cohort across all your clans.'}
          </p>
        </div>
      </div>

      {/* Inactive mentees: suggested-to-pause queue + currently paused list. */}
      <details
        data-tour="paused-mentees"
        className="rounded-2xl border border-border bg-card p-4"
      >
        <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
          Manage inactive &amp; paused mentees
        </summary>
        <div className="mt-4">
          <PausedMenteesPanel key={activeClanId} />
        </div>
      </details>

      {/* Search + status filter */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-56 max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            aria-label="Search mentees"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-xl">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === f.key ? 'bg-card text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            >
              {f.label}
              {typeof f.count === 'number' && f.count > 0 && (
                <span
                  className={`text-xs px-1.5 rounded-full ${filter === f.key ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-600'}`}
                >
                  {f.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
        </div>
      ) : error ? (
        <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center">
          <p className="text-slate-600 mb-3">{error}</p>
          <button
            onClick={refetch}
            className="text-brand-600 hover:text-brand-700 text-sm font-medium"
          >
            Try again
          </button>
        </div>
      ) : cohort.length === 0 ? (
        <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center">
          <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          {/* "No mentees yet" is about placement. When the clan picker is what
              emptied the list, that sentence sends the mentor looking for a
              problem that is not there — name the clan instead. */}
          {hiddenByClan > 0 ? (
            <>
              <p className="text-slate-600 font-medium">
                No mentees in {activeClanName || 'this clan'}
              </p>
              {/* No merged scope to jump to: point at the sidebar picker. */}
              <p className="text-slate-400 text-sm mt-1">
                {hiddenByClan} mentee{hiddenByClan === 1 ? ' is' : 's are'} in
                your other clans — switch clan in the sidebar to see {hiddenByClan === 1 ? 'them' : 'them'}.
              </p>
            </>
          ) : (
            <>
              <p className="text-slate-600 font-medium">No mentees yet</p>
              <p className="text-slate-400 text-sm mt-1">
                Once mentees are placed in your clans, they show up here.
              </p>
            </>
          )}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card rounded-2xl border border-slate-200 py-12 text-center">
          <p className="text-slate-500 text-sm">
            No mentees match your filters.
          </p>
        </div>
      ) : (
        <>
          {/* Bulk-assign bar — get everyone in the no-tasks view started at once. */}
          {filter === 'no_tasks' && filtered.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm text-amber-800 inline-flex items-center gap-2">
                <Inbox className="w-4 h-4 shrink-0" />
                {filtered.length} mentee{filtered.length === 1 ? '' : 's'}{' '}
                {filtered.length === 1 ? 'has' : 'have'} no tasks yet. Assign a
                roadmap or a custom task to get them moving.
              </p>
              <button
                onClick={() => setAssign({ mode: 'bulk' })}
                disabled={historical}
                title={historical ? 'Completed programs are read-only' : undefined}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium shrink-0 disabled:opacity-50"
              >
                <ListPlus className="w-4 h-4" />
                Assign to all {filtered.length}
              </button>
            </div>
          )}

          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full min-w-[720px] text-left text-sm">
              <caption className="px-5 py-3 text-left text-xs text-muted-foreground border-b border-border">
                {filtered.length} of {cohort.length} mentees · Open a name to
                see their full progress.
              </caption>
              <thead className="bg-muted/60 text-xs text-muted-foreground">
                <tr>
                  {[
                    'Mentee',
                    'Roadmap progress',
                    'Status & next step',
                    'Last active',
                    'Actions',
                  ].map((label) => (
                    <th
                      key={label}
                      scope="col"
                      className="px-5 py-3 font-medium"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((m) => (
                  <tr
                    key={m.id}
                    className="hover:bg-muted/40 transition-colors"
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <Avatar
                          name={m.name}
                          src={m.profilePictureUrl}
                          size="md"
                        />
                        <div>
                          <Link
                            href={`/mentor/mentees/${m.id}`}
                            className="font-semibold text-foreground hover:text-brand-600"
                          >
                            {m.name}
                          </Link>
                          <p className="text-xs text-muted-foreground mt-1">
                            {m.email}
                          </p>
                          {m.clan && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {m.clan.name}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <p className="tabular-nums font-medium">
                        {Math.round(m.absoluteProgress)}%
                      </p>
                      <div
                        role="progressbar"
                        aria-label={`${m.name} progress`}
                        aria-valuenow={Math.round(m.absoluteProgress)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        className="h-1.5 w-24 rounded-full bg-muted mt-2 overflow-hidden"
                      >
                        <div
                          className="h-full rounded-full bg-brand-500"
                          style={{
                            width: `${Math.max(0, Math.min(100, m.absoluteProgress))}%`,
                          }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {m.tasksCompleted}/{m.taskCount} assigned tasks done
                      </p>
                    </td>
                    <td className="px-5 py-4 max-w-xs">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${needsMentorAttention(m) ? 'bg-amber-50 text-amber-700' : 'bg-brand-50 text-brand-700'}`}
                      >
                        {needsMentorAttention(m)
                          ? 'Needs attention'
                          : m.taskCount === 0
                            ? 'Not started'
                            : 'On track'}
                      </span>
                      <p className="text-xs text-muted-foreground mt-2">
                        {needsMentorAttention(m)
                          ? mentorAttentionReason(m)
                          : m.taskCount === 0
                            ? 'Assign their first task'
                            : 'No action needed'}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-xs text-muted-foreground">
                      {m.lastActive || 'No activity yet'}
                    </td>
                    <td className="px-5 py-4">
                      <button
                        aria-label={`Assign work to ${m.name}`}
                        onClick={() =>
                          setAssign({
                            mode: 'single',
                            mentee: { id: m.id, name: m.name, risk: m.risk },
                          })
                        }
                        disabled={historical}
                        title={historical ? 'Completed programs are read-only' : undefined}
                        className="whitespace-nowrap rounded-lg border border-border px-3 py-2 text-xs font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50"
                      >
                        Assign work
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
