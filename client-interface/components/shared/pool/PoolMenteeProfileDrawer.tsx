'use client';

import { useState } from 'react';
import {
  Activity, AlertTriangle, BookOpen, Briefcase, CheckCircle2, Clock3,
  Flame, Loader2, Mail, MessageSquareText, ShieldAlert, Sparkles,
  Target, Users2,
} from 'lucide-react';
import { Drawer } from '@/components/shared/Drawer';
import { Avatar } from '@/components/shared/Avatar';
import { qk, STALE, useApiQuery } from '@/lib/query';
import { handoverPoolApi, type PoolEntry } from '@/lib/services/handover-pool-api';

type Tab = 'overview' | 'work' | 'context';

const statusLabel = (value: string) => value.replaceAll('_', ' ');

function when(value: string | null | undefined) {
  if (!value) return 'No activity yet';
  const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000));
  return days === 0 ? 'Today' : days === 1 ? 'Yesterday' : `${days} days ago`;
}

export function PoolMenteeProfileDrawer({
  entry,
  onClose,
}: {
  entry: PoolEntry | null;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>('overview');
  const { data: profile, loading, error } = useApiQuery({
    queryKey: [...qk.handoverPool.all, 'profile', entry?.id ?? 'closed'],
    queryFn: () => handoverPoolApi.profile(entry!.id),
    enabled: !!entry,
    staleTime: STALE.short,
  });

  const tasks = profile?.tasksByStatus ?? {};
  const taskCount = Object.values(tasks).reduce((sum, rows) => sum + rows.length, 0);
  const completed = tasks.completed?.length ?? profile?.tasksCompleted ?? 0;
  const inFlight = (tasks.in_progress?.length ?? 0) + (tasks.submitted?.length ?? 0)
    + (tasks.revision_needed?.length ?? 0) + (tasks.assigned?.length ?? 0);
  const close = () => { setTab('overview'); onClose(); };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'work', label: `Work${taskCount ? ` · ${taskCount}` : ''}` },
    { id: 'context', label: 'Mentor context' },
  ];

  return (
    <Drawer
      open={!!entry}
      onClose={close}
      width="lg"
      title={entry?.mentee?.name || 'Mentee profile'}
      subtitle={entry ? `${entry.program?.name || 'No programme'} · currently in ${entry.fromClan?.name || 'their clan'}` : undefined}
      headerMeta={entry ? (
        <div className="flex items-center gap-3">
          <Avatar name={entry.mentee?.name} src={entry.mentee?.avatarUrl} size="md" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-muted-foreground">{entry.mentee?.email}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {entry.work.completed} of {entry.work.tasks} tasks completed · active {when(entry.work.lastActiveAt).toLowerCase()}
            </p>
          </div>
        </div>
      ) : undefined}
    >
      <div className="space-y-5">
        <div className="sticky top-0 z-10 -mx-6 -mt-6 border-b border-border bg-card px-6 pt-4">
          <div className="flex gap-1" role="tablist" aria-label="Profile sections">
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                onClick={() => setTab(item.id)}
                className={`border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                  tab === item.id
                    ? 'border-brand-600 text-brand-700 dark:text-brand-300'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Loading complete profile…
          </div>
        ) : error || !profile ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-100">
            This profile could not be loaded. The pool summary is still available on the card.
          </div>
        ) : tab === 'overview' ? (
          <div className="space-y-5">
            <section className="rounded-2xl border border-brand-200 bg-brand-50/60 p-4 dark:border-brand-500/30 dark:bg-brand-950/20">
              <div className="flex items-start gap-3">
                <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" aria-hidden />
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Mentor summary</h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{profile.aiSummary}</p>
                </div>
              </div>
              {!!profile.aiSignals?.length && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {profile.aiSignals.map((signal) => (
                    <span key={signal} className="rounded-full border border-brand-200 bg-card px-2.5 py-1 text-xs text-brand-800 dark:border-brand-500/30 dark:text-brand-200">{signal}</span>
                  ))}
                </div>
              )}
            </section>

            <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Mentee statistics">
              {[
                { label: 'Progress', value: `${profile.absoluteProgress ?? 0}%`, icon: Target },
                { label: 'Completed', value: String(completed), icon: CheckCircle2 },
                { label: 'In flight', value: String(inFlight), icon: Activity },
                { label: 'Last active', value: profile.lastActive || 'Never', icon: Clock3 },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label} className="rounded-xl border border-border bg-muted/20 p-3">
                  <Icon className="h-4 w-4 text-brand-600" aria-hidden />
                  <p className="mt-2 truncate text-base font-semibold text-foreground">{value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              ))}
            </section>

            <section className="rounded-2xl border border-border bg-card p-4">
              <h3 className="text-sm font-semibold text-foreground">Profile details</h3>
              <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                <div className="flex items-start gap-2.5"><Mail className="mt-0.5 h-4 w-4 text-muted-foreground" aria-hidden /><div><dt className="text-xs text-muted-foreground">Email</dt><dd className="break-all text-foreground">{profile.email}</dd></div></div>
                <div className="flex items-start gap-2.5"><Briefcase className="mt-0.5 h-4 w-4 text-muted-foreground" aria-hidden /><div><dt className="text-xs text-muted-foreground">Current focus</dt><dd className="text-foreground">{profile.currentOccupation || profile.program || 'Not provided'}</dd></div></div>
                <div className="flex items-start gap-2.5"><BookOpen className="mt-0.5 h-4 w-4 text-muted-foreground" aria-hidden /><div><dt className="text-xs text-muted-foreground">Programme</dt><dd className="text-foreground">{profile.program || entry?.program?.name || 'Not assigned'}</dd></div></div>
                <div className="flex items-start gap-2.5"><Users2 className="mt-0.5 h-4 w-4 text-muted-foreground" aria-hidden /><div><dt className="text-xs text-muted-foreground">Clan</dt><dd className="text-foreground">{profile.clan?.name || entry?.fromClan?.name || 'Not assigned'}</dd></div></div>
              </dl>
            </section>

            {profile.consistency && (
              <section className="rounded-2xl border border-border bg-card p-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground"><Flame className="h-4 w-4 text-orange-500" aria-hidden />Consistency</h3>
                <div className="mt-3 grid grid-cols-3 gap-3 text-center">
                  <div><p className="text-lg font-semibold text-foreground">{profile.consistency.currentStreakDays}d</p><p className="text-xs text-muted-foreground">Current streak</p></div>
                  <div><p className="text-lg font-semibold text-foreground">{profile.consistency.loggedLast7}/7</p><p className="text-xs text-muted-foreground">Days logged</p></div>
                  <div><p className="text-lg font-semibold text-foreground">{profile.onTimeRate ?? 0}%</p><p className="text-xs text-muted-foreground">On time</p></div>
                </div>
              </section>
            )}
          </div>
        ) : tab === 'work' ? (
          <div className="space-y-4">
            {!taskCount ? (
              <div className="rounded-2xl border border-border bg-muted/20 py-12 text-center">
                <BookOpen className="mx-auto h-8 w-8 text-muted-foreground/50" aria-hidden />
                <p className="mt-2 text-sm font-medium text-foreground">No assigned work yet</p>
              </div>
            ) : Object.entries(tasks).map(([status, rows]) => (
              <section key={status} className="rounded-2xl border border-border bg-card">
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <h3 className="text-sm font-semibold capitalize text-foreground">{statusLabel(status)}</h3>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{rows.length}</span>
                </div>
                <ul className="divide-y divide-border">
                  {rows.map((task) => (
                    <li key={task.id} className="flex items-start gap-3 px-4 py-3">
                      {task.status === 'completed'
                        ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                        : <Activity className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden />}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">{task.title}</p>
                        <p className="mt-0.5 text-xs capitalize text-muted-foreground">
                          {task.type || 'Task'}{task.dueDate ? ` · due ${new Date(task.dueDate).toLocaleDateString()}` : ''}{task.isLate ? ' · late' : ''}
                        </p>
                      </div>
                      {task.finalRating != null && <span className="shrink-0 text-xs font-medium text-amber-600">★ {task.finalRating}</span>}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <section className="rounded-2xl border border-border bg-card p-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground"><ShieldAlert className="h-4 w-4 text-amber-600" aria-hidden />Roadblocks and delays</h3>
              {!profile.blockers.length && !profile.delays.length ? (
                <p className="mt-3 text-sm text-muted-foreground">No roadblocks or delays recorded.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {profile.blockers.map((blocker) => (
                    <li key={blocker.id} className="rounded-xl bg-muted/40 p-3 text-sm">
                      <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden /><span className="font-medium text-foreground">{blocker.title}</span></div>
                      <p className="mt-1 text-xs capitalize text-muted-foreground">{blocker.severity} severity · {blocker.status} · {blocker.daysOpen} days</p>
                    </li>
                  ))}
                  {profile.delays.map((delay) => (
                    <li key={delay.id} className="rounded-xl bg-muted/40 p-3 text-sm">
                      <p className="font-medium text-foreground">{delay.reason}</p>
                      <p className="mt-1 text-xs capitalize text-muted-foreground">{delay.kind} · {delay.days} day{delay.days === 1 ? '' : 's'} · {delay.accepted ? 'accepted' : 'not accepted'}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {!!profile.notes.length && (
              <section className="rounded-2xl border border-border bg-card p-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground"><MessageSquareText className="h-4 w-4 text-brand-600" aria-hidden />Recent mentor notes</h3>
                <ul className="mt-3 space-y-3">
                  {profile.notes.slice(0, 5).map((note) => (
                    <li key={note.id} className="border-l-2 border-brand-200 pl-3">
                      <p className="text-sm leading-6 text-foreground">{note.summary}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{new Date(note.date).toLocaleDateString()}{note.by ? ` · ${note.by}` : ''}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {profile.personality && (
              <section className="rounded-2xl border border-border bg-card p-4">
                <h3 className="text-sm font-semibold text-foreground">Working style</h3>
                {profile.personality.read && <p className="mt-2 text-sm leading-6 text-muted-foreground">{profile.personality.read}</p>}
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {(['consistency', 'communication', 'resilience', 'independence'] as const).map((key) => (
                    <div key={key}>
                      <div className="flex justify-between text-xs capitalize text-muted-foreground"><span>{key}</span><span>{profile.personality?.[key] ?? '—'}</span></div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-brand-500" style={{ width: `${profile.personality?.[key] ?? 0}%` }} /></div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </Drawer>
  );
}

export default PoolMenteeProfileDrawer;
