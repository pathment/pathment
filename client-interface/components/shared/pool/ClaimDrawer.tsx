'use client';

import { useMemo, useState } from 'react';
import { Loader2, Users, AlertTriangle, Map as MapIcon, CheckCircle2, CircleDot } from 'lucide-react';
import { Drawer } from '@/components/shared/Drawer';
import { Avatar } from '@/components/shared/Avatar';
import type { PoolEntry, ClaimableClan } from '@/lib/services/handover-pool-api';

/**
 * Taking a mentee out of the pool.
 *
 * Two things have to be clear before the button is pressed, because neither is
 * undoable afterwards.
 *
 * WHAT COMES WITH THEM. Within the same programme their work is copied across
 * with its statuses, submissions and feedback; across programmes the roadmaps
 * differ, so it cannot be, and they arrive as a fresh start. That is a big
 * enough difference that the drawer says which one is about to happen for the
 * clan actually selected, rather than describing the feature in general.
 *
 * WHETHER THERE IS ROOM. Each clan shows its seats, and a full one cannot be
 * chosen here at all — the server enforces it anyway under a row lock, but
 * finding out by being refused is a poor way to learn your clan is full.
 */
export function ClaimDrawer({
  entry,
  clans,
  busy,
  onClose,
  onConfirm,
}: {
  entry: PoolEntry | null;
  clans: ClaimableClan[];
  busy: boolean;
  onClose: () => void;
  onConfirm: (toClanId: string) => void;
}) {
  const [clanId, setClanId] = useState('');
  const [programId, setProgramId] = useState('');

  const programs = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; status: string | null }>();
    for (const clan of clans) if (clan.programId) seen.set(clan.programId, {
      id: clan.programId, name: clan.programName || 'Programme', status: clan.programStatus,
    });
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [clans]);
  const effectiveProgramId = programId || entry?.program?.id || programs[0]?.id || '';
  const options = useMemo(
    () => clans.filter((c) => c.id !== entry?.fromClan?.id && c.programId === effectiveProgramId),
    [clans, entry?.fromClan?.id, effectiveProgramId],
  );
  const chosen = options.find((c) => c.id === clanId) || null;
  const sameProgram = !!chosen && !!entry?.program && chosen.programId === entry.program.id;

  const close = () => {
    setClanId('');
    setProgramId('');
    onClose();
  };

  return (
    <Drawer
      open={!!entry}
      onClose={close}
      width="md"
      title="Take this mentee into your clan"
      subtitle={entry?.mentee?.name ? `${entry.mentee.name} will move out of ${entry.fromClan?.name || 'their clan'} and into yours.` : undefined}
      footer={(dismiss) => (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button" onClick={dismiss} disabled={busy}
            className="rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button" onClick={() => chosen && onConfirm(chosen.id)}
            disabled={busy || !chosen || !!chosen.full || !chosen.available}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Take them
          </button>
        </div>
      )}
    >
      {entry && (
        <div className="space-y-5">
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-muted/30 p-3.5">
            <Avatar name={entry.mentee?.name} src={entry.mentee?.avatarUrl} size="md" />
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">{entry.mentee?.name}</p>
              <p className="text-sm text-muted-foreground">
                {entry.work.completed} of {entry.work.tasks} tasks done &middot; {entry.program?.name || 'no programme'}
              </p>
            </div>
          </div>

          {entry.handoverNote && (
            <div>
              <p className="text-sm font-medium text-foreground">Note from their mentor</p>
              <blockquote className="mt-1.5 rounded-xl border-l-2 border-brand-300 bg-muted/40 px-3 py-2 text-sm text-foreground">
                {entry.handoverNote}
              </blockquote>
            </div>
          )}

          {!!entry.work.roadmaps?.length && (
            <div>
              <p className="text-sm font-medium text-foreground">Work that will come with them</p>
              <ul className="mt-2 space-y-2">
                {entry.work.roadmaps.map((roadmap) => (
                  <li key={roadmap.id} className="rounded-xl border border-border bg-muted/20 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
                        <MapIcon className="h-4 w-4 shrink-0 text-brand-600" aria-hidden />
                        <span className="truncate">{roadmap.name}</span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">{roadmap.completed} of {roadmap.tasks} done</span>
                    </div>
                    {!!roadmap.recentTasks.length && (
                      <ul className="mt-2 space-y-1 border-t border-border pt-2">
                        {roadmap.recentTasks.slice(0, 4).map((task) => (
                          <li key={task.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                            {task.status === 'completed'
                              ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
                              : <CircleDot className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden />}
                            <span className="truncate">{task.title}</span>
                            <span className="ml-auto shrink-0 capitalize">{task.status.replaceAll('_', ' ')}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!!entry.work.customTasks?.length && (
            <div>
              <p className="text-sm font-medium text-foreground">Custom tasks</p>
              <ul className="mt-2 rounded-xl border border-border bg-muted/20 p-3">
                {entry.work.customTasks.map((task) => (
                  <li key={task.id} className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
                    {task.status === 'completed'
                      ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
                      : <CircleDot className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden />}
                    <span className="truncate">{task.title}</span>
                    <span className="ml-auto shrink-0 capitalize">{task.status.replaceAll('_', ' ')}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <label htmlFor="claim-program" className="text-sm font-medium text-foreground">Programme</label>
            <select
              id="claim-program"
              value={effectiveProgramId}
              onChange={(event) => { setProgramId(event.target.value); setClanId(''); }}
              className="mt-1.5 w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {programs.map((program) => (
                <option key={program.id} value={program.id}>
                  {program.name} · {['completed', 'archived'].includes(program.status || '') ? 'Closed' : program.status === 'published' ? 'Open' : program.status || 'Open'}
                </option>
              ))}
            </select>
          </div>

          <fieldset>
            <legend className="text-sm font-medium text-foreground">Which of your clans?</legend>
            {!options.length ? (
              <p className="mt-2 rounded-xl border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                You have no open clan to take them into. Create one, or reopen a clan&apos;s programme, first.
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {options.map((clan) => (
                  <li key={clan.id}>
                    <label
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors ${
                        clanId === clan.id ? 'border-brand-400 bg-brand-50/60 dark:bg-brand-950/20' : 'border-border hover:bg-muted/50'
                      } ${clan.full || !clan.available ? 'cursor-not-allowed opacity-60' : ''}`}
                    >
                      <input
                        type="radio" name="claim-clan" value={clan.id}
                        checked={clanId === clan.id}
                        disabled={clan.full || !clan.available}
                        onChange={() => setClanId(clan.id)}
                        className="h-4 w-4 accent-brand-600"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">{clan.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {clan.programName || 'No programme'}
                          {' '}· {clan.kind === 'standing' ? 'Standing clan' : 'Cohort clan'}
                          {' '}&middot;{' '}
                          <Users className="inline h-3 w-3" aria-hidden />{' '}
                          {clan.maxMentees ? `${clan.seated} of ${clan.maxMentees} seats` : `${clan.seated} mentees`}
                          {clan.full && ' — full'}
                        </span>
                        {!clan.available && <span className="mt-0.5 block text-xs text-amber-700 dark:text-amber-300">{clan.unavailableReason}</span>}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>

          {/*
            * Said for the clan actually chosen, not in general. Which of these
            * two it is changes what the new mentor receives, so it must not be
            * discovered after the move.
            */}
          {chosen && (
            sameProgram ? (
              <p className="rounded-xl border border-border bg-muted/40 p-3 text-sm leading-6 text-muted-foreground">
                Their work comes with them: every task as it stands, with what they submitted,
                the feedback they were given and their day-by-day log.{' '}
                <span className="text-foreground">{chosen.name}</span> picks up exactly where their
                last mentor left off, and {entry.fromClan?.name || 'the old clan'}&apos;s record is
                left as it is.
              </p>
            ) : (
              <p className="flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-sm leading-6 text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/25 dark:text-amber-100">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>
                  <span className="font-medium">{chosen.name}</span> is on a different programme, so
                  their work cannot come across &mdash; a different roadmap&apos;s tasks would not
                  mean anything here. They start fresh. Their old programme keeps its record.
                </span>
              </p>
            )
          )}
        </div>
      )}
    </Drawer>
  );
}

export default ClaimDrawer;
