'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarClock, CheckCircle2, ChevronRight, Clock, Flag, ListTodo, Loader2, PartyPopper } from 'lucide-react';
import { qk, useApiQuery, useInvalidate } from '@/lib/query';
import { useAuth } from '@/lib/context/AuthContext';
import { LearningStat } from '@/components/mentee/LearningStat';
import { SearchAndFilterBar, StatusBadge } from '@/components/admin/ui';
import { ClanAvatar } from '@/components/shared/ClanAvatar';
import { TaskDrawer } from '@/components/mentee/TaskDrawer';
import { SubmitTaskDrawer, type SubmitTaskTarget } from '@/components/mentee/SubmitTaskDrawer';
import { MenteeTaskRow, type MenteeTaskView } from '@/components/mentee/tasks/MenteeTaskRow';
import { MenteeTaskEmpty, MenteeTaskStats, MenteeTaskViewToggle } from '@/components/mentee/tasks/MenteeTaskChrome';
import { candidateApi, type CandidatePoolSummary, type CandidateTask } from '@/lib/services/pool-api';
import { OPEN_STATUSES, POOL_WORK_STATUS, fmtPoolDate, poolTaskHref } from './poolUi';

/**
 * A candidate's qualifying round, inside the learner workspace.
 *
 * This is what `/mentee/dashboard` shows while the scope is a selection pool.
 * It used to be a page of its own under `/candidate`, with its own sidebar —
 * which meant somebody placed into a clan had their round and their clan work
 * in two different shells, and no settings page at all.
 *
 * It deliberately shows no score and no rank. The round is not a leaderboard
 * to the people in it, and a candidate who can watch themselves slip down one
 * is being given something to worry about rather than something to do.
 */

const OUTCOME: Record<string, { title: string; body: string; cls: string }> = {
  selected: { title: 'You were selected', body: 'Congratulations — you will be placed in a clan shortly.', cls: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  waitlisted: { title: 'You are on the waitlist', body: 'We will let you know if a place opens up.', cls: 'border-amber-200 bg-amber-50 text-amber-800' },
  not_selected: { title: 'Not selected this time', body: 'Thank you for taking part in this round.', cls: 'border-slate-200 bg-slate-50 text-slate-700' },
  withdrawn: { title: 'Withdrawn', body: 'You are no longer part of this round.', cls: 'border-slate-200 bg-slate-50 text-slate-700' },
  disqualified: { title: 'No longer in this round', body: 'Your remaining work is no longer due.', cls: 'border-slate-200 bg-slate-50 text-slate-700' },
};

const isOverdue = (t: CandidateTask) => Boolean(t.dueDate && new Date(t.dueDate) < new Date() && OPEN_STATUSES.includes(t.status));
const kindLabel = (t: CandidateTask) => (t.kind === 'task' ? t.type.replace('_', ' ') : t.kind);

export function PoolTaskRow({ task }: { task: CandidateTask }) {
  const due = fmtPoolDate(task.dueDate);
  const overdue = isOverdue(task);
  return (
    <Link href={poolTaskHref(task.id)} className="mentee-task-row group flex items-center gap-4 p-4 transition-colors sm:p-5">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-slate-900">{task.title}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          <span className="capitalize">{kindLabel(task)}</span>
          {!task.required && <span>Optional</span>}
          {due && (
            <span className={`inline-flex items-center gap-1 ${overdue ? 'font-medium text-red-600' : ''}`}>
              <CalendarClock className="h-3.5 w-3.5" /> {overdue ? 'Overdue · ' : 'Due '}{due}
            </span>
          )}
        </p>
      </div>
      <StatusBadge status={task.status} config={POOL_WORK_STATUS} />
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 group-hover:text-brand-600" />
    </Link>
  );
}

function PoolSection({ summary, tasks }: { summary: CandidatePoolSummary; tasks: CandidateTask[] }) {
  const outcome = summary.outcome ? OUTCOME[summary.outcome.decision] : null;
  const { completed, total } = summary.progress;
  return (
    <section className="space-y-4">
      <div className="mentee-page-heading flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <ClanAvatar name={summary.pool.name} src={summary.pool.avatarUrl} size="lg" />
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-slate-900">{summary.pool.name}</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {summary.pool.program?.name}
              {summary.pool.qualificationDueAt && <> · Complete by {fmtPoolDate(summary.pool.qualificationDueAt)}</>}
            </p>
          </div>
        </div>
        {total > 0 && (
          <div className="text-right">
            <p className="text-sm font-semibold text-slate-900">{completed}/{total} approved</p>
            <div className="mt-1.5 h-1.5 w-36 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-brand-600" style={{ width: `${total ? (completed / total) * 100 : 0}%` }} />
            </div>
          </div>
        )}
      </div>

      {outcome && (
        <div className={`rounded-2xl border px-5 py-4 ${outcome.cls}`}>
          <p className="flex items-center gap-2 font-semibold">
            {summary.outcome?.decision === 'selected' && <PartyPopper className="h-4 w-4" />} {outcome.title}
          </p>
          <p className="mt-0.5 text-sm opacity-90">
            {summary.outcome?.placedClan ? `You have been placed in ${summary.outcome.placedClan.name}.` : outcome.body}
          </p>
          {summary.outcome?.placedClan && (
            <p className="mt-2 text-sm opacity-90">
              Switch to <span className="font-medium">{summary.outcome.placedClan.name}</span> in the clan picker to open it.
            </p>
          )}
        </div>
      )}

      {tasks.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-card px-6 py-10 text-center text-sm text-slate-500">
          No work has been given to you yet. You will be notified when it is.
        </div>
      ) : (
        <div className="mentee-task-list">
          {tasks.map((task) => <PoolTaskRow key={task.id} task={task} />)}
        </div>
      )}
    </section>
  );
}

export function PoolQualification({ poolId }: { poolId?: string | null }) {
  const { user } = useAuth();
  const pools = useApiQuery({ queryKey: qk.candidate.pools, queryFn: candidateApi.pools, errorMessage: 'Could not load your rounds' });
  const tasks = useApiQuery({ queryKey: qk.candidate.tasks, queryFn: candidateApi.tasks, errorMessage: 'Could not load your work' });
  const loading = pools.loading || tasks.loading;

  // The picker chooses which round is on screen; without a choice (one round,
  // never switched) all of them are, which is also what the old page showed.
  // `p.pool?.id`, like the line below it: one malformed row should narrow what
  // this shows, never take a learner's whole page down.
  const shown = (pools.data || []).filter((p) => p.pool && (!poolId || p.pool.id === poolId));
  const mine = (tasks.data || []).filter((t) => !poolId || t.pool?.id === poolId);
  const count = (statuses: string[]) => (loading ? '—' : mine.filter((t) => statuses.includes(t.status)).length);
  // The single most useful next step: the open piece of work due soonest.
  const next = [...mine]
    .filter((t) => OPEN_STATUSES.includes(t.status) && !t.readOnly)
    .sort((a, b) => new Date(a.dueDate || 8.64e15).getTime() - new Date(b.dueDate || 8.64e15).getTime())[0];

  return (
    <div className="space-y-6">
      <div className="mentee-welcome">
        <h1 className="mb-2 font-bold text-slate-900">Welcome{user?.firstName ? `, ${user.firstName}` : ''}</h1>
        <p className="text-slate-600">
          Your selection round: the work to complete, the deadlines, and your outcome. Hand each piece in before it is
          due. A reviewer will look at it and may ask for changes.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-label="Your qualification at a glance">
        <LearningStat label="To do" value={count(['assigned', 'not_started', 'in_progress'])} icon={ListTodo} tone={0} hint="Work still to hand in" />
        <LearningStat label="Awaiting review" value={count(['submitted'])} icon={Clock} tone={1} hint="Handed in, waiting for a reviewer" />
        <LearningStat label="Approved" value={count(['completed'])} icon={CheckCircle2} tone={2} hint="Reviewed and accepted" />
        <LearningStat label="Changes requested" value={count(['revision_needed'])} icon={Flag} tone={3} hint="Read the notes and hand in again" />
      </div>

      {next && (
        <Link href={poolTaskHref(next.id)} className="mentee-next-task block transition-colors">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-brand-600">Next up</span>
            {isOverdue(next) && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
                <Clock className="h-3 w-3" /> overdue
              </span>
            )}
          </div>
          <h2 className="text-xl font-semibold text-slate-900">{next.title}</h2>
          <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">
            <span className="capitalize">{kindLabel(next)}</span>
            {next.dueDate && (<><span className="text-slate-300">·</span><span>Due {fmtPoolDate(next.dueDate)}</span></>)}
          </div>
          <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-700">
            {next.status === 'revision_needed' ? 'See the notes' : 'Open'} <ArrowRight className="h-4 w-4" />
          </span>
        </Link>
      )}

      {loading && <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div>}
      {(pools.error || tasks.error) && (
        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{pools.error || tasks.error}</p>
      )}
      {!loading && !shown.length && !pools.error && (
        <div className="mentee-page-heading text-center text-slate-500">You are not in a selection round right now.</div>
      )}
      {shown.map((summary) => (
        <PoolSection key={summary.memberId} summary={summary} tasks={mine.filter((t) => t.pool?.id === summary.pool.id)} />
      ))}
    </div>
  );
}

/**
 * Just the work, for `/mentee/tasks` in pool scope.
 *
 * The same screen a clan learner gets, with the round's wording: the four
 * counts, the Active/Approved switch, search and a status filter, and the
 * shared task row with its drawer. It used to be three flat lists of titles,
 * which meant the same person saw a visibly poorer product on the days they
 * were in a round than on the days they were in a clan - for no better reason
 * than that the work is fetched from somewhere else.
 *
 * What stays different is only what is actually different: approval rather
 * than completion, a reviewer rather than a mentor, no score and no rank.
 */
const POOL_FILTERS = [
  { value: 'all', label: 'All work' },
  { value: 'assigned', label: 'To do' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'submitted', label: 'Awaiting review' },
  { value: 'revision_needed', label: 'Changes requested' },
];

/** A round's work in the shape the shared row reads. */
function toRow(t: CandidateTask): MenteeTaskView {
  return {
    id: t.id,
    title: t.title,
    description: t.description ?? null,
    // `kind` is how a round says "this is a quiz"; `type` is the template's.
    type: t.kind === 'task' ? t.type : t.kind,
    difficulty: t.difficulty ?? null,
    dueDate: t.dueDate,
    estimatedHours: t.estimatedHours ?? null,
    points: t.points ?? null,
    status: t.status,
    optional: !t.required,
  };
}

export function PoolWorkList({ poolId }: { poolId?: string | null }) {
  const invalidate = useInvalidate();
  const { data, loading, error } = useApiQuery({
    queryKey: qk.candidate.tasks,
    queryFn: candidateApi.tasks,
    errorMessage: 'Could not load your work',
  });

  const [view, setView] = useState<'active' | 'completed'>('active');
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [submitTarget, setSubmitTarget] = useState<SubmitTaskTarget | null>(null);

  const mine = (data || []).filter((t) => !poolId || t.pool?.id === poolId);
  const byId = (id: string) => mine.find((t) => t.id === id) ?? null;
  const active = mine.filter((t) => t.status !== 'completed');
  const done = mine.filter((t) => t.status === 'completed');

  const shown = (view === 'completed' ? done : active)
    .filter((t) => view === 'completed' || status === 'all' || t.status === status)
    .filter((t) => !search.trim() || t.title.toLowerCase().includes(search.trim().toLowerCase()));

  const count = (statuses: string[]) => mine.filter((t) => statuses.includes(t.status)).length;
  const stats = [
    { key: 'assigned', label: 'To do', value: count(['assigned', 'not_started']), icon: ListTodo, hint: 'Work still to hand in →' },
    { key: 'submitted', label: 'Awaiting review', value: count(['submitted']), icon: Clock, hint: 'Handed in, with a reviewer →' },
    { key: 'completed', label: 'Approved', value: done.length, icon: CheckCircle2, hint: 'Reviewed and accepted →' },
    { key: 'revision_needed', label: 'Changes requested', value: count(['revision_needed']), icon: Flag, hint: 'Read the notes and hand it in again →' },
  ];

  const openWork = openTaskId ? byId(openTaskId) : null;
  const askToSubmit = (row: MenteeTaskView) => {
    setSubmitTarget({ id: row.id, title: row.title, status: row.status });
    setOpenTaskId(null);
  };
  const start = (id: string) => {
    candidateApi.start(id).then(() => invalidate(qk.candidate.all)).catch(() => {});
  };

  return (
    <div className="space-y-6">
      <div className="mentee-welcome">
        <h1 className="mb-2 font-bold text-slate-900">Your qualifying work</h1>
        <p className="text-slate-600">
          Everything this round has given you. Hand each piece in before it is due — a reviewer looks at it and may ask
          for changes, and only approved work counts.
        </p>
      </div>

      <MenteeTaskStats
        stats={stats}
        loading={loading}
        onPick={(key) => {
          setView(key === 'completed' ? 'completed' : 'active');
          setStatus(key === 'completed' ? 'all' : key);
        }}
      />

      <MenteeTaskViewToggle
        view={view}
        onChange={setView}
        activeCount={active.length}
        completedCount={done.length}
        loading={loading}
        completedLabel="Approved"
      />

      <SearchAndFilterBar
        search={search}
        onSearch={setSearch}
        placeholder={view === 'completed' ? 'Search approved work...' : 'Search your work...'}
        filters={view === 'active' ? [{ value: status, onChange: setStatus, options: POOL_FILTERS }] : []}
      />

      {error && <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div>
      ) : shown.length === 0 ? (
        <MenteeTaskEmpty
          view={view}
          title={view === 'completed' ? 'Nothing approved yet' : 'No work open right now'}
          hint={
            search.trim() ? 'Try a different search term'
              : status !== 'all' ? 'No work in this category'
                : mine.length ? 'Everything is handed in or approved.'
                  : 'Work will appear here when the round gives it to you.'
          }
        />
      ) : (
        <div className="mentee-task-list">
          {shown.map((task) => {
            const row = toRow(task);
            return (
              <MenteeTaskRow
                key={task.id}
                task={row}
                href={poolTaskHref(task.id)}
                statusConfig={POOL_WORK_STATUS}
                readOnly={task.readOnly}
                readOnlyTitle="This round is closed"
                onOpen={setOpenTaskId}
                onStart={task.readOnly ? undefined : start}
                onSubmit={task.readOnly ? undefined : askToSubmit}
                quizHref={(id) => `/mentee/quizzes/${id}`}
                interviewHref={(id) => `/mentee/interviews/${id}`}
                courseHref={poolTaskHref}
              />
            );
          })}
        </div>
      )}

      <TaskDrawer
        source="pool"
        taskId={openTaskId}
        open={Boolean(openTaskId)}
        onClose={() => setOpenTaskId(null)}
        readOnly={Boolean(openWork?.readOnly)}
        onStart={start}
        onSubmit={(t) => askToSubmit(toRow(t as CandidateTask))}
      />

      <SubmitTaskDrawer
        source="pool"
        open={Boolean(submitTarget)}
        task={submitTarget}
        onClose={() => setSubmitTarget(null)}
        onSubmitted={() => invalidate(qk.candidate.all)}
      />
    </div>
  );
}
