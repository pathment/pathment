'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, ClipboardList, Clock, FileQuestion, GraduationCap, Hourglass, ListTodo, Loader2, Mail, Mic, PenLine, Repeat, RotateCcw, Save, Scale, Search, Send, UserMinus, UserPlus, UserX, Waypoints } from 'lucide-react';
import { toast } from 'sonner';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { Avatar } from '@/components/shared/Avatar';
import { MenteeCarousel } from '@/components/mentor/attendance/MenteeCarousel';
import { qk, useApiQuery } from '@/lib/query';
import { poolApi, type PoolDashboard, type PoolMemberRow, type ReviewQueueItem } from '@/lib/services/pool-api';
import { ReviewDrawer } from './ReviewTab';
import { AssignWorkDrawer } from './AssignWorkDrawer';
import { Chip, DECISION, WORK_SCORE, WORK_STATUS, bucketMeta, fmtDate, pts } from './poolUi';

/**
 * Candidates, reviewed one at a time — the same shape as a mentor's Clan
 * review: a rail of faces to move through, the person in front of you, their
 * work (with review right there), and a side rail for what follows and how
 * they stand.
 *
 * Everything shown comes from what the pool already knows: the dashboard
 * (stage, invitation, decision, placement, each piece of work), the review
 * queue (what to open), and the live scores.
 */

export type CandidateFilter = 'all' | 'review' | 'invite' | 'working' | 'stalled' | 'done' | 'decided' | 'out';
type Filter = CandidateFilter;

const toReviewOf = (m: PoolMemberRow) => m.work.filter((w) => w.status === 'submitted').length;
const isOut = (m: PoolMemberRow) => m.decision === 'withdrawn' || m.decision === 'disqualified';
const MATCH: Record<Filter, (m: PoolMemberRow) => boolean> = {
  all: () => true,
  review: (m) => toReviewOf(m) > 0,
  invite: (m) => m.bucket === 'invite_pending',
  working: (m) => ['not_started', 'in_progress', 'changes_requested', 'needs_review'].includes(m.bucket),
  stalled: (m) => m.bucket === 'stalled',
  done: (m) => m.bucket === 'completed',
  decided: (m) => ['selected', 'waitlisted', 'not_selected'].includes(m.decision || ''),
  out: isOut,
};
const FILTER_LABEL: [Filter, string][] = [
  ['all', 'All'], ['review', 'To review'], ['invite', 'Invite pending'], ['working', 'Working'],
  ['stalled', 'Stalled'], ['done', 'All work done'], ['decided', 'Decided'], ['out', 'Withdrawn'],
];

/** The ring colour says where the person is; the badge says what needs you. */
function ringOf(m: PoolMemberRow) {
  if (isOut(m)) return 'bg-slate-200';
  if (toReviewOf(m)) return 'bg-amber-400';
  if (m.decision === 'selected') return 'bg-emerald-500';
  return {
    invite_pending: 'bg-slate-200', not_started: 'bg-slate-300', in_progress: 'bg-brand-500', needs_review: 'bg-amber-400',
    changes_requested: 'bg-rose-500', completed: 'bg-emerald-500', stalled: 'bg-orange-500', withdrawn: 'bg-slate-200',
  }[m.bucket] || 'bg-slate-300';
}
function badgeOf(m: PoolMemberRow): { cls: string; Icon: typeof Check } | null {
  if (isOut(m)) return { cls: 'bg-slate-400 text-white', Icon: UserMinus };
  if (toReviewOf(m)) return { cls: 'bg-amber-500 text-white', Icon: ClipboardCheck };
  if (m.bucket === 'invite_pending') return { cls: 'bg-slate-400 text-white', Icon: Mail };
  if (m.bucket === 'stalled') return { cls: 'bg-orange-500 text-white', Icon: Hourglass };
  if (m.bucket === 'changes_requested') return { cls: 'bg-rose-500 text-white', Icon: RotateCcw };
  if (m.bucket === 'completed' || m.decision === 'selected') return { cls: 'bg-emerald-500 text-white', Icon: Check };
  return null;
}

/** One face in the rail — the pool's take on the clan review's attendance chip. */
function CandidateChip({ member, active, onClick }: { member: PoolMemberRow; active: boolean; onClick: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [active]);
  const name = member.name || member.email;
  const badge = badgeOf(member);
  const review = toReviewOf(member);
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      title={`${name} · ${review ? `${review} to review` : bucketMeta(member.bucket).label}`}
      aria-pressed={active}
      className={`group/card relative flex shrink-0 snap-start flex-col items-center gap-2 rounded-2xl px-1.5 pb-1.5 pt-2 outline-none transition-colors ${
        active ? 'w-[92px] bg-brand-50/80 dark:bg-brand-500/10' : 'w-[84px]'
      } ${isOut(member) ? 'opacity-60' : ''}`}
    >
      {active && <span aria-hidden className="absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 rounded-[2px] bg-brand-500" />}
      <div className="relative">
        <div className={`rounded-full p-[3px] transition-transform duration-200 group-hover/card:-translate-y-0.5 ${ringOf(member)} ${active ? 'pm-snake pm-snake-ring scale-110 shadow-lg shadow-brand-500/25' : ''}`}>
          <div className="rounded-full bg-card p-0.5">
            <Avatar name={name} size="lg" />
          </div>
        </div>
        {badge && (
          <span className={`absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-card ${badge.cls}`}>
            <badge.Icon className="h-3 w-3" strokeWidth={3} />
          </span>
        )}
      </div>
      <span className={`max-w-full truncate text-xs ${active ? 'rounded-full bg-brand-600 px-2 py-0.5 font-semibold text-white' : 'font-medium text-slate-700 group-hover/card:text-slate-900'}`}>
        {name.split(/[\s@]/)[0]}
      </span>
    </button>
  );
}

const KIND_ICON = { task: ClipboardList, quiz: FileQuestion, interview: Mic, course: GraduationCap } as const;
const iconBtn = 'rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800';

export function CandidateReview({ data, onChange, canManage, canSelect, canReview, canAssign, onAdd, onResend, onExit, onDecide, initialFilter = 'all', workCount = 0, onOpenWork }: {
  data: PoolDashboard;
  /** Where to start, e.g. 'review' when arriving from a "needs review" link. */
  initialFilter?: Filter;
  onChange: () => void;
  canManage: boolean;
  canSelect: boolean;
  canReview: boolean;
  /** Whether this person may hand work out (pool.assign). */
  canAssign: boolean;
  onAdd: () => void;
  onResend: (m: PoolMemberRow) => void;
  onExit: (m: PoolMemberRow, kind: 'withdraw' | 'disqualify') => void;
  onDecide: (m: PoolMemberRow) => void;
  /** How many live pieces of work the round has, for the Work button. */
  workCount?: number;
  /** Opens the round's work. Lives here because this is where it is handed out. */
  onOpenWork?: () => void;
}) {
  const { pool, members, assignments } = data;
  const live = assignments.filter((a) => !a.cancelledAt);
  const queue = useApiQuery({ queryKey: ['pools', pool.id, 'review-queue'], queryFn: () => poolApi.reviewQueue(pool.id), enabled: canReview });
  const scores = useApiQuery({ queryKey: qk.pool.scores(pool.id), queryFn: () => poolApi.scores(pool.id) });

  const [query, setQuery] = useState('');
  const [chosenFilter, setFilter] = useState<Filter>(initialFilter);
  const [adjustDraft, setAdjustDraft] = useState<string | null>(null);
  const [adjustNote, setAdjustNote] = useState('');
  const [giveWork, setGiveWork] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [workTab, setWorkTab] = useState<'review' | 'progress' | 'done'>('review');
  const [reviewing, setReviewing] = useState<ReviewQueueItem | null>(null);
  /**
   * Reviewing the whole round rather than one person's work.
   *
   * A round of four hundred hands in a few hundred pieces, and reaching each
   * one through its candidate is a trip back to a list every single time. In
   * queue mode the drawer steps through everything waiting, in the order it
   * was handed in, and deciding one simply brings up the next.
   */
  const [queueMode, setQueueMode] = useState(false);
  const [clanChoice, setClanChoice] = useState('');
  const [placingNow, setPlacingNow] = useState(false);

  const counts = useMemo(() => Object.fromEntries(FILTER_LABEL.map(([k]) => [k, members.filter(MATCH[k]).length])) as Record<Filter, number>, [members]);
  // A filter with nobody in it has no pill to show it is on, so fall back to everyone.
  const filter: Filter = chosenFilter !== 'all' && !counts[chosenFilter] ? 'all' : chosenFilter;
  // Work waiting for a reviewer comes first, the way the clan review leads with who is unmarked.
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members
      .filter(MATCH[filter])
      .filter((m) => !q || `${m.name} ${m.email}`.toLowerCase().includes(q))
      .sort((a, b) => Number(isOut(a)) - Number(isOut(b)) || toReviewOf(b) - toReviewOf(a));
  }, [members, filter, query]);

  const idx = Math.max(0, list.findIndex((m) => m.id === activeId));
  const member = list[idx] || null;
  const next = list[idx + 1] || null;
  const select = (m: PoolMemberRow | null) => { if (m) { setActiveId(m.id); setWorkTab(toReviewOf(m) ? 'review' : 'progress'); } };

  const score = member ? scores.data?.rows.find((r) => r.memberId === member.id) : undefined;
  const mineQueue = member ? (queue.data || []).filter((q) => q.member.id === member.id) : [];
  const work = member ? live.map((a) => ({ a, w: member.work.find((x) => x.assignmentId === a.id) })) : [];
  const inReview = work.filter(({ w }) => w?.status === 'submitted');
  const inProgress = work.filter(({ w }) => w?.status !== 'submitted' && w?.status !== 'completed');
  const completed = work.filter(({ w }) => w?.status === 'completed');
  const waiting = queue.data || [];
  /**
   * The clans a selected candidate can go into, fetched only when one is on
   * screen. Placing somebody is the last thing that happens to them, and
   * having to leave for another screen to do it is the moment the admin has
   * to remember where they were.
   */
  const placement = useApiQuery({
    queryKey: ['pools', pool.id, 'placement'],
    queryFn: () => poolApi.placementPreview(pool.id),
    enabled: canSelect,
  });
  const reviewList = queueMode ? waiting : mineQueue;
  const reviewIdx = reviewing ? reviewList.findIndex((q) => q.submissionId === reviewing.submissionId) : -1;

  const afterReview = async () => { await Promise.all([queue.refetch(), scores.refetch()]); onChange(); };

  /**
   * One hand adjustment, rather than a parallel scoring lane.
   *
   * There used to be a `manual` score component per pool, each with its own
   * weight, which meant a candidate's total could not be read off their work.
   * A judgement made off the platform — a panel interview, a reference — is
   * now points added to or taken off the total, on its own line, with a note.
   */
  const canScoreByHand = canReview && !!member?.userId && !member?.decision;
  const currentAdjustment = score?.adjustment ?? 0;
  const saveAdjustment = async () => {
    if (!member || adjustDraft === null) return;
    const raw = adjustDraft.trim();
    setSaving(member.id);
    try {
      await poolApi.setAdjustment(pool.id, member.id, {
        score: raw === '' ? null : Number(raw),
        note: adjustNote.trim() || undefined,
      });
      toast.success(raw === '' ? 'Adjustment cleared' : 'Adjustment saved');
      setAdjustDraft(null);
      setAdjustNote('');
      await scores.refetch();
      onChange();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not save the adjustment'));
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Search and the one pool-wide action on top; the filters wrap below,
          so they never squeeze into a scrolling strip. */}
      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a candidate…" aria-label="Search candidates"
              className="w-full rounded-xl border border-slate-200 bg-card py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {/* One way into everything waiting, rather than finding it person
                by person. The count is the backlog, so it reads as a job. */}
            {canReview && waiting.length > 0 && (
              <button
                onClick={() => { setQueueMode(true); setReviewing(waiting[0]); }}
                className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-muted"
              >
                <ClipboardCheck className="h-4 w-4" /> Review queue
                <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-xs font-semibold text-white tabular-nums">{waiting.length}</span>
              </button>
            )}
            {/* The round's work, from where it is given out. It is content,
                not configuration, so it is not filed with the settings. */}
            {onOpenWork && (
              <button
                onClick={onOpenWork}
                className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-muted"
              >
                <ClipboardList className="h-4 w-4" /> Work
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs font-semibold text-slate-600 tabular-nums">{workCount}</span>
              </button>
            )}
            {canManage && pool.status !== 'closed' && (
              <button onClick={onAdd} className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700">
                <UserPlus className="h-4 w-4" /> Add candidates
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter candidates">
          {FILTER_LABEL.filter(([k]) => k === 'all' || counts[k] > 0).map(([k, text]) => {
            const on = filter === k;
            return (
              <button key={k} type="button" onClick={() => setFilter(k)} aria-pressed={on}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  on ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-slate-200 bg-card text-slate-600 hover:border-brand-300 hover:text-brand-700 dark:text-slate-300'
                }`}>
                {text}
                <span className={`rounded-full px-1.5 py-px text-[11px] tabular-nums ${
                  on ? 'bg-white/20 text-white'
                    : k === 'review' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'
                }`}>{counts[k]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* The rail of faces. */}
      <div className="rounded-2xl border border-slate-200 bg-card">
        {list.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500">
            {members.length ? 'No candidates match this search or filter.' : 'No candidates yet. Add people by email, from a CSV, or from Intake.'}
          </div>
        ) : (
          <MenteeCarousel>
            {list.map((m) => <CandidateChip key={m.id} member={m} active={m.id === member?.id} onClick={() => select(m)} />)}
          </MenteeCarousel>
        )}
      </div>

      {member && (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main */}
          <div className="space-y-5 lg:col-span-2">
            {/* The candidate */}
            <div className="rounded-2xl border border-slate-200 bg-card p-4 sm:p-5">
              <div className="flex flex-col items-start justify-between gap-3 sm:flex-row">
                <div className="flex w-full min-w-0 items-start gap-3 sm:w-auto">
                  <Avatar name={member.name || member.email} size="lg" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-base font-semibold text-slate-900 sm:text-lg">{member.name || member.email}</h2>
                      {(() => { const b = bucketMeta(member.bucket); return (
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${b.cls}`}><span className={`h-1.5 w-1.5 rounded-full ${b.dot}`} />{b.label}</span>
                      ); })()}
                      {member.decision && DECISION[member.decision] && <Chip cls={DECISION[member.decision].cls}>{DECISION[member.decision].label}</Chip>}
                      {member.invite?.expired && !member.userId && <Chip cls="bg-rose-50 text-rose-700 border-rose-200">Invitation expired</Chip>}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-slate-500">
                      {member.email} · {member.source === 'application' ? 'From Intake' : 'Added by email'} · {member.userId ? 'Account active' : 'No account yet'}
                    </div>
                  </div>
                </div>
                <div className="flex w-full shrink-0 items-center justify-end gap-1 border-t border-slate-100 pt-2 sm:w-auto sm:border-t-0 sm:pt-0">
                  {canManage && !member.userId && !member.decision && (
                    <button onClick={() => onResend(member)} title="Resend invitation" aria-label="Resend invitation" className={iconBtn}><Mail className="h-4 w-4" /></button>
                  )}
                  {canSelect && ['selected', 'waitlisted', 'not_selected'].includes(member.decision || '') && member.placementStatus !== 'placed' && (
                    <button onClick={() => onDecide(member)} title="Change decision" aria-label="Change decision" className={iconBtn}><Repeat className="h-4 w-4" /></button>
                  )}
                  {canManage && !isOut(member) && member.placementStatus !== 'placed' && (<>
                    <button onClick={() => onExit(member, 'withdraw')} title="Withdraw" aria-label="Withdraw" className={iconBtn}><UserMinus className="h-4 w-4" /></button>
                    <button onClick={() => onExit(member, 'disqualify')} title="Disqualify" aria-label="Disqualify" className={`${iconBtn} hover:bg-rose-50 hover:text-rose-600`}><UserX className="h-4 w-4" /></button>
                  </>)}
                  <span className="ml-1 text-xs tabular-nums text-slate-400">{idx + 1} of {list.length}</span>
                  <button onClick={() => select(list[idx - 1])} disabled={idx === 0} aria-label="Previous candidate" className={`${iconBtn} disabled:opacity-30`}><ChevronLeft className="h-4 w-4" /></button>
                  <button onClick={() => select(next)} disabled={!next} aria-label="Next candidate" className={`${iconBtn} disabled:opacity-30`}><ChevronRight className="h-4 w-4" /></button>
                </div>
              </div>

              {/* Two bars, like the clan review's progress pair: how much is done, and where it puts them. */}
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {[
                  { label: 'Work approved', pct: live.length ? (completed.length / live.length) * 100 : 0, text: `${completed.length}/${live.length}`, cls: 'bg-brand-600' },
                  {
                    label: 'Points earned',
                    pct: score && score.possible ? (score.total / score.possible) * 100 : 0,
                    text: score ? `${score.total}/${score.possible}` : live.length ? '-' : 'No work yet',
                    cls: 'bg-emerald-500',
                  },
                ].map((bar) => (
                  <div key={bar.label}>
                    <p className="mb-1 text-xs text-slate-500">{bar.label}</p>
                    <div className="relative h-6 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div className={`h-full rounded-full ${bar.cls}`} style={{ width: `${Math.min(100, Math.max(0, bar.pct))}%` }} />
                      <span className={`absolute inset-y-0 right-2 flex items-center text-xs font-semibold tabular-nums ${bar.pct > 85 ? 'text-white' : 'text-slate-600'}`}>{bar.text}</span>
                    </div>
                  </div>
                ))}
              </div>
              {member.bucket === 'stalled' && <p className="mt-2 text-xs text-slate-500">No activity for a while. A reminder goes out on its own if reminders are on.</p>}
            </div>

            {/* Their work, with review right here. */}
            <div className="rounded-2xl border border-slate-200 bg-card">
              <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 px-3 py-2.5 sm:px-4" role="tablist" aria-label="This candidate's work">
                {([
                  { key: 'review' as const, label: 'To review', count: inReview.length, icon: ClipboardCheck },
                  { key: 'progress' as const, label: 'In progress', count: inProgress.length, icon: ListTodo },
                  { key: 'done' as const, label: 'Approved', count: completed.length, icon: CheckCircle2 },
                ]).map((t) => (
                  <button key={t.key} type="button" role="tab" aria-selected={workTab === t.key} onClick={() => setWorkTab(t.key)}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors ${workTab === t.key ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:hover:bg-slate-800'}`}>
                    <t.icon className={`h-4 w-4 ${workTab === t.key ? 'text-brand-600' : 'text-slate-400'}`} aria-hidden />
                    {t.label}
                    {t.count > 0 && (
                      <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${t.key === 'review' ? 'bg-brand-600 text-white' : t.key === 'done' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{t.count}</span>
                    )}
                  </button>
                ))}
                {/*
                  * Giving work to ONE candidate, from where their work is.
                  * The Work tab hands a piece out to everybody; this is the
                  * other direction — somebody joined late, or owes an extra
                  * interview, and only they should get it.
                  */}
                {canAssign && !member.decision && member.userId && pool.status !== 'closed' && (
                  <button
                    type="button"
                    onClick={() => setGiveWork(true)}
                    className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:border-brand-300 hover:text-brand-700"
                  >
                    <Send className="h-3.5 w-3.5" aria-hidden="true" /> Give work
                  </button>
                )}
              </div>

              <div className="p-4">
                {workTab === 'review' && (
                  inReview.length === 0 ? (
                    <p className="flex items-center gap-2 px-1 py-2 text-sm text-slate-500"><CheckCircle2 className="h-4 w-4 text-emerald-400" />Nothing waiting. All clear.</p>
                  ) : (
                    <div className="space-y-2">
                      {inReview.map(({ a, w }) => {
                        const item = mineQueue.find((q) => q.taskId === w?.taskId);
                        const Icon = KIND_ICON[a.kind];
                        return (
                          <button key={a.id} type="button" disabled={!item || !canReview} onClick={() => item && setReviewing(item)}
                            className="group flex w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-left transition-colors hover:border-brand-300 disabled:cursor-default disabled:hover:border-slate-200">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-500/15"><Icon className="h-4 w-4 text-brand-600" /></span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-slate-900">{a.title}</p>
                              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                <span className="capitalize">{a.kind}</span>
                                {item && item.version > 1 && <span>v{item.version}</span>}
                                {w?.isLate && <span className="inline-flex items-center gap-1 text-red-600"><Clock className="h-3 w-3" />late</span>}
                              </div>
                            </div>
                            {canReview ? (
                              <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white group-hover:bg-brand-700">
                                {item ? <>Review &amp; decide <ChevronRight className="h-3.5 w-3.5" /></> : <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                              </span>
                            ) : <span className="shrink-0 text-xs text-slate-400">Waiting for a reviewer</span>}
                          </button>
                        );
                      })}
                    </div>
                  )
                )}

                {workTab !== 'review' && (() => {
                  const rows = workTab === 'progress' ? inProgress : completed;
                  if (!live.length) return <p className="px-1 py-2 text-sm text-slate-500">No work in this pool yet. Add it from the Work tab.</p>;
                  if (!rows.length) return <p className="px-1 py-2 text-sm text-slate-500">{workTab === 'progress' ? 'Nothing open. Everything is handed in or approved.' : 'Nothing approved yet.'}</p>;
                  return (
                    <div className="space-y-1.5">
                      {rows.map(({ a, w }) => {
                        const s = w?.status ? WORK_STATUS[w.status] : null;
                        const worth = a.points;
                        const Icon = KIND_ICON[a.kind];
                        return (
                          <div key={a.id} className="flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-2.5 dark:border-slate-800">
                            <Icon className="h-4 w-4 shrink-0 text-slate-400" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm text-slate-800">{a.title}</p>
                              <p className="truncate text-[11px] text-slate-500">
                                Worth {pts(worth)}{a.required ? '' : ' · optional'}
                                {w?.dueDate && ` · due ${fmtDate(w.dueDate)}`}
                                {w?.isLate && ' · late'}
                              </p>
                            </div>
                            <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-slate-600">
                              <span className={`h-2 w-2 rounded-full ${s?.dot || 'bg-slate-200'}`} />{s?.label || 'Not given yet'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* Side rail */}
          <div className="space-y-4">
            {next && (
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-card p-3">
                <Avatar name={next.name || next.email} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Up next</p>
                  <button type="button" onClick={() => select(next)} className="block max-w-full truncate text-sm font-medium text-slate-900 hover:text-brand-700">{next.name || next.email}</button>
                </div>
                <button onClick={() => select(next)} aria-label="Next candidate" className="shrink-0 rounded-lg border border-slate-200 p-2 text-slate-500 transition-colors hover:border-brand-300 hover:text-brand-700">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* How they score, part by part. */}
            <div className="rounded-2xl border border-slate-200 bg-card p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="flex items-center gap-2 font-semibold text-slate-900"><Scale className="h-4 w-4 text-brand-600" />Score</h3>
                {score && <span className="text-xs text-slate-500">Rank <span className="font-semibold text-slate-800">#{score.rank}</span> of {scores.data?.rows.length}</span>}
              </div>
              {!live.length ? (
                <p className="text-sm text-slate-500">No work in this pool yet, so there is nothing to score. Add it on the Work tab.</p>
              ) : !score ? (
                <p className="text-sm text-slate-500">{scores.loading ? 'Loading…' : 'Not scored.'}</p>
              ) : (
                <>
                  <div className="space-y-2 text-sm">
                    {score.components.map((c) => {
                      const state = WORK_SCORE[c.status];
                      return (
                        <div key={c.key} className="flex items-center justify-between gap-3">
                          <span className="min-w-0 truncate text-slate-600">
                            {c.label}
                            <span className="text-xs text-slate-400"> · {c.points} pts{c.required ? '' : ' · optional'}</span>
                          </span>
                          <span className={`shrink-0 tabular-nums ${c.status === 'scored' ? 'font-medium text-slate-900' : `text-xs ${state?.cls || 'text-slate-500'}`}`}>
                            {c.status === 'scored' ? `${c.earned}/${c.points}` : state?.label || c.status}
                          </span>
                        </div>
                      );
                    })}
                    {currentAdjustment !== 0 && (
                      <div className="flex items-center justify-between gap-3 border-t border-dashed border-slate-200 pt-2">
                        <span className="min-w-0 truncate text-slate-600">
                          Adjustment
                          {score.adjustmentNote && <span className="block truncate text-[11px] text-slate-400">&ldquo;{score.adjustmentNote}&rdquo;</span>}
                        </span>
                        <span className={`shrink-0 font-medium tabular-nums ${currentAdjustment > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {currentAdjustment > 0 ? '+' : ''}{currentAdjustment}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3 text-sm">
                    <span className="text-slate-500">Total</span>
                    <span className="font-semibold tabular-nums text-slate-900">{score.total} <span className="font-normal text-slate-400">of {score.possible} pts</span></span>
                  </div>
                </>
              )}

              {/* One hand adjustment, for a judgement made off the platform. */}
              {canReview && member && (
                <div className="mt-4 space-y-2.5 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                    <PenLine className="h-3.5 w-3.5" />Adjustment
                    <span className="font-normal text-slate-400">· points on top, or off</span>
                  </p>
                  {canScoreByHand ? (
                    adjustDraft === null ? (
                      <button
                        type="button"
                        onClick={() => { setAdjustDraft(currentAdjustment ? String(currentAdjustment) : ''); setAdjustNote(score?.adjustmentNote || ''); }}
                        className="w-full rounded-lg border border-slate-200 bg-card px-3 py-2 text-left text-sm text-slate-700 hover:border-brand-300 hover:text-brand-700"
                      >
                        {currentAdjustment ? `${currentAdjustment > 0 ? '+' : ''}${currentAdjustment} pts, change it` : 'Add an adjustment'}
                      </button>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            autoFocus
                            value={adjustDraft}
                            aria-label="Points adjustment"
                            placeholder="e.g. 5 or -5"
                            onChange={(e) => setAdjustDraft(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') void saveAdjustment(); if (e.key === 'Escape') setAdjustDraft(null); }}
                            className="w-24 rounded-lg border border-slate-300 bg-card px-2.5 py-1.5 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-500"
                          />
                          <span className="text-xs text-slate-500">pts</span>
                        </div>
                        <input
                          value={adjustNote}
                          aria-label="Why"
                          placeholder="Why? It is shown with the number"
                          onChange={(e) => setAdjustNote(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') void saveAdjustment(); }}
                          className="w-full rounded-lg border border-slate-300 bg-card px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                        />
                        <div className="flex gap-2">
                          <button onClick={saveAdjustment} disabled={saving === member.id} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50">
                            {saving === member.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
                          </button>
                          <button onClick={() => setAdjustDraft(null)} className="rounded-lg px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700">Cancel</button>
                        </div>
                      </div>
                    )
                  ) : (
                    <p className="text-[11px] text-slate-400">
                      {member.decision ? 'A decision is made, so scores are final.' : 'Can be adjusted once they have joined.'}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Where the decision and placement stand. */}
            <div className="rounded-2xl border border-slate-200 bg-card p-5">
              <h3 className="mb-3 flex items-center gap-2 font-semibold text-slate-900"><Waypoints className="h-4 w-4 text-brand-600" />Decision</h3>
              {member.decision && DECISION[member.decision] ? (
                <div className="space-y-2 text-sm">
                  <Chip cls={DECISION[member.decision].cls}>{DECISION[member.decision].label}</Chip>
                  {member.decisionReason && <p className="text-xs text-slate-500">&ldquo;{member.decisionReason}&rdquo;</p>}
                </div>
              ) : isOut(member) ? (
                <p className="text-sm text-slate-500">Out of this round{member.decisionReason ? `: “${member.decisionReason}”` : '.'}</p>
              ) : (
                <p className="text-sm text-slate-500">{score?.proposedOutcome ? <>Proposed: <span className="font-medium text-slate-700">{DECISION[score.proposedOutcome]?.label}</span>, once the shortlist is confirmed.</> : 'Not decided yet. Decisions come from the shortlist.'}</p>
              )}
              {member.placementStatus === 'placed' && member.placedClan && <p className="mt-2 text-xs text-emerald-700">Placed in {member.placedClan.name}</p>}
              {member.placementStatus === 'pending' && member.targetClan && <p className="mt-2 text-xs text-slate-500">Planned for {member.targetClan.name}</p>}
              {member.placementStatus === 'failed' && <p className="mt-2 text-xs text-rose-600">{member.placementError}</p>}

              {/* Place them, here, rather than on a screen of their own. */}
              {canSelect && member.decision === 'selected' && member.placementStatus !== 'placed' && (
                <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
                  <label htmlFor="place-clan" className="text-xs font-medium text-slate-600">Place in a clan</label>
                  <select
                    id="place-clan"
                    value={clanChoice || member.targetClan?.id || ''}
                    onChange={(e) => setClanChoice(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-card px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="">Choose a clan</option>
                    {(placement.data?.clans || []).map((c) => (
                      <option key={c.id} value={c.id} disabled={Boolean(c.problem)}>{c.name}{c.problem ? ` (${c.problem})` : ''}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={placingNow || !(clanChoice || member.targetClan?.id)}
                    onClick={async () => {
                      const clanId = clanChoice || member.targetClan?.id || '';
                      if (!clanId) return;
                      setPlacingNow(true);
                      try {
                        await poolApi.setTargets(pool.id, [{ memberId: member.id, clanId }]);
                        const out = await poolApi.place(pool.id, [member.id]);
                        if (out.summary.failed) toast.warning('Could not place them. The reason is on this card.');
                        else toast.success('Placed');
                        setClanChoice('');
                        await Promise.all([placement.refetch(), scores.refetch()]);
                        onChange();
                      } catch (e) {
                        toast.error(extractApiErrorMessage(e, 'Could not place this candidate'));
                      } finally {
                        setPlacingNow(false);
                      }
                    }}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
                  >
                    {placingNow ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Waypoints className="h-3.5 w-3.5" />}
                    {member.placementStatus === 'failed' ? 'Try again' : 'Place them'}
                  </button>
                </div>
              )}
            </div>

            {/* Only while they have not joined. */}
            {!member.userId && !isOut(member) && (
              <div className="rounded-2xl border border-slate-200 bg-card p-5">
                <h3 className="mb-2 flex items-center gap-2 font-semibold text-slate-900"><Mail className="h-4 w-4 text-brand-600" />Invitation</h3>
                <p className="text-sm text-slate-500">
                  {member.invite?.expired ? 'Expired. They have not created an account.' : member.invite ? `Sent. Valid until ${fmtDate(member.invite.expiresAt)}.` : 'Not sent yet.'}
                </p>
                {canManage && !member.decision && (
                  <button onClick={() => onResend(member)} className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:border-brand-300 hover:text-brand-700">
                    <Mail className="h-4 w-4" /> Resend invitation
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {giveWork && member && (
        <AssignWorkDrawer
          data={data}
          member={member}
          onClose={() => setGiveWork(false)}
          onDone={async () => { await scores.refetch(); onChange(); }}
        />
      )}

      {reviewing && (
        <ReviewDrawer
          poolId={pool.id}
          item={reviewing}
          onClose={() => { setReviewing(null); setQueueMode(false); }}
          onReviewed={queueMode ? () => {
            // Work out the next one from the list as it stands now: the refetch
            // that follows drops the one just decided, so an index would skip.
            const i = reviewList.findIndex((q) => q.submissionId === reviewing?.submissionId);
            const upcoming = reviewList[i + 1] || null;
            setReviewing(upcoming);
            if (!upcoming) { setQueueMode(false); toast.success('That is everything reviewed'); }
          } : undefined}
          onDone={afterReview}
          next={reviewList.length > 1 && reviewIdx >= 0 ? { onClick: () => setReviewing(reviewList[reviewIdx + 1]), disabled: reviewIdx >= reviewList.length - 1, position: `${reviewIdx + 1} of ${reviewList.length}` } : undefined}
          prev={reviewList.length > 1 && reviewIdx >= 0 ? { onClick: () => setReviewing(reviewList[reviewIdx - 1]), disabled: reviewIdx <= 0 } : undefined}
        />
      )}
    </div>
  );
}
