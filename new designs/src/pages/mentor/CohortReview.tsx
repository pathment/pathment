import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  RotateCcw,
  XCircle,
  MessageSquarePlus,
  Flag,
  Send,
  X,
  ClipboardCheck,
  ArrowUpRight,
  Keyboard,
  MessageSquare,
  Eye,
  UserCheck,
  UserX,
  CalendarClock,
  Check,
  SkipForward,
  Clock,
  Link as LinkIcon,
  Undo2,
  Plus,
} from 'lucide-react';
import { Page } from '@/components/Page';
import { useStore } from '@/store/AppStore';
import { AISummary } from '@/components/AISummary';
import { DualProgress } from '@/components/DualProgress';
import { ReviewDrawer } from '@/components/ReviewDrawer';
import { OneOnOneDrawer } from '@/components/OneOnOneDrawer';
import { Modal, Field, TextArea } from '@/components/overlays';
import {
  Avatar,
  Badge,
  Button,
  Card,
  MomentumIcon,
  RISK_META,
  RiskDot,
  SectionLabel,
  STATUS_META,
  TASK_TYPE_LABEL,
  FRICTION_META,
  cx,
} from '@/lib/ui';
import type { Task, AttendanceStatus, Mentee, DelayEvent } from '@/lib/types';
import { DELAY_CATEGORY_META, SLOT_META, SLOT_ORDER, TYPE_DEFAULT_SLOT } from '@/lib/ai';
import { Sunrise, Sun, Moon } from 'lucide-react';
import type { ScheduleSlot } from '@/lib/types';

/* Find the delay/extension reason that matches a task (by first word of the
   logged task name) — same heuristic the ReviewDrawer uses. */
function findDelay(m: Mentee, task: Task): DelayEvent | undefined {
  return (
    m.delays.find((d) =>
      task.title.toLowerCase().includes(d.task.toLowerCase().split(' ')[0]),
    ) ?? m.delays[0]
  );
}

/* ----------------------------------------------------------------
   Submission row — quick approve for speed, plus a prominent "Review"
   that opens the detailed side drawer (brief, artifact, checklist,
   approve / approve+notes / request-changes / reject).
----------------------------------------------------------------- */
function PendingRow({
  task,
  focused = false,
  onFocus,
  onApprove,
  onOpenFull,
  onViewFile,
}: {
  task: Task;
  focused?: boolean;
  onFocus?: () => void;
  onApprove: () => void;
  onOpenFull: () => void;
  onViewFile: () => void;
}) {
  return (
    <div
      onMouseEnter={onFocus}
      className={cx(
        'rounded-r border transition-colors',
        focused ? 'border-ink ring-1 ring-ink' : 'border-hairline',
      )}
    >
      <div className="flex items-center gap-3 p-3">
        <ClipboardCheck className={cx('h-4 w-4 shrink-0', focused ? 'text-ink' : 'text-brand-500')} />
        <button onClick={onOpenFull} className="min-w-0 flex-1 text-left">
          <div className="truncate text-sm font-medium text-ink">{task.title}</div>
          <div className="flex flex-wrap items-center gap-x-2 text-xs text-ink-mute">
            <span>{TASK_TYPE_LABEL[task.type]} · submitted {task.submittedAt}</span>
            {task.late && <span className="text-[#FF3B30]">late</span>}
            {task.roadmapId && <span className="text-brand-600">roadmap</span>}
          </div>
        </button>
        {/* quick approve for speed; Review opens the detailed drawer */}
        <div className="flex shrink-0 items-center gap-1.5">
          {task.artifact && (
            <button
              onClick={onViewFile}
              title="Open submitted file (V)"
              className="rounded-r inline-flex h-8 items-center gap-1 border border-hairline px-2 font-mono text-[11px] text-brand-700 transition-colors hover:border-ink"
            >
              <LinkIcon className="h-3.5 w-3.5" /> File
            </button>
          )}
          <Button variant="success" size="sm" onClick={onApprove}>
            <CheckCircle2 className="h-4 w-4" /> Approve
          </Button>
          <Button size="sm" onClick={onOpenFull}>
            <Eye className="h-4 w-4" /> Review
          </Button>
        </div>
      </div>
    </div>
  );
}

const ATT_META: Record<AttendanceStatus, { label: string; icon: typeof UserCheck; tone: string }> = {
  present: { label: 'Present', icon: UserCheck, tone: 'border-emerald-200 text-emerald-700' },
  absent: { label: 'Not present', icon: UserX, tone: 'border-rose-200 text-[#FF3B30]' },
  excused: { label: 'Excused', icon: CalendarClock, tone: 'border-amber-200 text-amber-700' },
};

export function CohortReview() {
  const navigate = useNavigate();
  const { mentees, logMeeting, quickAction, unreview, markAttendance, getAttendance, resolveBlocker, addBlocker, getSchedule } =
    useStore();
  const [i, setI] = useState(0);
  const [note, setNote] = useState('');
  const [noted, setNoted] = useState<Record<number, boolean>>({});
  const [reviewTask, setReviewTask] = useState<Task | null>(null);
  const [oneOnOne, setOneOnOne] = useState(false);
  const [seen, setSeen] = useState<Set<number>>(new Set([0]));
  // deferred = mentees skipped to come back to later (e.g. late joiners)
  const [deferred, setDeferred] = useState<Set<number>>(new Set());
  // focused submission index — J/K cycles through this mentee's submissions
  const [focus, setFocus] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const [addBlocker_, setAddBlocker] = useState(false);
  const [blockerText, setBlockerText] = useState('');

  const m = mentees[i];
  const pending = useMemo(() => m.tasks.filter((t) => t.status === 'submitted'), [m]);
  const reviewedHere = useMemo(() => m.tasks.filter((t) => t.review), [m]);
  const extensions = useMemo(() => m.tasks.filter((t) => t.extensionRequested), [m]);
  const attendance = getAttendance(m.id);
  const focused = pending[focus] ?? pending[0];
  const schedule = getSchedule(m.id);

  // Group this mentee's review tasks by their schedule slot (Morning → Lunch →
  // Dinner → Anytime). A task's slot is its own slot, else its type's default.
  const slotOf = (t: Task): ScheduleSlot => t.slot ?? TYPE_DEFAULT_SLOT[t.type];
  const slotGroups = useMemo(() => {
    const buckets: Record<ScheduleSlot, { pending: Task[]; reviewed: Task[] }> = {
      morning: { pending: [], reviewed: [] },
      lunch: { pending: [], reviewed: [] },
      dinner: { pending: [], reviewed: [] },
      anytime: { pending: [], reviewed: [] },
    };
    pending.forEach((t) => buckets[slotOf(t)].pending.push(t));
    reviewedHere.forEach((t) => buckets[slotOf(t)].reviewed.push(t));
    return buckets;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, reviewedHere]);

  const go = (idx: number) => {
    setFocus(0);
    setNote('');
    setI(idx);
    setSeen((s) => new Set(s).add(idx));
    setDeferred((d) => {
      if (!d.has(idx)) return d;
      const next = new Set(d);
      next.delete(idx); // returning to a deferred mentee clears their deferral
      return next;
    });
  };

  // advance to the next mentee who hasn't been deferred; fall through to plain next
  const nextNonDeferred = (from: number) => {
    for (let k = from + 1; k < mentees.length; k++) if (!deferred.has(k)) return k;
    for (let k = 0; k < mentees.length; k++) if (!deferred.has(k) && k !== i) return k;
    return Math.min(from + 1, mentees.length - 1);
  };
  const next = () => go(nextNonDeferred(i));
  const prev = () => go(Math.max(i - 1, 0));

  // skip current mentee — defer them and jump to the next person
  const skip = () => {
    setDeferred((d) => new Set(d).add(i));
    const target = nextNonDeferred(i);
    setFocus(0);
    setNote('');
    setI(target);
    setSeen((s) => new Set(s).add(target));
  };

  const openFile = (artifact?: string) => {
    if (!artifact) return;
    window.open(`https://${artifact.replace(/^https?:\/\//, '')}`, '_blank', 'noopener');
  };

  // keyboard-driven review
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Escape always closes the shortcuts dialog first
      if (e.key === 'Escape' && showHelp) {
        e.preventDefault();
        return setShowHelp(false);
      }
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') return;
      if (reviewTask || oneOnOne || showHelp) {
        // while an overlay is open, only the help toggle responds
        if (e.key === '?' && !reviewTask && !oneOnOne) setShowHelp((s) => !s);
        return;
      }
      const k = e.key.toLowerCase();

      // mentee navigation
      if (e.key === 'ArrowRight' || k === 'l') return next();
      if (e.key === 'ArrowLeft' || k === 'h') return prev();
      if (k === 's') return skip();

      // submission focus + actions
      if (k === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        return setFocus((f) => (pending.length ? (f + 1) % pending.length : 0));
      }
      if (k === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        return setFocus((f) => (pending.length ? (f - 1 + pending.length) % pending.length : 0));
      }
      if (k === 'v' || k === 'o') {
        // view / open the focused submission's file
        if (focused?.artifact) window.open(`https://${focused.artifact.replace(/^https?:\/\//, '')}`, '_blank', 'noopener');
        return;
      }
      if (k === 'r' && focused) return setReviewTask(focused);
      if (k === 'a' && focused) return quickAction(m.id, focused.id, 'approve');
      if (k === 'c' && focused) return quickAction(m.id, focused.id, 'retry', 'Please take another pass.');

      // attendance + capture
      if (k === 'p') return markAttendance(m.id, 'present');
      if (k === 'x') return markAttendance(m.id, 'absent');
      if (k === 'e') return markAttendance(m.id, 'excused');
      if (k === '1') return setOneOnOne(true);
      if (e.key === '?') return setShowHelp((s) => !s);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, pending, focus, focused, reviewTask, oneOnOne, showHelp]);

  const risk = RISK_META[m.risk];
  const attendedCount = mentees.filter((mm) => getAttendance(mm.id)).length;

  const saveNote = () => {
    logMeeting(m.id, { summary: note.trim(), sentiment: m.sentiment });
    setNoted((n) => ({ ...n, [m.id]: true }));
    setNote('');
  };

  return (
    <Page>
      {/* header / stepper */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-brand-600">
            <ClipboardCheck className="h-3.5 w-3.5" />
            Weekly quick review · standup
          </div>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-ink">
            {m.name} <span className="text-ink-faint">· {i + 1} of {mentees.length}</span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHelp((s) => !s)}
            className="rounded-r inline-flex items-center gap-1 border border-hairline bg-white px-2 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.04em] text-ink-mute transition-colors hover:border-ink hover:text-ink"
            title="Keyboard shortcuts (?)"
          >
            <Keyboard className="h-3 w-3" /> Shortcuts
            <kbd className="ml-0.5 rounded-r border border-hairline px-1">?</kbd>
          </button>
          <Button variant="outline" size="sm" onClick={prev} disabled={i === 0}>
            <ChevronLeft className="h-4 w-4" /> Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={skip}
            title="Skip — come back to them later (e.g. running late)"
          >
            <SkipForward className="h-4 w-4" /> Skip
          </Button>
          <Button size="sm" onClick={next}>
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* deferred — late joiners / skipped, come back when ready */}
      {deferred.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-r border border-amber-200 bg-amber-50/40 px-3 py-2">
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-amber-700">
            <Clock className="h-3 w-3" /> Come back to
          </span>
          {[...deferred].map((idx) => (
            <button
              key={idx}
              onClick={() => go(idx)}
              className="rounded-r inline-flex items-center gap-1.5 border border-amber-200 bg-white px-2 py-1 text-xs text-ink-soft transition-colors hover:border-ink"
            >
              <Avatar initials={mentees[idx].avatar} name={mentees[idx].name} size="xs" />
              {mentees[idx].name.split(' ')[0]}
            </button>
          ))}
        </div>
      )}

      {/* progress dots — colored by attendance once marked */}
      <div className="mb-6 flex items-center gap-1.5">
        {mentees.map((mm, idx) => {
          const att = getAttendance(mm.id);
          return (
            <button
              key={mm.id}
              onClick={() => go(idx)}
              className={cx(
                'h-1.5 flex-1 transition-colors',
                idx === i
                  ? 'bg-ink'
                  : att === 'present'
                    ? 'bg-emerald-400'
                    : att === 'absent'
                      ? 'bg-[#FF3B30]'
                      : seen.has(idx)
                        ? 'bg-neutral-300'
                        : 'bg-neutral-200',
              )}
              title={`${mm.name}${att ? ` · ${att}` : ''}`}
            />
          );
        })}
      </div>

      <div className="grid animate-scale-in gap-6 lg:grid-cols-3">
        {/* main column */}
        <div className="space-y-5 lg:col-span-2">
          <Card className="p-5">
            <div className="flex items-start gap-3">
              <Avatar initials={m.avatar} name={m.name} size="lg" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold text-ink">{m.name}</h2>
                  <MomentumIcon momentum={m.momentum} />
                  <Badge tone={risk.tone}>
                    <RiskDot risk={m.risk} />
                    {risk.label}
                  </Badge>
                </div>
                <div className="text-xs text-ink-mute">
                  {m.level} · Week {m.week}/{m.totalWeeks} · {m.onTimeRate}% on-time
                </div>
              </div>
              <button
                onClick={() => navigate(`/mentor/mentee/${m.id}`)}
                className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
              >
                Full story <ArrowUpRight className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="mt-4 border-t border-hairline pt-4">
              <DualProgress absolute={m.absoluteProgress} relative={m.relativeProgress} compact />
            </div>
          </Card>

          <AISummary summary={m.aiSummary} signals={m.aiSignals} defaultOpen={false} />

          {/* extension requests — surfaced inline */}
          {extensions.length > 0 && (
            <Card className="border-amber-200 p-5">
              <div className="mb-3 flex items-center justify-between">
                <SectionLabel>Extension requests</SectionLabel>
                <Badge tone="amber">{extensions.length}</Badge>
              </div>
              <div className="space-y-2">
                {extensions.map((t) => {
                  const d = findDelay(m, t);
                  const fmeta = d ? FRICTION_META[d.kind] : null;
                  const cat = d ? DELAY_CATEGORY_META[d.category] : null;
                  return (
                    <div key={t.id} className="rounded-r bg-amber-50/50 p-3">
                      <div className="flex items-start gap-3">
                        <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-ink">{t.title}</div>
                          {/* the actual reason they gave */}
                          {d ? (
                            <p className="mt-0.5 text-sm text-ink-soft">
                              &ldquo;{d.reason}&rdquo;
                            </p>
                          ) : (
                            <p className="mt-0.5 text-xs text-ink-mute">Requested more time.</p>
                          )}
                          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-ink-mute">
                            {fmeta && (
                              <span className="inline-flex items-center gap-1">
                                <fmeta.icon className="h-3.5 w-3.5" />
                                {fmeta.label}
                              </span>
                            )}
                            <span className="text-ink-faint">·</span>
                            <span>new due {t.due}</span>
                            {cat && <Badge tone={cat.tone}>{cat.label}</Badge>}
                          </div>
                        </div>
                        <Button size="sm" onClick={() => setReviewTask(t)}>
                          <Eye className="h-4 w-4" /> Review
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* submissions — organized by the mentee's schedule (slot by slot) */}
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <SectionLabel>Their day · review by schedule</SectionLabel>
              {pending.length > 0 && <Badge tone="brand">{pending.length} to review</Badge>}
            </div>

            {pending.length === 0 && reviewedHere.length === 0 ? (
              <p className="py-4 text-center text-sm text-ink-faint">Nothing waiting — move on.</p>
            ) : (
              <div className="space-y-4">
                {SLOT_ORDER.map((slot) => {
                  const group = slotGroups[slot];
                  if (group.pending.length === 0 && group.reviewed.length === 0) return null;
                  const SlotIcon =
                    slot === 'morning' ? Sunrise : slot === 'lunch' ? Sun : slot === 'dinner' ? Moon : Clock;
                  const slotCfg = schedule[slot];
                  const trackLabel =
                    slotCfg?.kind === 'roadmap'
                      ? 'Roadmap track'
                      : slotCfg?.kind === 'recurring'
                        ? 'Recurring'
                        : null;
                  return (
                    <div key={slot}>
                      {/* slot header — the "track" for this part of the day */}
                      <div className="mb-1.5 flex items-center gap-2">
                        <SlotIcon className="h-3.5 w-3.5 text-ink-faint" />
                        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-mute">
                          {SLOT_META[slot].label}
                        </span>
                        {trackLabel && <Badge tone={slotCfg?.kind === 'roadmap' ? 'brand' : 'violet'}>{trackLabel}</Badge>}
                        <span className="text-[11px] text-ink-faint">{SLOT_META[slot].blurb}</span>
                      </div>

                      <div className="space-y-2">
                        {group.pending.map((t) => {
                          const flatIdx = pending.indexOf(t);
                          return (
                            <PendingRow
                              key={t.id}
                              task={t}
                              focused={pending.length > 1 && flatIdx === focus}
                              onFocus={() => setFocus(flatIdx)}
                              onApprove={() => quickAction(m.id, t.id, 'approve')}
                              onOpenFull={() => setReviewTask(t)}
                              onViewFile={() => openFile(t.artifact)}
                            />
                          );
                        })}
                        {group.reviewed.map((t) => {
                          const s = STATUS_META[t.status];
                          const Icon =
                            t.status === 'completed'
                              ? CheckCircle2
                              : t.status === 'rejected'
                                ? XCircle
                                : t.review?.decision === 'approved_notes'
                                  ? MessageSquarePlus
                                  : RotateCcw;
                          return (
                            <div key={t.id} className="rounded-r flex items-center gap-3 bg-neutral-50 p-3">
                              <Icon className="h-4 w-4 shrink-0 text-ink-mute" />
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm text-ink-soft">{t.title}</div>
                                {t.review?.notes && (
                                  <div className="truncate text-xs text-ink-mute">&ldquo;{t.review.notes}&rdquo;</div>
                                )}
                              </div>
                              {typeof t.scoreDetail?.speed === 'number' && (
                                <span className="font-mono text-[11px] text-emerald-600 tnum">
                                  {t.scoreDetail.speed}% speed
                                </span>
                              )}
                              <Badge tone={s.tone}>{s.label}</Badge>
                              <button
                                onClick={() => unreview(m.id, t.id)}
                                title="Un-approve — send back to submitted"
                                className="rounded-r inline-flex items-center gap-1 px-1.5 py-1 text-[11px] text-ink-faint transition-colors hover:text-[#FF3B30]"
                              >
                                <Undo2 className="h-3.5 w-3.5" /> Undo
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {/* side rail — attendance + quick actions */}
        <div className="space-y-5">
          {/* ATTENDANCE — the standup record */}
          <Card className="p-5">
            <SectionLabel>Attendance</SectionLabel>
            <div className="grid grid-cols-3 gap-1.5">
              {(['present', 'absent', 'excused'] as AttendanceStatus[]).map((s) => {
                const meta = ATT_META[s];
                const on = attendance === s;
                return (
                  <button
                    key={s}
                    onClick={() => markAttendance(m.id, s)}
                    className={cx(
                      'rounded-r flex flex-col items-center gap-1 border px-2 py-2.5 text-[11px] font-medium transition-colors',
                      on ? cx('bg-white', meta.tone) : 'border-hairline text-ink-mute hover:border-ink',
                    )}
                  >
                    <meta.icon className="h-4 w-4" />
                    {meta.label}
                  </button>
                );
              })}
            </div>
            {attendance && (
              <p className="mt-2 inline-flex items-center gap-1 text-xs text-ink-mute">
                <Check className="h-3 w-3 text-emerald-600" /> Recorded for this week
              </p>
            )}
          </Card>

          <Card className="p-5">
            <SectionLabel>Quick 1:1</SectionLabel>
            <p className="text-xs leading-relaxed text-ink-mute">
              Capture personality, issues and next steps in a structured note.
            </p>
            <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => setOneOnOne(true)}>
              <MessageSquare className="h-4 w-4" /> Log a 1:1
            </Button>
          </Card>

          <Card className="p-5">
            <SectionLabel>Leave a quick note</SectionLabel>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder={`Coaching note for ${m.name.split(' ')[0]}…`}
              className="rounded-r w-full resize-none border border-hairline bg-white p-3 text-sm text-ink placeholder:text-ink-faint focus:border-brand-400"
            />
            <Button size="sm" className="mt-2 w-full" disabled={!note.trim()} onClick={saveNote}>
              <Send className="h-4 w-4" /> Save note
            </Button>
            {noted[m.id] && (
              <p className="mt-2 inline-flex items-center gap-1 text-xs text-emerald-600">
                <CheckCircle2 className="h-3 w-3" /> Saved to profile
              </p>
            )}
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <SectionLabel>Open blockers</SectionLabel>
              <button
                onClick={() => setAddBlocker(true)}
                className="inline-flex items-center gap-1 text-xs text-ink-mute hover:text-ink"
              >
                <Plus className="h-3.5 w-3.5" /> Log
              </button>
            </div>
            {m.blockers.filter((b) => !b.resolved).length === 0 ? (
              <p className="text-sm text-ink-faint">None — clear runway.</p>
            ) : (
              <div className="space-y-1.5">
                {m.blockers
                  .filter((b) => !b.resolved)
                  .map((b) => (
                    <div
                      key={b.id}
                      className="rounded-r flex items-start gap-2 border border-hairline p-2.5 text-sm text-ink-soft"
                    >
                      <Flag
                        className={cx(
                          'mt-0.5 h-4 w-4 shrink-0',
                          b.severity === 'high' ? 'text-[#FF3B30]' : 'text-amber-500',
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div>{b.title}</div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-faint">
                          <span className="capitalize">{b.category}</span>
                          <span>· {b.daysOpen}d</span>
                          {b.taskTitle && <span className="truncate text-brand-700">· on {b.taskTitle}</span>}
                        </div>
                      </div>
                      <button
                        onClick={() => resolveBlocker(m.id, b.id)}
                        title="Mark resolved"
                        className="rounded-r grid h-7 w-7 shrink-0 place-items-center text-ink-faint hover:bg-emerald-50 hover:text-emerald-600"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
              </div>
            )}
            <button
              onClick={() => navigate(`/mentor/mentee/${m.id}`)}
              className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
            >
              Open full profile <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </Card>

          <div className="rounded-r bg-neutral-900 p-5 text-white">
            <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-white/50">
              Review progress
            </div>
            <div className="mt-2 flex items-end gap-4">
              <div>
                <div className="font-mono text-3xl font-semibold tracking-tight tnum">
                  {seen.size}
                  <span className="text-lg text-white/40"> / {mentees.length}</span>
                </div>
                <p className="mt-1 text-xs text-white/60">seen</p>
              </div>
              <div className="border-l border-white/15 pl-4">
                <div className="font-mono text-3xl font-semibold tracking-tight tnum">
                  {attendedCount}
                  <span className="text-lg text-white/40"> / {mentees.length}</span>
                </div>
                <p className="mt-1 text-xs text-white/60">attendance marked</p>
              </div>
            </div>
            {deferred.size > 0 && (
              <p className="mt-3 inline-flex items-center gap-1 text-xs text-amber-300">
                <Clock className="h-3 w-3" /> {deferred.size} to come back to
              </p>
            )}
            {(seen.size === mentees.length || i === mentees.length - 1) && deferred.size === 0 && (
              <Button
                size="sm"
                className="mt-3 w-full !bg-white !text-ink hover:!bg-white/90"
                onClick={() => navigate('/mentor/cockpit')}
              >
                <X className="h-4 w-4" /> Finish review
              </Button>
            )}
          </div>
        </div>
      </div>

      <ReviewDrawer
        open={reviewTask !== null}
        onClose={() => setReviewTask(null)}
        mentee={m}
        task={reviewTask}
      />
      <OneOnOneDrawer open={oneOnOne} onClose={() => setOneOnOne(false)} mentee={m} />

      {/* quick log-a-blocker for the mentee under review */}
      <Modal
        open={addBlocker_}
        onClose={() => setAddBlocker(false)}
        title={`Log a blocker for ${m.name.split(' ')[0]}`}
        subtitle="Capture what's slowing them down so it's tracked."
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setAddBlocker(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                addBlocker(m.id, { title: blockerText.trim(), category: 'knowledge', severity: 'medium' });
                setBlockerText('');
                setAddBlocker(false);
              }}
              disabled={!blockerText.trim()}
            >
              <Flag className="h-4 w-4" /> Log blocker
            </Button>
          </div>
        }
      >
        <Field label="What's blocking them?">
          <TextArea
            rows={2}
            value={blockerText}
            onChange={(e) => setBlockerText(e.target.value)}
            placeholder="e.g. Stuck on async patterns"
            autoFocus
          />
        </Field>
      </Modal>

      {/* keyboard shortcuts help */}
      {showHelp && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4" onClick={() => setShowHelp(false)}>
          <div className="absolute inset-0 bg-ink/20 animate-fade-in" />
          <div
            className="rounded-r animate-scale-in relative w-full max-w-md border border-hairline bg-white shadow-lift"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-hairline px-5 py-3">
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
                <Keyboard className="h-4 w-4" /> Quick-review shortcuts
              </span>
              <button onClick={() => setShowHelp(false)} className="text-ink-mute hover:text-ink">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 px-5 py-4">
              {[
                ['→ / L', 'Next mentee'],
                ['← / H', 'Previous mentee'],
                ['S', 'Skip — come back later'],
                ['J / ↓', 'Next submission'],
                ['K / ↑', 'Previous submission'],
                ['V / O', 'Open submitted file'],
                ['R', 'Full review (drawer)'],
                ['A', 'Approve focused'],
                ['C', 'Request changes'],
                ['P / X / E', 'Present / Absent / Excused'],
                ['1', 'Log a 1:1'],
                ['?', 'Toggle this help'],
              ].map(([key, label]) => (
                <div key={key} className="flex items-center justify-between gap-3 py-0.5">
                  <span className="text-xs text-ink-soft">{label}</span>
                  <kbd className="rounded-r shrink-0 border border-hairline bg-neutral-50 px-1.5 py-0.5 font-mono text-[10px] text-ink-mute">
                    {key}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}
