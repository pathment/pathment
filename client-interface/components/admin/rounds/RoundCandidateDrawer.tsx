'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { CalendarClock, Check, Loader2, Plus, Trash2, X } from 'lucide-react';
import { Drawer } from '@/components/shared/Drawer';
import { qk, useApiQuery, useInvalidate } from '@/lib/query';
import { useConfirm } from '@/lib/context/ConfirmContext';
import { poolApi } from '@/lib/services/pool-api';
import { roundApi, type RoundCandidate, type RoundDetail } from '@/lib/services/round-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { Chip, Spinner, field, fmtDate, label as labelCls, primaryBtn, pts, secondaryBtn } from '@/components/admin/pools/poolUi';

/**
 * One candidate, up close: what they are doing, what you can give them or take
 * back, and whether they have asked for more time.
 *
 * The same three things a mentor does in a clan. A round reuses the clan's
 * machinery for all of it — these are ordinary assigned tasks, taken back the
 * ordinary way, and a request for more time is the ordinary deadline flow —
 * so the only thing new here is a screen that reaches them inside a round.
 *
 * Giving work is the EXCEPTION, not the rule. What a level does is set once in
 * Work by level; this is for the one person who needs something else, and it
 * says so rather than pretending it is the main way work is handed out.
 */

const STATUS: Record<string, { label: string; cls: string }> = {
  assigned: { label: 'To do', cls: 'bg-muted text-slate-600 border-border' },
  not_started: { label: 'To do', cls: 'bg-muted text-slate-600 border-border' },
  in_progress: { label: 'In progress', cls: 'bg-brand-50 text-brand-700 border-brand-200' },
  submitted: { label: 'Needs review', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  revision_needed: { label: 'Changes requested', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  completed: { label: 'Approved', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

export function RoundCandidateDrawer({ round, candidate, onClose, onChange, canAssign, canReview }: {
  round: RoundDetail['round'];
  candidate: RoundCandidate;
  onClose: () => void;
  onChange: () => void;
  canAssign: boolean;
  canReview: boolean;
}) {
  const confirm = useConfirm();
  const invalidate = useInvalidate();
  const [giving, setGiving] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const userId = candidate.userId || '';
  const { data, loading, refetch } = useApiQuery({
    queryKey: qk.round.candidateWork(round.id, userId),
    queryFn: () => roundApi.candidateWork(round.id, userId),
    enabled: Boolean(userId),
    errorMessage: 'Could not load their work',
  });
  const options = useApiQuery({
    queryKey: ['pools', 'options', round.programId],
    queryFn: () => poolApi.options(round.programId),
    enabled: canAssign,
  });

  const reload = async () => {
    await refetch();
    invalidate(qk.round.detail(round.id));
    onChange();
  };

  const give = async () => {
    if (!giving) return;
    setBusy('give');
    try {
      const out = await roundApi.giveWork(round.id, userId, { roadmapId: giving });
      toast[out.assigned ? 'success' : 'info'](out.assigned
        ? `${out.assigned} piece${out.assigned === 1 ? '' : 's'} of work given. The clock starts now.`
        : 'They already hold every step of that work.');
      setGiving('');
      await reload();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not give that work'));
    } finally {
      setBusy(null);
    }
  };

  const takeBack = async (taskId: string, title: string) => {
    const ok = await confirm({
      title: `Take back “${title}”?`,
      description: 'It disappears from their list. Anything they have already handed in for it is kept, and a course seat is released.',
      confirmLabel: 'Take it back',
    });
    if (!ok) return;
    setBusy(taskId);
    try {
      await roundApi.takeWorkBack(round.id, taskId);
      toast.success('Taken back');
      await reload();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not take that work back'));
    } finally {
      setBusy(null);
    }
  };

  const answer = async (submissionId: string, approved: boolean) => {
    setBusy(submissionId);
    try {
      await roundApi.answerExtension(round.id, submissionId, approved);
      toast.success(approved ? 'More time granted — their deadline has moved' : 'Request declined');
      await reload();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not answer that request'));
    } finally {
      setBusy(null);
    }
  };

  const pending = (data?.extensions || []).filter((e) => e.status === 'pending');
  const answered = (data?.extensions || []).filter((e) => e.status !== 'pending');

  return (
    <Drawer open onClose={onClose} title={candidate.name || candidate.email} subtitle={round.name} width="lg">
      {loading && !data ? <Spinner /> : (
        <div className="space-y-6">
          {/* Who they are in this round. */}
          <div className="flex flex-wrap items-center gap-2">
            <Chip cls="bg-muted text-slate-600 border-border">{candidate.level || 'No level'}</Chip>
            {candidate.decision
              ? <Chip cls="bg-brand-50 text-brand-700 border-brand-200">{candidate.decision.replace('_', ' ')}</Chip>
              : <Chip cls="bg-muted text-slate-500 border-border">In the running</Chip>}
            {candidate.totalScore !== null && <span className="text-sm text-slate-600 tabular-nums">{pts(candidate.totalScore)}</span>}
          </div>

          {/* Asked for more time — first, because it is the only thing here
              that is waiting on a person. */}
          {pending.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Asked for more time</h3>
              <ul className="mt-2 space-y-2">
                {pending.map((e) => (
                  <li key={e.id} className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                    <p className="flex items-center gap-2 text-sm font-medium text-slate-800">
                      <CalendarClock className="h-4 w-4 text-amber-600" aria-hidden="true" />
                      {e.days} extra day{e.days === 1 ? '' : 's'}
                    </p>
                    {e.reason && <p className="mt-1 text-sm text-slate-700">&ldquo;{e.reason}&rdquo;</p>}
                    {canReview && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button onClick={() => answer(e.id, true)} disabled={busy === e.id} className={primaryBtn}>
                          {busy === e.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Grant
                        </button>
                        <button onClick={() => answer(e.id, false)} disabled={busy === e.id} className={secondaryBtn}>
                          <X className="h-4 w-4" /> Decline
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Their work. */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Their work</h3>
            {!data?.work.length ? (
              <p className="mt-2 rounded-xl border border-border bg-muted/50 px-4 py-3 text-sm text-slate-600">
                {candidate.noWorkReason === 'no_level'
                  ? 'They have no level, so they have been given nothing — and told nothing. Set their level on the Candidates tab.'
                  : candidate.noWorkReason === 'no_rule_for_level'
                    ? `This round sets no work for ${candidate.level}, so they have been given nothing — and told nothing. Set it in Work by level, or give them something here.`
                    : 'Nothing yet.'}
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-border overflow-hidden rounded-xl border border-border">
                {data.work.map((w) => (
                  <li key={w.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">{w.title}</p>
                      <p className="text-xs text-muted-foreground">
                        Due {fmtDate(w.dueDate)}{w.points !== null ? ` · worth ${pts(w.points)}` : ''}
                      </p>
                    </div>
                    <Chip cls={STATUS[w.status]?.cls || 'bg-muted text-slate-600 border-border'}>
                      {STATUS[w.status]?.label || w.status}
                    </Chip>
                    {canAssign && (
                      <button
                        onClick={() => takeBack(w.id, w.title)}
                        disabled={busy === w.id}
                        aria-label={`Take back ${w.title}`}
                        className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                      >
                        {busy === w.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Give them something extra. */}
          {canAssign && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Give them something else</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                On top of what their level gives them. Each step keeps its own &ldquo;due N days after it is handed out&rdquo;,
                counted from now.
              </p>
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <div className="min-w-56 flex-1">
                  <label className={labelCls} htmlFor="give-work">Work</label>
                  <select id="give-work" value={giving} onChange={(e) => setGiving(e.target.value)} className={field}>
                    <option value="">Choose a roadmap</option>
                    {(options.data?.roadmaps || []).map((r) => (
                      <option key={r.id} value={r.id}>{r.name} · {r.stepCount} step{r.stepCount === 1 ? '' : 's'}</option>
                    ))}
                  </select>
                </div>
                <button onClick={give} disabled={!giving || busy === 'give'} className={primaryBtn}>
                  {busy === 'give' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Give it
                </button>
              </div>
            </section>
          )}

          {answered.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Earlier requests</h3>
              <ul className="mt-2 space-y-2">
                {answered.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-4 py-2.5 text-sm">
                    <span className="text-slate-700">{e.days} day{e.days === 1 ? '' : 's'}{e.reason ? ` — “${e.reason}”` : ''}</span>
                    <Chip cls={e.status === 'approved'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-slate-100 text-slate-600 border-slate-200'}
                    >
                      {e.status === 'approved' ? 'Granted' : 'Declined'}
                    </Chip>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </Drawer>
  );
}
