'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { CheckCircle2, ExternalLink, Loader2, Search, TriangleAlert, UsersRound } from 'lucide-react';
import { AvatarWithInitials } from '@/components/admin/ui';
import { workspacePath } from '@/lib/services/workspace-scope';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { roundApi, type RoundCandidate, type RoundDetail } from '@/lib/services/round-api';
import { RoundCandidateDrawer } from './RoundCandidateDrawer';
import { Chip, DECISION, EmptyState, PanelHeader, field, nameParts, panel, pts } from '@/components/admin/pools/poolUi';

/**
 * Who is in the round, and what each of them is waiting on.
 *
 * A candidate's level is the only thing an operator changes here, and it is
 * the thing that decides everything else: changing it hands them that level's
 * work, counted from the moment of the change, and leaves what they have
 * already done alone.
 *
 * The row for somebody who has been given NOTHING says why in plain words
 * rather than showing an empty progress line. Two causes, both silent on the
 * candidate's side, both fixable from here or from Work by level.
 */

const NO_WORK: Record<string, { text: string; hint: string }> = {
  no_level: {
    text: 'No level',
    hint: 'They have not been placed at a level, so they have been given nothing and told nothing.',
  },
  no_rule_for_level: {
    text: 'No work for their level',
    hint: 'This round sets no work for that level, so they have been given nothing and told nothing.',
  },
};

/** How far one candidate has got, as a line you can read at a glance. */
function Progress({ work }: { work: RoundCandidate['work'] }) {
  if (!work.assigned) return null;
  const done = work.scored;
  const pct = Math.round((done / work.assigned) * 100);
  return (
    <div className="min-w-32">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-slate-600 tabular-nums">{done} of {work.assigned} approved</span>
        {work.awaitingReview > 0 && <span className="font-medium text-amber-700 tabular-nums">{work.awaitingReview} to review</span>}
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-brand-500 transition-[width]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function RoundCandidates({ data, onChange, canAssign, canReview }: {
  data: RoundDetail; onChange: () => void; canAssign: boolean; canReview: boolean;
}) {
  const { round, candidates } = data;
  /** Who is waiting on an answer about more time, by user id. */
  const waitingOnTime = new Set((data.extensions || []).map((e) => e.candidate?.id).filter(Boolean));
  const [search, setSearch] = useState('');
  const [onlyLevel, setOnlyLevel] = useState('all');
  const [busy, setBusy] = useState<string | null>(null);
  /** Who is open up close: their work, what to give or take back, their requests. */
  const [open, setOpen] = useState<RoundCandidate | null>(null);

  /**
   * The levels you may put somebody at: the intake's, which is where a level
   * comes from in the first place. A round with no intake falls back to the
   * levels its own rules name, so the picker is never empty when work is set.
   */
  const levelOptions = useMemo(() => {
    const fromIntake = (round.cohort?.levels || []).map((l) => ({ key: l.key, label: l.label || l.key }));
    if (fromIntake.length) return fromIntake;
    return [...new Set(round.levelRules.map((r) => r.level))].map((key) => ({ key, label: key }));
  }, [round.cohort, round.levelRules]);

  const labelOf = (key: string | null) => (key ? levelOptions.find((l) => l.key === key)?.label || key : null);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return candidates.filter((c) =>
      (onlyLevel === 'all'
        || (onlyLevel === 'none' ? !c.level : c.level === onlyLevel))
      && (!q || c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)));
  }, [candidates, search, onlyLevel]);

  const setLevel = async (c: RoundCandidate, level: string) => {
    if (!c.userId) return;
    setBusy(c.memberId);
    try {
      const out = await roundApi.setMemberLevel(round.id, c.userId, level || null);
      toast.success(out.assigned
        ? `Level changed. ${out.assigned} piece${out.assigned === 1 ? '' : 's'} of work handed out.`
        : 'Level changed. There is no work set for that level, so nothing was handed out.');
      onChange();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not change the level'));
    } finally {
      setBusy(null);
    }
  };

  const withoutWork = candidates.filter((c) => c.noWorkReason).length;

  return (
    <section className={panel}>
      <PanelHeader
        icon={UsersRound}
        title="Candidates"
        count={candidates.length}
        subtitle={withoutWork
          ? `${withoutWork} of them have been given nothing — the reason is on their row.`
          : 'Everyone in the running. Open one to give them work, take a piece back, or answer a request for more time.'}
        actions={(
          <Link href={workspacePath(`/admin/clans?clan=${round.id}`)} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:text-brand-800">
            Open the clan <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        )}
      />

      <div className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-3 sm:px-6">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email"
            aria-label="Search candidates"
            className={`${field} pl-9`}
          />
        </div>
        <select value={onlyLevel} onChange={(e) => setOnlyLevel(e.target.value)} aria-label="Filter by level" className={`${field} w-auto`}>
          <option value="all">Every level</option>
          {levelOptions.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
          <option value="none">No level</option>
        </select>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          title={candidates.length ? 'Nobody matches' : 'No candidates yet'}
          text={candidates.length
            ? 'Try another search, or a different level.'
            : round.cohort
              ? `Applicants to ${round.cohort.name} arrive here once their level is confirmed.`
              : 'Attach an intake from Manage round, and its applicants arrive here once their level is confirmed.'}
        />
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {shown.map((c) => {
            const reason = c.noWorkReason ? NO_WORK[c.noWorkReason] : null;
            return (
              <li key={c.memberId} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-3.5 sm:px-6">
                <button
                  onClick={() => setOpen(c)}
                  disabled={!c.userId}
                  className="flex min-w-48 flex-1 items-center gap-2.5 rounded-lg text-left transition-opacity hover:opacity-80 disabled:cursor-default"
                >
                  <AvatarWithInitials {...nameParts(c.name, c.email)} email={c.email} size="sm" colorClass="bg-brand-100 text-brand-700" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{c.name || c.email}</p>
                    <p className="truncate text-xs text-muted-foreground">{c.email}</p>
                  </div>
                </button>

                {canAssign && c.userId ? (
                  <div className="flex items-center gap-1.5">
                    <select
                      aria-label={`Level for ${c.name || c.email}`}
                      value={c.level || ''}
                      disabled={busy === c.memberId}
                      onChange={(e) => setLevel(c, e.target.value)}
                      className={`${field} w-40`}
                    >
                      <option value="">No level</option>
                      {levelOptions.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
                      {c.level && !levelOptions.some((l) => l.key === c.level) && <option value={c.level}>{c.level}</option>}
                    </select>
                    {busy === c.memberId && <Loader2 className="h-4 w-4 animate-spin text-brand-600" />}
                  </div>
                ) : (
                  <Chip cls="bg-muted text-slate-600 border-border">{labelOf(c.level) || 'No level'}</Chip>
                )}

                <div className="min-w-32 flex-1">
                  {reason ? (
                    <p className="flex items-start gap-1.5 text-xs text-amber-700">
                      <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span><span className="font-medium">{reason.text}.</span> {reason.hint}</span>
                    </p>
                  ) : (
                    <Progress work={c.work} />
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {c.userId && waitingOnTime.has(c.userId) && (
                    <Chip cls="bg-amber-50 text-amber-700 border-amber-200">Asked for more time</Chip>
                  )}
                  {c.totalScore !== null && (
                    <span className="text-sm font-medium text-slate-700 tabular-nums">{pts(c.totalScore)}</span>
                  )}
                  {c.placementStatus === 'placed' ? (
                    <Chip cls="bg-emerald-50 text-emerald-700 border-emerald-200">
                      <CheckCircle2 className="mr-1 h-3 w-3" /> {c.placedClan?.name || 'Placed'}
                    </Chip>
                  ) : c.decision ? (
                    <Chip cls={DECISION[c.decision]?.cls || ''}>{DECISION[c.decision]?.label || c.decision}</Chip>
                  ) : (
                    <Chip cls="bg-muted text-slate-500 border-border">In the running</Chip>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {open && open.userId && (
        <RoundCandidateDrawer
          round={round}
          candidate={open}
          onClose={() => setOpen(null)}
          onChange={onChange}
          canAssign={canAssign}
          canReview={canReview}
        />
      )}
    </section>
  );
}
