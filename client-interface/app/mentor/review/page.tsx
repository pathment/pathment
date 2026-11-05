'use client';
import type { OpenWorkElsewhere } from '@/lib/types/mentee-record';
import { AttendanceHistoryCalendar } from '@/components/mentor/AttendanceHistoryCalendar';

import { ReviewHistoryCalendar } from '@/components/mentor/ReviewHistoryCalendar';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  ChevronLeft, ChevronRight, SkipForward, Check, Loader2,
  TrendingUp, TrendingDown, Minus, Flag, Clock, ClipboardCheck, Keyboard, CheckCircle2, ArrowUpRight, Send, Plus, ListTodo, CalendarClock,
  Trash2, X, History, RotateCcw, CalendarDays, AlertTriangle, StickyNote, Search, Lock, Unlock, PauseCircle, Sparkles, Star, Users } from 'lucide-react';
import Link from 'next/link';
import { useMentorCohort, useMentorApprovals, type CohortMentee, type CohortMomentum, type CohortRisk, type ApprovalItem } from '@/lib/hooks/mentor';
import { useAuth } from '@/lib/context/AuthContext';
import { useClan, ALL_CLANS, isHistoricalCohortClan } from '@/lib/context/ClanContext';
import { mentorApi } from '@/lib/services/mentor-api';
import { taskApi } from '@/lib/services/task-api';
import { submissionService } from '@/lib/services/submissionService';
import { frictionApi } from '@/lib/services/friction-api';
import { reviewLockApi, type MentorLockState } from '@/lib/services/review-lock-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { DualProgress } from '@/components/mentor/DualProgress';
import { AISummaryPanel } from '@/components/mentor/AISummaryPanel';
import { NudgeButton } from '@/components/mentor/NudgeButton';
import { MoveMenteeButton } from '@/components/mentor/MoveMenteeButton';
import { ReviewDrawer } from '@/components/mentor/ReviewDrawer';
import dynamic from 'next/dynamic';
import { MenteeTaskDrawer } from '@/components/mentor/MenteeTaskDrawer';
import { InterviewReviewDrawer } from '@/components/mentor/InterviewReviewDrawer';
import { QuizReviewDrawer } from '@/components/mentor/QuizReviewDrawer';
import { Drawer } from '@/components/shared/Drawer';
import { Avatar } from '@/components/shared/Avatar';
import { useConfirm } from '@/lib/context/ConfirmContext';
import { AttendanceSection } from '@/components/mentor/attendance/AttendanceSection';
import { ReviewMeetingPanel } from '@/components/mentor/ReviewMeetingPanel';
import { ReviewScheduleDrawer } from '@/components/mentor/ReviewScheduleDrawer';
import { getViewerTimeZone } from '@/lib/utils/datetime';
import { MobileReviewActionBar } from '@/components/mentor/MobileReviewActionBar';
import { ContinueWorkLauncher } from '@/components/mentor/ContinueWorkLauncher';
import { MenteeRecordPanel } from '@/components/mentor/MenteeRecordPanel';
import { PlanStripCard } from '@/components/mentor/PlanStripCard';

type Attendance = 'present' | 'absent' | 'excused';
type EntryStatus = 'pending' | 'reviewed' | 'deferred';
interface ReviewEntry { id?: string; menteeId: string; attendance: Attendance | null; status: EntryStatus; note?: string | null; mentee?: { id: string; name: string } | null }
// `draft` = today's session that doesn't exist on the server yet. It's created
// lazily on the first real action so merely opening the page leaves no record.
interface ReviewSession { id: string; sessionDate: string; title: string | null; status: 'in_progress' | 'finished' | 'draft'; note: string | null; finishedAt?: string | null; entries: ReviewEntry[]; kind?: string }
interface ReviewSessionSummary extends Omit<ReviewSession, 'entries'> { counts: { total: number; present: number; absent: number; excused: number; reviewed: number; deferred: number } }

// Only daily reviews are run here. The server lists and opens reviews alone; an
// older discussion or presentation session reached by its link is turned away.
const isReviewSession = (s: { kind?: string | null }) => !s.kind || s.kind === 'review';

const RISK_PILL: Record<CohortRisk, { label: string; cls: string; dot: string }> = {
  high: { label: 'At risk', cls: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500' },
  watch: { label: 'Watch', cls: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  low: { label: 'On track', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
};
function MomentumIcon({ m }: { m: CohortMomentum }) {
  if (m === 'up') return <TrendingUp className="w-4 h-4 text-emerald-500" />;
  if (m === 'down') return <TrendingDown className="w-4 h-4 text-red-500" />;
  return <Minus className="w-4 h-4 text-slate-400" />;
}

// Assigned-task status display (the mentee's "day" / current workload).
const TASK_STATUS_META: Record<string, { label: string; cls: string }> = {
  assigned: { label: 'Assigned', cls: 'bg-slate-100 text-slate-600' },
  not_started: { label: 'Not started', cls: 'bg-slate-100 text-slate-600' },
  in_progress: { label: 'In progress', cls: 'bg-sky-100 text-sky-700' },
  submitted: { label: 'Submitted', cls: 'bg-brand-100 text-brand-700' },
  revision_needed: { label: 'Changes requested', cls: 'bg-amber-100 text-amber-700' },
  completed: { label: 'Completed', cls: 'bg-emerald-100 text-emerald-700' },
  cancelled: { label: 'Cancelled', cls: 'bg-slate-100 text-slate-400' },
};
/** Most urgent first, so a list of mixed statuses reads top-down. */
const TASK_STATUS_ORDER = ['revision_needed', 'submitted', 'in_progress', 'assigned', 'not_started', 'completed', 'cancelled'];

const AssignTaskDrawer = dynamic(() => import('@/components/mentor/AssignTaskDrawer').then(module => module.AssignTaskDrawer));

export default function CohortReview() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { clans, activeClanId } = useClan();
  // Paused mentees are not here on purpose. Pausing takes somebody out of
  // reviews — that is what it is for — and the place to bring one back is the
  // paused list on My Mentees. What belongs on this screen is the step before:
  // noticing the person who is still active and has stopped turning up.
  const { cohort, loading, refetch: refetchCohort } = useMentorCohort();
  const { queue, refetch: refetchQueue } = useMentorApprovals();
  const confirm = useConfirm();

  // Clan review is CLAN-scoped: a session belongs to a clan, shared by its
  // lead + co-mentors. "All clans" can't map to one dated session, so for a
  // multi-clan mentor we pin to a concrete clan (keeps the cohort list and the
  // session on the same clan). Single-clan mentors never see the picker and the
  // server resolves their one clan automatically.
  const effectiveClanId = activeClanId !== ALL_CLANS ? activeClanId : (clans[0]?.id ?? null);
  const activeClan = clans.find((c) => c.id === effectiveClanId) ?? null;
  const activeClanName = activeClan?.name ?? null;
  const historical = isHistoricalCohortClan(activeClan);
  /**
   * This used to write `clans[0].id` into the global clan selection whenever it
   * saw "All clans", which quietly overwrote what the mentor had chosen — and
   * because the old restore briefly read "All clans" on every load before the
   * memberships arrived, merely opening this page could reset their clan to
   * whichever one sorts first.
   *
   * `effectiveClanId` above already pins this screen to a single clan without
   * touching the sidebar, which is all this page ever needed.
   */

  const [idx, setIdx] = useState(0);
  // Guards the one-time restore of ?mentee= below; the clan-change effect also
  // trips it so a new clan never re-restores the previous clan's mentee.
  const restoredRef = useRef(false);

  // Switching clans restarts the review: a different clan has a different
  // cohort and its own dated session, so a carried-over mentee index or a
  // ?session=/?mentee= from the previous clan points at the wrong thing. The
  // clan tabs used to do this in their click handler; now that the sidebar is
  // the only control, the reset follows the clan instead of the button.
  const previousClanRef = useRef<string | null>(null);
  useEffect(() => {
    if (!effectiveClanId) return;
    if (previousClanRef.current === null) { previousClanRef.current = effectiveClanId; return; }
    if (previousClanRef.current === effectiveClanId) return;
    previousClanRef.current = effectiveClanId;
    setIdx(0);
    restoredRef.current = true; // do not re-restore the old clan's ?mentee=
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    params.delete('session');
    params.delete('mentee');
    router.replace(`/mentor/review${params.toString() ? `?${params.toString()}` : ''}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveClanId]);
  const [tasks, setTasks] = useState<any[]>([]); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [tasksLoading, setTasksLoading] = useState(false);
  const [profile, setProfile] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any -- full mentee profile (aiSummary/signals)
  // Full cohort-review attendance history for the current mentee (newest first).
  const [attHistory, setAttHistory] = useState<{ sessionId: string; date: string | null; status: Attendance; title: string | null }[]>([]);
  /** Open work in this mentee's OTHER clans. Empty is the common case. */
  const [elsewhere, setElsewhere] = useState<OpenWorkElsewhere[]>([]);
  const [attOpen, setAttOpen] = useState(false);
  /**
   * Their record across the organisation, behind a button on the mentee card.
   *
   * It used to be a panel in the column. Clan review is a stepping-through
   * screen — the mentor is going person by person — and a second history
   * surface competed with the job instead of helping it. One click away is the
   * right distance: there when you want it, invisible when you don't.
   */
  const [recordOpen, setRecordOpen] = useState(false);
  // The dated, saved cohort-review session (today by default, or ?session=<id>).
  // attendance / seen / deferred are derived from its entries — nothing ephemeral.
  const [session, setSession] = useState<ReviewSession | null>(null);
  const [historyDate, setHistoryDate] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sessions, setSessions] = useState<ReviewSessionSummary[]>([]);
  // Mentees already given an "up next" heads-up this visit (avoid double-pinging).
  const [pinged, setPinged] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState(0);
  const [blockers, setBlockers] = useState<any[]>([]); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [note, setNote] = useState('');
  const [noteSent, setNoteSent] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<ApprovalItem | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [assigning, setAssigning] = useState(false);
  // Extension request the mentor is reviewing (approve-with-adjust / decline).
  const [extReview, setExtReview] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [extDays, setExtDays] = useState(3);
  const [isSavingAttendance, setIsSavingAttendance] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  const mentee: CohortMentee | undefined = cohort[idx];
  const menteeId = mentee?.id;

  // Keep idx in range when the cohort shrinks (e.g. after pausing a mentee, who
  // drops out of the list). Without this, idx can point past the end → crash.
  useEffect(() => {
    if (cohort.length && idx > cohort.length - 1) setIdx(cohort.length - 1);
  }, [cohort.length, idx]);

  // ── Search + deep-link: jump to a mentee, and keep ?mentee=<id> in the URL so a
  // refresh lands on the same person. ──────────────────────────────────────────
  const [jumpQuery, setJumpQuery] = useState('');
  const jumpMatches = useMemo(() => {
    const q = jumpQuery.trim().toLowerCase();
    if (!q) return [];
    return cohort.map((m, i) => ({ m, i })).filter(({ m }) => m.name.toLowerCase().includes(q)).slice(0, 8);
  }, [jumpQuery, cohort]);
  const menteeParam = searchParams.get('mentee');
  // Select a mentee AND mirror it into the URL (replace, so a refresh stays put).
  // All navigation (search, dots, prev/next, deferred chips, up-next) goes through
  // this so state and the ?mentee= param never drift.
  const selectMentee = useCallback((i: number) => {
    if (i < 0 || i >= cohort.length) return;
    setIdx(i);
    const id = cohort[i]?.id;
    if (!id) return;
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    params.set('mentee', id);
    router.replace(`/mentor/review?${params.toString()}`, { scroll: false });
  }, [cohort, searchParams, router]);
  // Restore the current mentee from ?mentee=<id> ONCE, the first time the cohort
  // loads (deep-link / refresh). After that, navigation (selectMentee) owns both
  // idx and the URL. Running this on every menteeParam change made it fight
  // selectMentee on a lagging param, so Prev/Next appeared not to update the URL.
  useEffect(() => {
    if (restoredRef.current || !cohort.length) return;
    restoredRef.current = true;
    if (!menteeParam) return;
    const i = cohort.findIndex((m) => m.id === menteeParam);
    if (i >= 0) setIdx(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cohort]);
  const pending = useMemo(
    () => queue.filter((q) => q.mentee?.id === mentee?.id),
    [queue, mentee?.id]
  );

  // Load the session: a specific one via ?session=<id>, else today's (mentor tz).
  const sessionParam = searchParams.get('session');
  const [sessionError, setSessionError] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(true);
  // Mentees auto-marked "seen" while today is still a draft (no server row yet).
  // Flushed to the server the moment the session is created (ensureSession).
  const seenLocalRef = useRef<Set<string>>(new Set());
  const loadSession = useCallback(async () => {
    setSessionLoading(true);
    seenLocalRef.current = new Set();
    try {
      const r: any = sessionParam // eslint-disable-line @typescript-eslint/no-explicit-any
        ? await mentorApi.getReviewSession(sessionParam)
        : await mentorApi.getTodayReviewSession(effectiveClanId);
      const loaded = r?.data?.session ?? null;
      if (loaded && sessionParam && !isReviewSession(loaded)) { router.replace('/mentor/review'); return; }
      if (loaded) {
        setSession(loaded);
        setSessionError(false);
      } else if (!sessionParam) {
        // No session for today yet → a draft (created lazily on first action).
        const todayDate = r?.data?.today ?? new Date().toISOString().split('T')[0];
        setSession({ id: '', sessionDate: todayDate, title: null, status: 'draft', note: null, entries: [] });
        setSessionError(false);
      } else {
        setSession(null);
        setSessionError(true);
      }
    } catch {
      setSession(null);
      setSessionError(true);
    } finally {
      setSessionLoading(false);
    }
  }, [sessionParam, effectiveClanId, router]);
  useEffect(() => { loadSession(); }, [loadSession]);

  // Derive attendance / seen / deferred from the session's entries.
  const attendance = useMemo(() => {
    const m: Record<string, Attendance> = {};
    (session?.entries || []).forEach((e) => { if (e.attendance) m[e.menteeId] = e.attendance; });
    return m;
  }, [session]);
  const seen = useMemo(() => new Set((session?.entries || []).filter((e) => e.status === 'reviewed').map((e) => e.menteeId)), [session]);
  const deferred = useMemo(() => new Set((session?.entries || []).filter((e) => e.status === 'deferred').map((e) => e.menteeId)), [session]);
  const entriesByMentee = useMemo(() => {
    const m: Record<string, ReviewEntry> = {};
    (session?.entries || []).forEach((e) => { m[e.menteeId] = e; });
    return m;
  }, [session]);
  const editable = !historical && (session?.status === 'in_progress' || session?.status === 'draft');
  const HISTORICAL_TITLE = 'Completed programs are read-only';
  const isDraft = session?.status === 'draft';

  // "Last meeting" = the most recent attendance STRICTLY BEFORE the session being
  // viewed (history is newest-first). So opening a Jun 9 review never shows a
  // Jun 14 meeting, and the current session's own mark isn't echoed back as "last".
  const lastMeeting = useMemo(() => {
    if (!session?.sessionDate) return null;
    return attHistory.find((h) => h.date && h.date < session.sessionDate) || null;
  }, [attHistory, session?.sessionDate]);

  // Create today's session on the first real action, flushing any "seen" marks
  // accumulated while it was a draft. Returns the now-persisted session. The
  // in-flight guard dedupes concurrent first-actions so we never create two
  // sessions for the same day on rapid clicks.
  const ensureRef = useRef<Promise<ReviewSession | null> | null>(null);
  const ensureSession = useCallback(async (): Promise<ReviewSession | null> => {
    if (session && session.id) return session;
    if (ensureRef.current) return ensureRef.current;
    const run = (async (): Promise<ReviewSession | null> => {
      const r: any = await mentorApi.createReviewSession({ clanId: effectiveClanId }); // eslint-disable-line @typescript-eslint/no-explicit-any
      const created: ReviewSession | null = r?.data?.session ?? null;
      if (!created) throw new Error('Could not start the review');
      const seenIds = [...seenLocalRef.current];
      for (const id of seenIds) {
        try { await mentorApi.setReviewEntry(created.id, id, { status: 'reviewed' }); } catch { /* best-effort */ }
      }
      const merged: ReviewSession = {
        ...created,
        entries: (created.entries || []).map((e) => (seenLocalRef.current.has(e.menteeId) ? { ...e, status: 'reviewed' } : e)),
      };
      seenLocalRef.current.clear();
      setSession(merged);
      return merged;
    })();
    ensureRef.current = run;
    try { return await run; } finally { ensureRef.current = null; }
  }, [session, effectiveClanId]);

  // Optimistically patch one mentee's entry, then persist. `commit` marks a
  // deliberate action (attendance/defer/finish) that should create today's
  // session if it's still a draft; passive "seen on view" marks (commit=false)
  // only accumulate locally until a deliberate action commits them.
  const upsert = (entries: ReviewEntry[], mId: string, patch: Partial<ReviewEntry>): ReviewEntry[] =>
    entries.some((e) => e.menteeId === mId)
      ? entries.map((e) => (e.menteeId === mId ? { ...e, ...patch } : e))
      : [...entries, { menteeId: mId, attendance: null, status: 'pending', ...patch } as ReviewEntry];

  // Live auto-attendance sync: the meeting panel pushes the roster's attendance
  // (server truth — includes mentees auto-marked present on joining the call) so
  // the attendance strip and the present/absent/excused counts reflect it live,
  // instead of the stale session loaded once on page open. Server already
  // persisted these marks; we only mirror them into local state (no write). A
  // change guard keeps the 8s roster poll from re-rendering when nothing moved.
  const syncMeetingAttendance = useCallback((rows: { menteeId: string; attendance: string | null }[]) => {
    setSession((s) => {
      if (!s) return s;
      let entries = s.entries;
      let changed = false;
      for (const row of rows) {
        const att = row.attendance as Attendance | null;
        if (!att) continue;
        const cur = entries.find((e) => e.menteeId === row.menteeId);
        if (!cur || cur.attendance !== att) {
          entries = upsert(entries, row.menteeId, { attendance: att, status: 'reviewed' });
          changed = true;
        }
      }
      return changed ? { ...s, entries } : s;
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const patchEntry = useCallback(async (mId: string, patch: { attendance?: Attendance | null; status?: EntryStatus; note?: string }, commit = false) => {
    if (!session) return;
    setSession((s) => (s ? { ...s, entries: upsert(s.entries, mId, patch) } : s));

    if (session.id) {
      try { await mentorApi.setReviewEntry(session.id, mId, patch); }
      catch { toast.error('Could not save the review'); }
      return;
    }
    // Draft (no server row yet).
    if (!commit) { seenLocalRef.current.add(mId); return; }
    try {
      const s = await ensureSession();
      if (s) {
        setSession((cur) => (cur ? { ...cur, entries: upsert(cur.entries, mId, patch) } : cur));
        await mentorApi.setReviewEntry(s.id, mId, patch);
      }
    } catch { toast.error('Could not save the review'); }
  }, [session, ensureSession]);

  // Bulk-apply the Attendance Sheet. `null` means "clear the mark". Only rows
  // that actually changed are persisted; status follows attendance (a cleared
  // mark drops back to pending).
  const patchMultipleEntries = useCallback(async (updates: Record<string, Attendance | null>) => {
    if (!session) return;
    setIsSavingAttendance(true);
    try {
      const changes = Object.entries(updates).filter(([mId, newAtt]) => {
        const currentAtt = entriesByMentee[mId]?.attendance ?? null;
        return currentAtt !== newAtt;
      });

      if (changes.length === 0) {
        setIsSavingAttendance(false);
        return;
      }

      const s = await ensureSession();
      if (!s) throw new Error('Could not create session');

      let newEntries = [...s.entries];
      changes.forEach(([mId, newAtt]) => {
        newEntries = upsert(newEntries, mId, { attendance: newAtt, status: newAtt ? 'reviewed' : 'pending' });
      });
      setSession({ ...s, entries: newEntries });

      await Promise.all(
        changes.map(([mId, newAtt]) =>
          mentorApi.setReviewEntry(s.id, mId, { attendance: newAtt, status: newAtt ? 'reviewed' : 'pending' })
        )
      );

      toast.success(`Attendance updated for ${changes.length} mentee${changes.length === 1 ? '' : 's'}`);
    } catch {
      toast.error('Some attendance marks didn\'t save. Try again.');
    } finally {
      setIsSavingAttendance(false);
    }
  }, [session, entriesByMentee, ensureSession]);

  // Load open blockers + assigned tasks + the full profile (state/summary) for
  // the current mentee; reset state.
  useEffect(() => {
    if (!mentee) return;
    setFocus(0); setNote(''); setNoteSent(false); setBlockers([]); setTasks([]); setProfile(null); setAttHistory([]); setElsewhere([]); setRecordOpen(false);
    frictionApi.listBlockers(mentee.id, 'open').then((r: any) => setBlockers(r?.data?.blockers ?? [])).catch(() => {}); // eslint-disable-line @typescript-eslint/no-explicit-any
    mentorApi.getMenteeProfile(mentee.id).then((r: any) => setProfile(r?.data?.profile ?? r?.data ?? null)).catch(() => setProfile(null)); // eslint-disable-line @typescript-eslint/no-explicit-any
    mentorApi.getMenteeAttendanceHistory(mentee.id).then((r) => setAttHistory((r?.data?.history ?? []) as typeof attHistory)).catch(() => setAttHistory([]));
    // The mentee's FULL task list (every assignment, whoever made it) — not just
    // the viewer's own — so a co-mentor sees the same work as the lead.
    setTasksLoading(true);
    taskApi.getMenteeTasks(mentee.id)
      .then((r: any) => setTasks(r?.data?.tasks ?? [])) // eslint-disable-line @typescript-eslint/no-explicit-any
      .catch(() => setTasks([]))
      .finally(() => setTasksLoading(false));
    // What they are already mid-way through in their OTHER clans. The one piece
    // of cross-clan context that changes the next decision on this screen —
    // assigning over work they are already doing elsewhere is the mistake.
    mentorApi.getOpenWorkElsewhere(mentee.id, effectiveClanId || undefined)
      .then((r) => setElsewhere(r.data?.tasks ?? []))
      .catch(() => setElsewhere([]));
  }, [mentee?.id, effectiveClanId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Landing on a mentee marks them "reviewed" (seen) — but only if still pending,
  // so a deferred mentee stays deferred and we never loop. Finished sessions stay put.
  useEffect(() => {
    if (!editable || !menteeId) return;
    const e = entriesByMentee[menteeId];
    if (e && e.status === 'pending') patchEntry(menteeId, { status: 'reviewed' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menteeId, session?.id, editable]);

  // The mentee's assigned work, grouped by status (their "day"). 'submitted'
  // tasks live in the "To review" queue above, so exclude them here.
  // Pending due-date extension requests for this mentee, derived from the
  // latest submission on each task (already loaded — no extra fetch).
  const pendingExtensions = useMemo(() => tasks.map((t) => {
    const sub = t.submissions?.[0];
    if (!sub || !sub.extensionRequested || sub.extensionStatus !== 'pending') return null;
    return {
      submissionId: sub.id,
      taskId: t.id,
      taskTitle: t.roadmapTask?.title || t.title || 'Task',
      reason: sub.extensionReason || '',
      days: sub.extensionDays || null,
      currentDue: t.dueDate || null,
    };
  }).filter(Boolean) as { submissionId: string; taskId: string; taskTitle: string; reason: string; days: number | null; currentDue: string | null }[], [tasks]);

  // New due date if we add `days` to the task's current due (or today if none).
  const computeNewDue = (currentDue: string | null, days: number) => {
    const base = currentDue ? new Date(currentDue) : new Date();
    base.setDate(base.getDate() + Math.max(1, days));
    return base.toISOString().split('T')[0];
  };

  const dayTasks = useMemo(() => tasks.filter((t) => t.status !== 'submitted'), [tasks]);
  /**
   * The mentee's work as three lists rather than three cards.
   *
   * To review, in progress and completed were separate stacked panels, so the
   * queue that is the whole reason for this screen sat above a long accordion
   * of finished work and everything below it — the side rail, the notes — was
   * pushed off the fold. They are one surface now, because they are one
   * question: what is going on with this person's work.
   */
  const byUrgency = (a: any, b: any) => // eslint-disable-line @typescript-eslint/no-explicit-any
    TASK_STATUS_ORDER.indexOf(a.status) - TASK_STATUS_ORDER.indexOf(b.status);
  const inProgressTasks = useMemo(
    () => dayTasks.filter((t) => t.status !== 'completed').sort(byUrgency),
    [dayTasks],
  );
  const completedTasks = useMemo(() => dayTasks.filter((t) => t.status === 'completed'), [dayTasks]);
  const [workTab, setWorkTab] = useState<'review' | 'progress' | 'done'>('review');
  /**
   * Land on the tab that has something in it. Opening on an empty "To review"
   * when there are six live tasks makes the screen look broken.
   *
   * Once per mentee, and only after their work has loaded — keying this on the
   * counts alone would snap the mentor back to "To review" the moment they
   * approved something while reading the completed list.
   */
  const tabPickedFor = useRef<string | null>(null);
  useEffect(() => {
    if (tasksLoading || tabPickedFor.current === menteeId) return;
    tabPickedFor.current = menteeId ?? null;
    setWorkTab(pending.length ? 'review' : inProgressTasks.length ? 'progress' : completedTasks.length ? 'done' : 'review');
  }, [menteeId, tasksLoading, pending.length, inProgressTasks.length, completedTasks.length]);

  // Latest mentor note + rating for a task, surfaced on reviewed/changes rows.
  const reviewOf = (t: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    let fb = t.submissions?.[0]?.feedback;
    if (Array.isArray(fb)) fb = fb[0]; // handle new backend array structure
    if (!fb) return { note: null as string | null, rating: null as number | null };
    const note = t.status === 'revision_needed'
      ? (fb.revisionNotes || fb.feedbackText || null)
      : t.status === 'completed' ? (fb.feedbackText || null) : null;
    const r = Number(fb.rating);
    return { note, rating: t.status === 'completed' && Number.isFinite(r) && r > 0 ? r : null };
  };

  const fmtCardDate = (value: string | Date | null | undefined) => {
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: getViewerTimeZone() });
  };

  const taskTimeline = (t: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const sub = t.submissions?.[0];
    return {
      submitted: fmtCardDate(sub?.submittedAt || t.submittedAt),
      reviewed: fmtCardDate(sub?.reviewedAt || (t.status === 'completed' ? t.completedAt : null)),
    };
  };

  const go = useCallback((delta: number) => {
    selectMentee(Math.max(0, Math.min(cohort.length - 1, idx + delta)));
  }, [selectMentee, cohort.length, idx]);

  const skip = useCallback(() => {
    if (mentee && editable) patchEntry(mentee.id, { status: 'deferred' }, true);
    go(1);
  }, [mentee, go, editable, patchEntry]);

  /**
   * Whether the system thinks THIS mentee should be paused.
   *
   * The same read that drives the suggested-to-pause queue on My Mentees. It
   * belonged here too: clan review is where a mentor actually notices someone
   * has stopped turning up, and the Pause button sat on this card with nothing
   * telling them the system had already reached that conclusion.
   */
  const [pauseHints, setPauseHints] = useState<Record<string, { reason: string; missedReviews: number; neverAttended: boolean }>>({});
  useEffect(() => {
    if (!effectiveClanId) return;
    let live = true;
    mentorApi.listPauseSuggestions(effectiveClanId)
      .then((r: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        if (!live) return;
        const next: Record<string, { reason: string; missedReviews: number; neverAttended: boolean }> = {};
        for (const row of (r?.data?.suggestions ?? [])) {
          next[row.menteeId] = {
            reason: row.reason,
            missedReviews: row.missedReviews ?? 0,
            neverAttended: !!row.neverAttended,
          };
        }
        setPauseHints(next);
      })
      // Quiet on failure: a missing hint is a missing hint, never an error on
      // the review screen.
      .catch(() => { if (live) setPauseHints({}); });
    return () => { live = false; };
  }, [effectiveClanId]);

  const pauseHint = mentee ? pauseHints[mentee.id] ?? null : null;

  const dismissPauseHint = useCallback(async () => {
    if (!mentee) return;
    const id = mentee.id;
    setPauseHints((prev) => { const next = { ...prev }; delete next[id]; return next; });
    try {
      await mentorApi.dismissPauseSuggestion(id, effectiveClanId ?? undefined);
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not dismiss that'));
    }
  }, [mentee, effectiveClanId]);

  // Pause the mentee you're reviewing (they stopped showing up). Confirms,
  // pauses, drops them from the cohort, and moves on to the next person.
  const [pausing, setPausing] = useState(false);
  const pauseCurrent = useCallback(async () => {
    if (!mentee) return;
    // The confirmation repeats WHY, because that is the half of a suggestion
    // that makes it a suggestion. A mentor who clicks Pause off the back of a
    // prompt should see the evidence the prompt was built on before it
    // happens, not have to trust that something counted correctly.
    const why = pauseHint
      ? (pauseHint.neverAttended
          ? `They have never attended a review — ${pauseHint.missedReviews} have been held since they joined.`
          : pauseHint.reason || `They have missed the last ${pauseHint.missedReviews} reviews.`)
      : null;
    const ok = await confirm({
      title: `Pause ${mentee.name}?`,
      description: `${why ? `${why}\n\n` : ''}They stay in the clan and keep getting reminders to come back, but drop out of your reports and this review until they do.`,
      confirmLabel: 'Pause mentee',
    });
    if (!ok) return;
    setPausing(true);
    try {
      await mentorApi.pauseMentee(mentee.id, undefined, effectiveClanId ?? undefined);
      toast.success(`${mentee.name} paused`);
      go(1);
      await refetchCohort();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not pause this mentee'));
    } finally {
      setPausing(false);
    }
  }, [mentee, pauseHint, confirm, effectiveClanId, go, refetchCohort]);


  // Refresh the queue + the CURRENT mentee's tasks. Keyed on the live mentee so
  // actions never refetch a stale/previous mentee (the old bug).
  const refresh = useCallback(async () => {
    await refetchQueue();
    if (menteeId) {
      try { const r: any = await taskApi.getMenteeTasks(menteeId); setTasks(r?.data?.tasks ?? []); } catch { /* keep prior */ } // eslint-disable-line @typescript-eslint/no-explicit-any
    }
  }, [refetchQueue, menteeId]);


  /**
   * One row of assigned work. Lifted out of the status accordion unchanged so
   * the In-progress and Completed tabs render identically — the only thing
   * that differed per group was the label, which the row already carries.
   */
  const renderTaskRow = (t: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const meta = TASK_STATUS_META[t.status as keyof typeof TASK_STATUS_META] ?? TASK_STATUS_META.assigned;
    const showTimeline = t.status === 'revision_needed' || t.status === 'completed';
    const dueMs = t.dueDate ? new Date(t.dueDate).getTime() : null;
    const overdue = dueMs != null && t.status !== 'completed' && dueMs < Date.now();
    const { note, rating } = reviewOf(t);
    const { submitted, reviewed } = showTimeline ? taskTimeline(t) : { submitted: null, reviewed: null };
    const points = t.points ?? t.pointsBase ?? t.roadmapTask?.pointsBase;
    const source = t.isCustomTask ? 'Custom' : (t.roadmapName || 'Roadmap');
    const typeLabel = t.roadmapTask?.type
      ? String(t.roadmapTask.type).charAt(0).toUpperCase() + String(t.roadmapTask.type).slice(1)
      : null;
    const dueLabel = fmtCardDate(t.dueDate);
    const canManage = !['cancelled'].includes(t.status);
    const canUnassign = !['submitted', 'completed', 'cancelled'].includes(t.status);
    const isEditingDue = editingDue === t.id;
    const busy = busyTaskId === t.id;
    return (
      <div key={t.id} className="p-3 rounded-xl border border-slate-200">
        <div className="flex items-center gap-2.5">
          <button type="button" onClick={() => setTaskDetail(t)} className="min-w-0 flex-1 text-left group">
            <p className="text-sm font-medium text-slate-900 truncate group-hover:text-brand-600 group-hover:underline">
              {t.roadmapTask?.title || t.title || 'Task'}
              {t.hasOverrides && <span className="ml-1.5 align-middle text-[10px] font-medium text-amber-600">• customized</span>}
            </p>
            <p className="mt-0.5 text-xs text-slate-500 truncate">
              {[
                source, 
                typeLabel, 
                (t.status === 'completed' && t.pointsAwarded != null) 
                  ? `${t.pointsAwarded}${points != null ? ` / ${points}` : ''} pts`
                  : points != null ? `${points} pts` : null
              ].filter(Boolean).join(' · ')}
              {rating != null && (
                <span className="ml-2 inline-flex items-center gap-1 bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-full border border-amber-200/50">
                  <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                  <span className="font-semibold">{rating}</span>
                </span>
              )}
              {t.mentorNote && <span className="ml-2 inline-flex items-center gap-0.5 text-amber-600"><StickyNote className="w-3 h-3" />note</span>}
            </p>
          </button>
          <div className="hidden sm:flex items-start gap-5 shrink-0 text-right">
            {dueLabel && (
              <div className="min-w-14">
                <p className="text-[10px] leading-none text-slate-400">Due</p>
                <p className={`mt-1 text-xs leading-none tabular-nums ${overdue ? 'text-red-600' : 'text-slate-700'}`}>
                  {overdue && <Clock className="inline-block w-2.5 h-2.5 mr-0.5 align-[-1px]" aria-hidden />}
                  {dueLabel}
                </p>
              </div>
            )}
            {showTimeline && (
              <>
                <div className="min-w-14">
                  <p className="text-[10px] leading-none text-slate-400">Submitted</p>
                  <p className="mt-1 text-xs leading-none text-slate-700 tabular-nums">{submitted || '—'}</p>
                </div>
                <div className="min-w-14">
                  <p className="text-[10px] leading-none text-slate-400">Reviewed</p>
                  <p className="mt-1 text-xs leading-none text-slate-700 tabular-nums">{reviewed || '—'}</p>
                </div>
              </>
            )}
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${meta.cls}`}>{meta.label}</span>
            {canManage && (
              <>
                <button onClick={() => { setEditingDue(isEditingDue ? null : t.id); setDueVal(t.dueDate ? new Date(t.dueDate).toISOString().split('T')[0] : ''); }}
                  title={historical ? HISTORICAL_TITLE : 'Change deadline'} className="p-1 text-slate-400 hover:text-brand-600 disabled:opacity-40" disabled={busy || historical}>
                  <CalendarClock className="w-3.5 h-3.5" />
                </button>
                {canUnassign && (
                  <button onClick={() => unassignTask(t.id)} title={historical ? HISTORICAL_TITLE : 'Unassign task'}
                    className="p-1 text-slate-400 hover:text-red-500 disabled:opacity-40" disabled={busy || historical}>
                    {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
        <div className="sm:hidden mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
          {dueLabel && <span className={overdue ? 'text-red-600' : ''}>Due {dueLabel}</span>}
          {showTimeline && <span>Submitted {submitted || '—'}</span>}
          {showTimeline && <span>Reviewed {reviewed || '—'}</span>}
        </div>
        {isEditingDue && (
          <div className="mt-2 flex items-center gap-2">
            <input type="date" value={dueVal} onChange={(e) => setDueVal(e.target.value)}
              className="border border-slate-300 rounded-lg px-2 py-1 text-xs bg-card focus:outline-none focus:ring-2 focus:ring-brand-500" />
            <button onClick={() => saveDue(t.id)} disabled={busy || !dueVal}
              className="px-2.5 py-1 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-medium inline-flex items-center gap-1 disabled:opacity-50">
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : null}Save
            </button>
            <button onClick={() => { setEditingDue(null); setDueVal(''); }} className="p-1 text-slate-400 hover:text-slate-700"><X className="w-3.5 h-3.5" /></button>
          </div>
        )}
        {note && (
          <p className={`mt-1.5 text-xs rounded-lg px-2.5 py-1.5 ${t.status === 'revision_needed' ? 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300' : 'text-slate-500'}`}>
            {t.status === 'revision_needed' && <span className="font-medium">Your note: </span>}“{note}”
            {t.status === 'revision_needed' && <span className="text-amber-600/80"> · awaiting resubmission</span>}
          </p>
        )}
      </div>
    );
  };

  /**
   * Jump to a mentee. Lives in the attendance row now, beside the roster it
   * searches, instead of owning a full-width row above everything.
   */
  const menteeSearch = (
  <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={jumpQuery}
            onChange={(e) => setJumpQuery(e.target.value)}
            placeholder="Search a mentee…"
            className="w-full pl-9 pr-8 py-2 border border-slate-200 rounded-xl text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          {jumpQuery && (
            <button onClick={() => setJumpQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
          )}
          {jumpMatches.length > 0 && (
            <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-card shadow-lg dark:shadow-[0_8px_30px_rgba(0,0,0,0.5)] py-1">
              {jumpMatches.map(({ m, i }) => (
                <button
                  key={m.id}
                  onClick={() => { selectMentee(i); setJumpQuery(''); }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center justify-between gap-2 ${i === idx ? 'text-brand-700 font-medium' : 'text-slate-700'}`}
                >
                  <span className="truncate">{m.name}</span>
                  {attendance[m.id] && <span className="text-[11px] text-slate-400 capitalize shrink-0">{attendance[m.id]}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
  );

  /**
   * Where the live-review Start button lands.
   *
   * The meeting panel keeps all its own state and portals its idle button into
   * this node, so the header gets the button without the page getting a
   * section.
   */
  const [meetingSlot, setMeetingSlot] = useState<HTMLElement | null>(null);

  // Click a task row → full detail + edit/note/reassign/unassign, in-context.
  const [taskDetail, setTaskDetail] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  // Per-task inline controls in "Assigned work": change deadline / unassign.
  const [editingDue, setEditingDue] = useState<string | null>(null);
  const [dueVal, setDueVal] = useState('');
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const saveDue = async (taskId: string) => {
    if (!dueVal) { toast.error('Pick a date'); return; }
    try {
      setBusyTaskId(taskId);
      await taskApi.updateTaskDueDate(taskId, dueVal);
      toast.success('Deadline updated');
      setEditingDue(null); setDueVal('');
      await refresh();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not update the deadline'));
    } finally { setBusyTaskId(null); }
  };
  const unassignTask = async (taskId: string) => {
    if (!(await confirm({ title: 'Unassign this task?', description: "It will be removed from the mentee's list.", variant: 'danger', confirmLabel: 'Unassign' }))) return;
    try {
      setBusyTaskId(taskId);
      await taskApi.unassignTask(taskId);
      toast.success('Task unassigned');
      await refresh();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not unassign the task'));
    } finally { setBusyTaskId(null); }
  };

  // Open the review confirm for an extension request (default to requested days).
  const openExtReview = (ext: typeof pendingExtensions[number]) => {
    setExtDays(ext.days && ext.days > 0 ? ext.days : 3);
    setExtReview(ext);
  };

  const decideExtension = async (approved: boolean) => {
    if (!extReview) return;
    try {
      setBusy('extension');
      const newDue = approved ? computeNewDue(extReview.currentDue, extDays) : undefined;
      await submissionService.handleExtension(extReview.submissionId, approved, newDue);
      toast.success(approved ? `Extension approved - new due ${newDue}` : 'Extension declined');
      setExtReview(null);
      await refresh();
    } catch { toast.error('Could not update the extension request'); } finally { setBusy(null); }
  };

  const approve = useCallback(async (item: ApprovalItem) => {
    if (historical) return;
    try {
      setBusy(item.submissionId);
      await submissionService.reviewSubmission(item.submissionId, { rating: 5, feedbackText: 'Approved.', isApproved: true, decision: 'approved' });
      toast.success('Approved - marked complete');
      await refresh();
    } catch { toast.error('Could not approve'); } finally { setBusy(null); }
  }, [refresh, historical]);

  const requestChanges = useCallback(async (item: ApprovalItem) => {
    if (historical) return;
    try {
      setBusy(item.submissionId);
      await submissionService.reviewSubmission(item.submissionId, { rating: 3, feedbackText: 'Please take another pass.', isApproved: false, decision: 'changes', revisionNotes: 'Please take another pass.' });
      toast.success('Changes requested - sent back to the mentee');
      await refresh();
    } catch { toast.error('Could not update'); } finally { setBusy(null); }
  }, [refresh, historical]);

  const mark = useCallback((status: Attendance) => {
    if (!mentee || !editable) return;
    // Toggle off if re-clicking the same mark; persisted on the session entry.
    const current = entriesByMentee[mentee.id]?.attendance ?? null;
    patchEntry(mentee.id, { attendance: current === status ? null : status }, true);
  }, [mentee, editable, entriesByMentee, patchEntry]);

  const finishOrReopen = useCallback(async () => {
    if (!session) return;
    try {
      // Finishing a never-saved draft: create it (flushing seen marks) first.
      const live = session.id ? session : await ensureSession();
      if (!live) return;
      if (live.status === 'in_progress' || live.status === 'draft') {
        const r: any = await mentorApi.finishReviewSession(live.id); // eslint-disable-line @typescript-eslint/no-explicit-any
        setSession(r?.data?.session ?? live);
        const c = (r?.data?.session?.entries || live.entries);
        const present = c.filter((e: ReviewEntry) => e.attendance === 'present').length;
        const absent = c.filter((e: ReviewEntry) => e.attendance === 'absent').length;
        const excused = c.filter((e: ReviewEntry) => e.attendance === 'excused').length;
        toast.success(`Review saved — ${present} present, ${absent} absent, ${excused} excused`);
      } else {
        const r: any = await mentorApi.reopenReviewSession(live.id); // eslint-disable-line @typescript-eslint/no-explicit-any
        setSession(r?.data?.session ?? live);
        toast.success('Review reopened for editing');
      }
    } catch { toast.error('Could not update the review'); }
  }, [session, ensureSession]);

  // ── Deletion lock: admins can lock review-record deletion org-wide for audit
  // integrity. When locked without an active grant, delete/reopen are disabled
  // and the mentor can request time-boxed access. Loaded when history opens. ──
  const [lockState, setLockState] = useState<MentorLockState | null>(null);
  const [requestingAccess, setRequestingAccess] = useState(false);
  const [accessReason, setAccessReason] = useState('');
  const [sendingRequest, setSendingRequest] = useState(false);
  const loadLockState = useCallback(async () => {
    try { setLockState(await reviewLockApi.mentorLockState()); }
    catch { setLockState(null); }
  }, []);
  const locked = !!lockState?.locked;
  const hasGrant = !!lockState?.hasActiveGrant;
  const deletionBlocked = locked && !hasGrant;
  const submitAccessRequest = async () => {
    if (!accessReason.trim()) { toast.error('Add a short reason'); return; }
    try {
      setSendingRequest(true);
      await reviewLockApi.requestUnlock({ reason: accessReason.trim() });
      toast.success('Request sent to your admins.');
      setRequestingAccess(false);
      setAccessReason('');
      await loadLockState();
    } catch (e) { toast.error(extractApiErrorMessage(e, 'Could not send the request')); }
    finally { setSendingRequest(false); }
  };

  const openHistory = useCallback(async () => {
    setHistoryOpen(true);
    setRequestingAccess(false); setAccessReason('');
    loadLockState();
    try { const r: any = await mentorApi.listReviewSessions(effectiveClanId); setSessions(r?.data?.sessions ?? []); } // eslint-disable-line @typescript-eslint/no-explicit-any
    catch { setSessions([]); }
  }, [loadLockState, effectiveClanId]);

  // Manage a saved session from history. Delete is TIERED: an empty session is a
  // one-tap discard; one with recorded data needs an explicit confirm naming what
  // is lost. (A future admin "lock" can disable delete org-wide — enforced server-side.)
  const [busySession, setBusySession] = useState<string | null>(null);

  const sessionIsEmpty = (s: ReviewSessionSummary) =>
    s.counts.reviewed === 0 && s.counts.present === 0 && s.counts.absent === 0 && s.counts.excused === 0 && s.counts.deferred === 0;
  const removeHistorySession = async (s: ReviewSessionSummary) => {
    const dateLabel = new Date(`${s.sessionDate}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const empty = sessionIsEmpty(s);
    const title = empty ? `Discard the empty review for ${dateLabel}?` : `Permanently delete the review for ${dateLabel}?`;
    const description = empty
      ? 'Nothing was recorded, so this just removes the entry.'
      : `This erases ${s.counts.reviewed} reviewed · ${s.counts.present} present · ${s.counts.absent} absent · ${s.counts.excused} excused${s.counts.deferred ? ` · ${s.counts.deferred} deferred` : ''}. This cannot be undone.`;
    if (!(await confirm({ title, description, variant: 'danger', confirmLabel: empty ? 'Discard' : 'Delete' }))) return;
    try {
      setBusySession(s.id);
      await mentorApi.deleteReviewSession(s.id);
      setSessions((prev) => prev.filter((x) => x.id !== s.id));
      toast.success(empty ? 'Session discarded' : 'Session deleted');
      if (s.id === session?.id || sessionParam === s.id) { setHistoryOpen(false); router.push('/mentor/review'); }
    } catch (e: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      toast.error(extractApiErrorMessage(e, 'Could not delete the session'));
      if (e?.response?.status === 403) loadLockState(); // stale lock — re-sync the banner
    }
    finally { setBusySession(null); }
  };
  const reopenHistorySession = async (s: ReviewSessionSummary) => {
    try {
      setBusySession(s.id);
      await mentorApi.reopenReviewSession(s.id);
      setSessions((prev) => prev.map((x) => (x.id === s.id ? { ...x, status: 'in_progress' } : x)));
      toast.success('Session reopened for editing');
      if (s.id === session?.id) loadSession();
    } catch (e: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      toast.error(extractApiErrorMessage(e, 'Could not reopen the session'));
      if (e?.response?.status === 403) loadLockState(); // stale lock — re-sync the banner
    }
    finally { setBusySession(null); }
  };

  // Give the next mentee a heads-up that they're up next, so they're ready.
  const notifyNext = useCallback(async () => {
    const next = cohort[idx + 1];
    if (!next) return;
    const first = next.name.split(' ')[0];
    setPinged((p) => new Set(p).add(next.id)); // optimistic
    try {
      await mentorApi.nudge(next.id, `Heads up ${first} — you're up next in today's clan review. Please be ready 🙌`);
      toast.success(`${first} was told they're up next`);
    } catch {
      setPinged((p) => { const n = new Set(p); n.delete(next.id); return n; });
      toast.error('Could not notify them');
    }
  }, [cohort, idx]);

  const sendNote = async () => {
    if (!mentee || !note.trim()) return;
    try {
      setBusy('note');
      await mentorApi.addMeetingNote(mentee.id, { kind: 'review', summary: note.trim(), sentiment: 'neutral' });
      setNoteSent(true); setNote('');
      toast.success('Note logged');
    } catch { toast.error('Could not log note'); } finally { setBusy(null); }
  };

  const resolveBlocker = async (id: string) => {
    try { setBusy(id); await frictionApi.resolveBlocker(id); setBlockers((b) => b.filter((x) => x.id !== id)); }
    catch { toast.error('Could not resolve'); } finally { setBusy(null); }
  };

  // Mentor logs a blocker on the current mentee's behalf.
  const [showAddBlocker, setShowAddBlocker] = useState(false);
  const [bTitle, setBTitle] = useState('');
  const [bCat, setBCat] = useState('technical');
  const [bSev, setBSev] = useState('medium');
  const addBlocker = async () => {
    if (!bTitle.trim() || !mentee) return;
    try {
      setBusy('add-roadblock');
      const r: any = await frictionApi.createBlocker({ menteeId: mentee.id, title: bTitle.trim(), category: bCat, severity: bSev }); // eslint-disable-line @typescript-eslint/no-explicit-any
      if (r?.data?.blocker) setBlockers((b) => [r.data.blocker, ...b]);
      setBTitle(''); setBCat('technical'); setBSev('medium'); setShowAddBlocker(false);
      toast.success('Roadblock logged');
    } catch { toast.error('Could not add roadblock'); } finally { setBusy(null); }
  };

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Never hijack typing: bail for inputs/selects AND rich-text editors
      // (TipTap is a contenteditable DIV — the old tag-only check missed it, so
      // letters like s/t/a/c fired shortcuts while you were writing).
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return;
      // Also bail while any field-bearing drawer is open (review / assign / task
      // edit / extension / history) — its inputs own the keyboard.
      if (reviewing || assigning || taskDetail || extReview || historyOpen || attOpen || recordOpen) return;
      const k = e.key.toLowerCase();
      if (k === 't') {
        e.preventDefault();
        if (historical) {
          toast.error('This cohort is historical. An admin must reopen the program before assigning tasks.');
          return;
        }
        setAssigning(true);
        return;
      }
      if (k === 'arrowright' || k === 'l') { e.preventDefault(); go(1); }
      else if (k === 'arrowleft' || k === 'h') { e.preventDefault(); go(-1); }
      else if (k === 's') { e.preventDefault(); skip(); }
      else if (k === 'j' || k === 'arrowdown') { e.preventDefault(); setFocus((f) => Math.min(pending.length - 1, f + 1)); }
      else if (k === 'k' || k === 'arrowup') { e.preventDefault(); setFocus((f) => Math.max(0, f - 1)); }
      else if (k === 'a' && pending[focus]) { e.preventDefault(); if (!historical) approve(pending[focus]); }
      else if (k === 'c' && pending[focus]) { e.preventDefault(); if (!historical) requestChanges(pending[focus]); }
      else if (k === 'r' && pending[focus]) { e.preventDefault(); setReviewing(pending[focus]); }
      else if (k === 'p') { e.preventDefault(); mark('present'); }
      else if (k === 'x') { e.preventDefault(); mark('absent'); }
      else if (k === 'e') { e.preventDefault(); mark('excused'); }
      else if (k === '?') { e.preventDefault(); setShowHelp((s) => !s); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, skip, approve, requestChanges, mark, pending, focus, reviewing, assigning, taskDetail, extReview, historyOpen, attOpen, recordOpen]);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-600" /></div>;
  /**
   * Nobody to review.
   *
   * This used to be one grey sentence in an otherwise blank card, which told a
   * mentor who had just had their standing clan approved precisely nothing:
   * not whether something had failed, not whether they were looking at the
   * wrong clan, and not what to do next. The three ways to arrive here are
   * genuinely different situations, so each gets its own answer and its own way
   * out.
   */
  if (!cohort.length) {
    const canAddHere = activeClan?.kind === 'standing' && !historical;
    const state = !clans.length
      ? {
        title: 'You do not mentor a clan yet',
        body: 'Clan review walks you through your mentees one at a time. An admin adds you to a clan as its lead or co-mentor, and this fills in on its own.',
        action: null,
      }
      : historical
        ? {
          title: `${activeClanName || 'This clan'} has finished`,
          body: 'Its programme is closed, so there is nothing left to review here. The work and the feedback are all still readable from each mentee’s record.',
          action: { href: '/mentor/mentees', label: 'Open my mentees' },
        }
        : {
          title: `No one is in ${activeClanName || 'this clan'} yet`,
          body: canAddHere
            ? 'Add the mentees you are carrying forward and their work comes with them. Clan review then steps through them one at a time, here.'
            : 'Once mentees join this clan they appear here, one at a time, with their submissions, blockers and progress.',
          action: canAddHere
            ? { href: '/mentor/clan-team', label: 'Add mentees' }
            : { href: '/mentor/clan-team', label: 'Open clan team' },
        };

    return (
      <div className="mx-auto max-w-2xl overflow-hidden rounded-3xl border border-slate-200 bg-card text-center dark:border-slate-800">
        {/*
            A picture of the screen they are waiting for.
            This was a 12px grey icon in an otherwise blank card — accurate and
            dispiriting, and on a wide monitor almost entirely white space. The
            band below is a small, honest drawing of what clan review looks
            like once somebody is in the clan: a roster rail with a marker
            under the person being reviewed, and the three things the screen
            does for each of them. It fills the space with something that
            teaches rather than with decoration, and it is drawn in brand
            tokens rather than shipped as an image, so it themes and costs
            nothing to load.
        */}
        <div aria-hidden className="relative border-b border-slate-200 bg-linear-to-b from-brand-50/80 to-card px-6 pb-7 pt-9 dark:border-slate-800 dark:from-brand-500/10">
          <div className="mx-auto flex w-full max-w-sm items-end justify-center gap-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <div className={`rounded-full ${i === 2 ? 'h-12 w-12 bg-brand-500/25 ring-2 ring-brand-500/50' : 'h-9 w-9 bg-slate-200/80 dark:bg-slate-700/70'}`} />
                <div className={`rounded-full ${i === 2 ? 'h-1.5 w-8 bg-brand-500/60' : 'h-1.5 w-6 bg-slate-200 dark:bg-slate-700'}`} />
              </div>
            ))}
          </div>
          <div className="mx-auto mt-4 h-2 w-2 rotate-45 rounded-[2px] bg-brand-500/60" />
          <div className="mx-auto mt-3 w-full max-w-sm space-y-2 rounded-2xl border border-slate-200/80 bg-card/80 p-3 text-left shadow-xs dark:border-slate-700/80">
            <div className="h-2 w-24 rounded-full bg-slate-200 dark:bg-slate-700" />
            <div className="h-2 w-40 rounded-full bg-slate-100 dark:bg-slate-800" />
            <div className="flex gap-1.5 pt-1">
              <div className="h-5 w-16 rounded-lg bg-brand-500/20" />
              <div className="h-5 w-14 rounded-lg bg-slate-100 dark:bg-slate-800" />
              <div className="h-5 w-12 rounded-lg bg-slate-100 dark:bg-slate-800" />
            </div>
          </div>
        </div>

        <div className="px-6 pb-12 pt-7">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{state.title}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-500 dark:text-slate-400">{state.body}</p>

        {/* What the screen will actually do, so an empty clan still explains
            the feature rather than only reporting its own emptiness. */}
        <ul className="mx-auto mt-6 grid max-w-lg gap-2 text-left sm:grid-cols-3">
          {[
            { Icon: Users, label: 'One at a time', note: 'Step through the roster without losing your place' },
            { Icon: ClipboardCheck, label: 'Their work', note: 'Submissions, blockers and today’s plan on one card' },
            { Icon: StickyNote, label: 'A note each', note: 'Attendance and a coaching note as you go' },
          ].map(({ Icon, label, note }) => (
            <li key={label} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-900/40">
              <Icon className="h-4 w-4 text-brand-600 dark:text-brand-400" aria-hidden />
              <p className="mt-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100">{label}</p>
              <p className="mt-0.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">{note}</p>
            </li>
          ))}
        </ul>
        {state.action && (
          <Link
            href={state.action.href}
            className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
          >
            {state.action.label}
            <ArrowUpRight className="h-4 w-4" aria-hidden />
          </Link>
        )}
        {/* A multi-clan mentor's commonest reason for an empty screen is simply
            being pointed at the wrong clan. Say so, rather than letting them
            conclude the page is broken. */}
        {clans.length >= 2 && (
          <p className="mt-6 border-t border-slate-100 pt-4 text-xs text-slate-400 dark:border-slate-800">
            Reviewing <span className="font-medium text-slate-600 dark:text-slate-300">{activeClanName || 'this clan'}</span> — switch clan in the sidebar to review another.
          </p>
        )}
        </div>
      </div>
    );
  }

  // The current index can briefly point past the end right after the cohort
  // shrinks (e.g. you just paused this mentee). Render nothing for that one
  // frame instead of dereferencing an undefined mentee and crashing.
  if (!mentee) return (
    <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-600" /></div>
  );

  const risk = RISK_PILL[mentee!.risk];
  const pendingCount = (session?.entries || []).filter((e) => e.status === 'pending').length;
  const allSeen = (session?.entries?.length ?? 0) > 0 && pendingCount === 0;
  const sessionDateLabel = session?.sessionDate
    ? new Date(`${session.sessionDate}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    : '';

  return (
    <div className="space-y-6 pb-20 lg:pb-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-slate-900 text-xl sm:text-2xl font-bold">Clan review</h1>
            {sessionDateLabel && (
              <span className="inline-flex items-center gap-1 text-xs text-slate-500 bg-slate-100 rounded-full px-2.5 py-0.5"><CalendarDays className="w-3 h-3" />{sessionDateLabel}</span>
            )}
            {session?.status === 'finished' && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-0.5"><CheckCircle2 className="w-3 h-3" />Finished</span>
            )}
          </div>
          <p className="text-slate-600 text-xs sm:text-sm mt-0.5">{idx + 1} of {cohort.length} · {session?.title || 'review each mentee, then finish'}</p>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          <button onClick={() => setScheduleOpen(true)} disabled={historical} title={historical ? HISTORICAL_TITLE : 'Recurring reviews'} className="px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-lg border border-slate-200 text-slate-700 text-xs sm:text-sm hover:bg-slate-50 inline-flex items-center gap-1 disabled:opacity-50"><CalendarClock className="w-3.5 h-3.5 sm:w-4 sm:h-4" /><span className="hidden sm:inline">Schedule</span></button>
          <button onClick={openHistory} className="px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-lg border border-slate-200 text-slate-700 text-xs sm:text-sm hover:bg-slate-50 inline-flex items-center gap-1" title="Past reviews"><History className="w-3.5 h-3.5 sm:w-4 sm:h-4" /><span className="hidden sm:inline">History</span></button>
          <button onClick={() => setAssigning(true)} disabled={historical} title={historical ? 'Completed programs are read-only' : 'Assign a task (t)'} className="px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-lg border border-slate-200 text-slate-700 text-xs sm:text-sm hover:bg-slate-50 inline-flex items-center gap-1 disabled:opacity-50"><Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />Assign task</button>
          <button onClick={() => setShowHelp(true)} className="p-1.5 sm:p-2 rounded-lg text-slate-400 hover:bg-slate-100 hidden sm:inline-flex" title="Shortcuts"><Keyboard className="w-4 h-4" /></button>
          {/* The live-review button lands here, from the meeting panel. */}
          <div ref={setMeetingSlot} className="contents" />
          <div className="hidden sm:flex items-center gap-1.5 ml-1">
            <button onClick={() => go(-1)} disabled={idx === 0} className="px-3 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm hover:bg-slate-50 disabled:opacity-40 inline-flex items-center gap-1"><ChevronLeft className="w-4 h-4" />Prev</button>
            <button onClick={skip} className="px-3 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm hover:bg-slate-50 inline-flex items-center gap-1"><SkipForward className="w-4 h-4" />Skip</button>
            <button onClick={() => go(1)} disabled={idx === cohort.length - 1} className="px-3 py-2 rounded-lg bg-brand-600 text-white text-sm hover:bg-brand-700 disabled:opacity-40 inline-flex items-center gap-1">Next<ChevronRight className="w-4 h-4" /></button>
          </div>
          {/*
              Finishing is the end of the job this screen exists for, and it was
              the very last thing on the page — under the tallies, under the
              notes, below the fold on every laptop. It goes where the other
              session-level actions already are.

              It turns solid only once everyone has been seen, so it reads as
              "ready" rather than as the obvious next click from the start.
          */}
          <button
            onClick={finishOrReopen}
            disabled={historical}
            title={historical ? HISTORICAL_TITLE : (allSeen ? 'Finish this review' : `${pendingCount} still to review`)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium sm:px-3 sm:py-2 sm:text-sm disabled:opacity-50 ${
              session?.status === 'finished'
                ? 'border border-slate-200 text-slate-700 hover:bg-slate-50'
                : allSeen
                  // Everyone has been seen: the one thing left to do, and it
                  // breathes once it becomes true rather than from the start.
                  ? 'animate-pm-ready bg-emerald-600 text-white hover:bg-emerald-700'
                  : 'border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300'
            }`}
          >
            {session?.status === 'finished'
              ? (<><RotateCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />Reopen</>)
              : (<><CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />{allSeen ? 'Finish' : `Finish · ${pendingCount} left`}</>)}
          </button>
        </div>
      </div>

      {/* The clan is chosen in the sidebar — there is no second control here.
          The name is shown for orientation, because which clan's session you are
          running is not otherwise visible on this screen. */}
      {clans.length >= 2 && activeClanName && (
        <div className="flex items-center gap-2 border-b border-slate-200 pb-2 text-sm">
          <span className="font-medium text-slate-700">{activeClanName}</span>
          <span className="text-xs text-slate-400">· switch clans in the sidebar</span>
        </div>
      )}

      {/* Live video (Jitsi): start the room, auto-attendance, contribution points.
          Idle it is a button in the header; live it is the call, here. */}
      {session && (session.id || isDraft) && (
        <ReviewMeetingPanel sessionId={session.id} isDraft={isDraft} ensureSession={ensureSession} onAttendanceSync={syncMeetingAttendance} onEnded={loadSession} readOnly={historical} buttonSlot={meetingSlot} />
      )}

      {/* Attendance Strip — now also the home of the mentee search. */}
      <AttendanceSection
        cohort={cohort}
        attendance={attendance}
        activeMenteeId={menteeId}
        onSelectMentee={selectMentee}
        onSaveAttendance={patchMultipleEntries}
        isSaving={isSavingAttendance}
        readOnly={historical}
        search={menteeSearch}
      />

      {deferred.size > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-amber-800">Deferred:</span>
          {[...deferred].map((id) => {
            const m = cohort.find((x) => x.id === id);
            if (!m) return null;
            return <button key={id} onClick={() => selectMentee(cohort.indexOf(m))} className="px-2 py-0.5 rounded-full bg-card border border-amber-300 text-amber-700 text-xs">{m.name.split(' ')[0]}</button>;
          })}
        </div>
      )}

      {sessionError && !sessionLoading && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 flex items-center gap-3 text-sm">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <span className="text-amber-800">Couldn&apos;t load the review session, so attendance, deferrals and notes won&apos;t be saved. This usually means the cohort-review tables aren&apos;t set up on the server yet.</span>
          <button onClick={loadSession} className="ml-auto shrink-0 px-3 py-1.5 rounded-lg border border-amber-300 text-amber-800 text-xs font-medium hover:bg-amber-100">Retry</button>
        </div>
      )}

      {/* "Up next" was a full-width bar of its own between the roster and the
          mentee — a whole row to carry one name. It is in the side rail now,
          with the other things that are about the session rather than about
          the person in front of you. */}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main */}
        <div className="lg:col-span-2 space-y-5">
          {/* Mentee card */}
          <div className="bg-card rounded-2xl border border-slate-200 p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0 w-full sm:w-auto">
                <Avatar name={mentee!.name} src={mentee!.profilePictureUrl} initials={mentee!.avatar} size="lg" href={`/mentor/mentees/${mentee!.id}`} />

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-semibold text-slate-900 text-base sm:text-lg truncate">{mentee!.name}</h2>
                    {mentee!.isNew && (
                      <span
                        title={mentee!.daysSinceJoined != null ? `Joined ${mentee!.daysSinceJoined === 0 ? 'today' : `${mentee!.daysSinceJoined} day${mentee!.daysSinceJoined === 1 ? '' : 's'} ago`}` : 'New to the platform'}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"
                      >
                        <Sparkles className="w-3 h-3" /> New mentee
                      </span>
                    )}
                    <MomentumIcon m={mentee!.momentum} />
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-medium ${risk.cls}`}><span className={`w-1.5 h-1.5 rounded-full ${risk.dot}`} />{risk.label}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">{mentee!.level} · Wk {mentee!.week}/{mentee!.totalWeeks || '-'} · {mentee!.onTimeRate}% on-time</div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto border-t sm:border-t-0 border-slate-100 pt-2 sm:pt-0 w-full sm:w-auto justify-end">
                <NudgeButton menteeId={mentee!.id} menteeName={mentee!.name} variant="icon" disabled={historical} />
                {/* Reviewing someone is exactly when you realise they'd do better
                    with another mentor — so the move lives here too, not only on
                    the profile. */}
                <MoveMenteeButton menteeId={mentee!.id} menteeName={mentee!.name} variant="icon" disabled={historical} />
                {/* Their record everywhere else in the org. The dot is the only
                    thing that leaks out onto the card, and only when they are
                    mid-way through something in another clan — which is the one
                    fact that changes what you assign next. */}
                <button
                  type="button"
                  onClick={() => setRecordOpen(true)}
                  title={elsewhere.length
                    ? `Work history · ${elsewhere.length} active item${elsewhere.length === 1 ? '' : 's'} in other clans`
                    : 'Work history across clans'}
                  aria-label="Work history across clans"
                  className="relative p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-brand-50"
                >
                  <History className="w-4 h-4" />
                  {elsewhere.length > 0 && (
                    <span aria-hidden className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-brand-500" />
                  )}
                </button>
                {/* Work whose mentor did not come across with them is not
                    carried on its own — see `_autoContinueFor`. This is the
                    button that finishes that job, and it hides itself when
                    there is nothing left to continue. */}
                {activeClan?.kind === 'standing' && (
                  <ContinueWorkLauncher
                    clanId={activeClan.id}
                    menteeId={mentee!.id}
                    variant="link"
                    onContinued={refresh}
                  />
                )}
                <button
                  onClick={pauseCurrent}
                  disabled={pausing || historical}
                  title={historical ? HISTORICAL_TITLE : 'Pause this mentee (stopped attending)'}
                  aria-label="Pause this mentee"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:hover:text-slate-200 dark:hover:bg-slate-800"
                >
                  <PauseCircle className="w-4 h-4" />
                </button>
                <Link href={`/mentor/mentees/${mentee!.id}`} className="text-xs text-brand-600 hover:text-brand-700 inline-flex items-center gap-0.5 px-2 py-1 rounded-md hover:bg-brand-50">Profile <ArrowUpRight className="w-3.5 h-3.5" /></Link>
              </div>
            </div>
            {/*
                The suggestion sits next to the button that acts on it. Both
                choices are one click, and saying WHY is what makes it a
                suggestion rather than a nag.
            */}
            {pauseHint && !historical && (
              // The suggestion sits on the card, next to the button that acts
              // on it, and says why. Not amber: this is the product noticing
              // something on the mentor's behalf, not a warning about a
              // failure, and the rest of this run took that colour out.
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/50">
                <PauseCircle className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                <p className="min-w-0 flex-1 text-xs text-slate-600 dark:text-slate-300">
                  <span className="font-medium text-slate-900 dark:text-slate-100">They have stopped turning up.</span>{' '}
                  {pauseHint.neverAttended
                    ? `Never attended — ${pauseHint.missedReviews} review${pauseHint.missedReviews === 1 ? '' : 's'} held since they joined.`
                    : pauseHint.reason || `Missed the last ${pauseHint.missedReviews} review${pauseHint.missedReviews === 1 ? '' : 's'}.`}
                  {' '}Pausing takes them out of your reports; they stay in the clan.
                </p>
                <button
                  type="button"
                  onClick={pauseCurrent}
                  disabled={pausing}
                  className="shrink-0 rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {pausing ? 'Pausing…' : 'Pause'}
                </button>
                <button
                  type="button"
                  onClick={dismissPauseHint}
                  className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200/70 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Keep active
                </button>
              </div>
            )}
            <div className="mt-3"><DualProgress absolute={mentee!.absoluteProgress} relative={mentee!.relativeProgress} row /></div>
            {mentee!.riskReason && <p className="mt-2 text-xs text-slate-500">{mentee!.riskReason}</p>}
          </div>

          {/* Today's blocks and how far through them they are — the schedule
              finally showing up in review, where the conversation happens. */}
          <PlanStripCard
            menteeId={mentee.id}
            menteeName={mentee.name}
            clanId={effectiveClanId}
            readOnly={historical}
            compact
          />

          {/* Day-by-day progress used to be a card of its own here, repeating
              the titles already listed below and pushing the review down the
              page. It lives in the task drawer now — open the task and the log
              is on it, which is where a mentor is already looking when they
              want to ask about it. */}

          {/* Work in other clans and the continuation button both used to live
              here as full-width panels. They are on the mentee card now: this
              column is for the review itself. */}

          {/* State of this mentee - same read as the profile (AI summary + signals). */}
          {profile?.aiSummary && (
            <AISummaryPanel summary={profile.aiSummary} signals={profile.aiSignals || []} collapsible />
          )}

          {/* Extension requests - mentee asked to move a due date; mentor decides here. */}
          {pendingExtensions.length > 0 && (
            <div className="bg-amber-50/60 dark:bg-amber-500/10 rounded-2xl border border-amber-200 dark:border-amber-500/30">
              <div className="px-5 py-4 border-b border-amber-200/70 dark:border-amber-500/30 flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-amber-600" />
                <h3 className="text-slate-900 font-medium">Extension requests</h3>
                <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full">{pendingExtensions.length}</span>
              </div>
              <div className="p-4 space-y-2">
                {pendingExtensions.map((ext) => (
                  <div key={ext.submissionId} className="flex items-center gap-3 p-3 rounded-xl bg-card border border-amber-200/70 dark:border-amber-500/20">
                    <CalendarClock className="w-4 h-4 text-amber-500 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900 truncate">{ext.taskTitle}</p>
                      {ext.reason && <p className="text-xs text-slate-500 truncate">&ldquo;{ext.reason}&rdquo;</p>}
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        {ext.days != null && <span>+{ext.days} day{ext.days === 1 ? '' : 's'} requested</span>}
                        {ext.currentDue && <><span className="text-slate-300">·</span><span>due {new Date(ext.currentDue).toLocaleDateString()}</span></>}
                      </div>
                    </div>
                    <button onClick={() => openExtReview(ext)} disabled={historical}
                      title={historical ? HISTORICAL_TITLE : undefined}
                      className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium disabled:opacity-50">
                      Review
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/*
              One surface for this mentee's work.

              "To review", "Assigned work" and the finished pile were three
              stacked cards, and the queue that is the whole point of the screen
              sat on top of a long accordion — so the side rail, the notes and
              the blockers were always below the fold. The counts are on the
              tabs, so nothing looks missing when it is not the one showing.
          */}
          <div className="bg-card rounded-2xl border border-slate-200">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2.5 sm:px-4">
              <div role="tablist" aria-label="This mentee's work" className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                {([
                  { key: 'review' as const, label: 'To review', count: pending.length, icon: ClipboardCheck, tone: 'brand' },
                  { key: 'progress' as const, label: 'In progress', count: inProgressTasks.length, icon: ListTodo, tone: 'slate' },
                  { key: 'done' as const, label: 'Completed', count: completedTasks.length, icon: CheckCircle2, tone: 'emerald' },
                ]).map((tab) => {
                  const active = workTab === tab.key;
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setWorkTab(tab.key)}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors ${
                        active
                          ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                          : 'text-muted-foreground hover:bg-slate-50 hover:text-slate-800 dark:hover:bg-white/5 dark:hover:text-white'
                      }`}
                    >
                      <Icon className={`h-4 w-4 ${active ? 'text-brand-600' : 'text-slate-400'}`} aria-hidden />
                      {tab.label}
                      {/* A count only earns a badge when there is something to
                          count — a row of zeroes is noise on every tab. */}
                      {tab.count > 0 && (
                        <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                          tab.tone === 'brand' && tab.key === 'review'
                            ? 'bg-brand-600 text-white'
                            : tab.tone === 'emerald'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                        }`}>
                          {tab.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <button onClick={() => setAssigning(true)} disabled={historical} title={historical ? HISTORICAL_TITLE : undefined}
                className="ml-auto inline-flex shrink-0 items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 disabled:opacity-50">
                <Plus className="w-3.5 h-3.5" />Assign
              </button>
            </div>

            <div className="p-4">
              {workTab === 'review' && (
                pending.length === 0 ? (
                  <p className="text-sm text-slate-500 flex items-center gap-2 px-1 py-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" />Nothing waiting. All clear.</p>
                ) : (
                  <div className="space-y-2">
                    {pending.map((item, i) => (
                      <button key={item.submissionId} onClick={() => { setFocus(i); setReviewing(item); }}
                        className={`group w-full text-left flex items-center gap-3 p-3 rounded-xl border transition-colors ${i === focus ? 'border-brand-300 bg-brand-50 dark:bg-brand-500/15' : 'border-slate-200 hover:border-brand-300'}`}>
                        <span className="w-9 h-9 rounded-xl bg-brand-50 dark:bg-brand-500/15 flex items-center justify-center shrink-0">
                          <ClipboardCheck className="w-4 h-4 text-brand-600" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-900 truncate">{item.title}</p>
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            {item.type && <span className="capitalize">{item.type}</span>}
                            {typeof item.version === 'number' && item.version > 1 && <span>v{item.version}</span>}
                            {item.isLate && <span className="inline-flex items-center gap-1 text-red-600"><Clock className="w-3 h-3" />late</span>}
                          </div>
                        </div>
                        <span className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-brand-600 group-hover:bg-brand-700 text-white text-xs font-medium">
                          Review &amp; decide <ChevronRight className="w-3.5 h-3.5" />
                        </span>
                      </button>
                    ))}
                  </div>
                )
              )}

              {workTab === 'progress' && (
                tasksLoading ? (
                  <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-brand-600" /></div>
                ) : inProgressTasks.length === 0 ? (
                  <p className="text-sm text-slate-500 px-1 py-2">Nothing on {mentee!.name.split(' ')[0]}&rsquo;s plate — use Assign to give them their next task.</p>
                ) : (
                  <div className="space-y-1.5">{inProgressTasks.map(renderTaskRow)}</div>
                )
              )}

              {workTab === 'done' && (
                tasksLoading ? (
                  <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-brand-600" /></div>
                ) : completedTasks.length === 0 ? (
                  <p className="text-sm text-slate-500 px-1 py-2">Nothing finished in this clan yet.</p>
                ) : (
                  <div className="space-y-1.5">{completedTasks.map(renderTaskRow)}</div>
                )
              )}
            </div>
          </div>

        </div>

        {/* Side rail */}
        <div className="space-y-4">
          {/*
              Who follows, and the one action that belongs to them.

              Their face rather than only their name: this screen is a row of
              faces, so the handover reads faster as the next face than as
              text. Silent on the last mentee, where there is no "next".
          */}
          {cohort[idx + 1] && (
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-card p-3 dark:border-slate-800">
              <Avatar
                name={cohort[idx + 1].name}
                src={cohort[idx + 1].profilePictureUrl}
                initials={cohort[idx + 1].avatar}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Up next</p>
                <button
                  type="button"
                  onClick={() => selectMentee(idx + 1)}
                  className="block max-w-full truncate text-sm font-medium text-slate-900 hover:text-brand-700 dark:text-slate-100"
                >
                  {cohort[idx + 1].name}
                </button>
              </div>
              <button
                onClick={notifyNext}
                disabled={pinged.has(cohort[idx + 1].id)}
                title={pinged.has(cohort[idx + 1].id) ? 'Already told them' : 'Let them know they are next'}
                aria-label={pinged.has(cohort[idx + 1].id) ? 'Already notified' : 'Let them know they are next'}
                className="shrink-0 rounded-lg border border-slate-200 p-2 text-slate-500 transition-colors hover:border-brand-300 hover:text-brand-700 disabled:cursor-default disabled:opacity-60 dark:border-slate-700"
              >
                {pinged.has(cohort[idx + 1].id)
                  ? <Check className="h-4 w-4 text-emerald-600" />
                  : <Send className="h-4 w-4" />}
              </button>
            </div>
          )}

          {/* Attendance */}
          <div className="bg-card rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-slate-900">Attendance</h3>
              <button onClick={() => setAttOpen(true)}
                className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
                <History className="w-3.5 h-3.5" /> History
              </button>
            </div>
            <div className="flex gap-2">
              {(['present', 'absent', 'excused'] as Attendance[]).map((s) => (
                <button key={s} onClick={() => mark(s)} disabled={!editable}
                  title={historical ? HISTORICAL_TITLE : undefined}
                  className={`flex-1 px-2 py-1.5 rounded-lg border text-xs font-medium capitalize transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${attendance[mentee!.id] === s ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                  {s}
                </button>
              ))}
            </div>
            {lastMeeting?.status && (
              <button onClick={() => setAttOpen(true)} className="text-[11px] text-slate-500 mt-2.5 inline-flex items-center gap-1.5 hover:text-slate-700">
                <span className={`w-1.5 h-1.5 rounded-full ${lastMeeting.status === 'present' ? 'bg-emerald-500' : lastMeeting.status === 'excused' ? 'bg-amber-500' : 'bg-rose-500'}`} />
                Last meeting: <span className="font-medium capitalize text-slate-700">{lastMeeting.status}</span>
                {lastMeeting.date && (
                  <span className="text-slate-400">· {new Date(`${lastMeeting.date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                )}
              </button>
            )}
            {session?.status === 'finished' && <p className="text-[11px] text-slate-400 mt-2">This review is finished — reopen it to make changes.</p>}
            {!session && !sessionLoading && <p className="text-[11px] text-amber-600 mt-2">Couldn&apos;t load today&apos;s review session — marks won&apos;t save until it loads.</p>}
          </div>

          {/* Quick note */}
          <div className="bg-card rounded-2xl border border-slate-200 p-5">
            <h3 className="font-semibold text-slate-900 mb-2">Quick note</h3>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="A coaching note…"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-500" />
            <button onClick={sendNote} disabled={busy === 'note' || !note.trim() || historical} title={historical ? HISTORICAL_TITLE : undefined} className="mt-2 w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium disabled:opacity-50">
              {busy === 'note' ? <Loader2 className="w-4 h-4 animate-spin" /> : noteSent ? <Check className="w-4 h-4" /> : <Send className="w-4 h-4" />}{noteSent ? 'Logged' : 'Log note'}
            </button>
          </div>

          {/* Blockers */}
          <div className="bg-card rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-slate-900 flex items-center gap-2"><Flag className="w-4 h-4 text-red-500" />Open roadblocks</h3>
              <button onClick={() => setShowAddBlocker(true)} disabled={historical} title={historical ? HISTORICAL_TITLE : 'Log a roadblock'} className="p-1 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-slate-100 disabled:opacity-50"><Plus className="w-4 h-4" /></button>
            </div>
            {blockers.length === 0 ? (
              <p className="text-sm text-slate-500">None open.</p>
            ) : (
              <div className="space-y-2">
                {blockers.map((b) => (
                  <div key={b.id} className="flex items-start justify-between gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="min-w-0">
                      <p className="text-sm text-slate-900">{b.title}</p>
                      <p className="text-xs text-slate-500 capitalize">{b.severity} · {b.category}</p>
                    </div>
                    <button onClick={() => resolveBlocker(b.id)} disabled={busy === b.id || historical} title={historical ? HISTORICAL_TITLE : undefined} className="text-emerald-600 hover:text-emerald-700 shrink-0 disabled:opacity-50">
                      {busy === b.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Progress / finish */}
          <div className="bg-card rounded-2xl border border-slate-200 p-5">
            <h3 className="font-semibold text-slate-900 mb-3">Session progress</h3>
            <div className="text-sm space-y-1.5">
              <div className="flex justify-between"><span className="text-slate-500">Reviewed</span><span className="font-medium text-slate-900">{seen.size}/{cohort.length}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Present</span><span className="font-medium text-slate-900">{Object.values(attendance).filter((v) => v === 'present').length}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Absent</span><span className="font-medium text-slate-900">{Object.values(attendance).filter((v) => v === 'absent').length}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Excused</span><span className="font-medium text-slate-900">{Object.values(attendance).filter((v) => v === 'excused').length}</span></div>
              <div className="flex justify-between"><span className="text-amber-600">Deferred</span><span className="font-medium text-amber-600">{deferred.size}</span></div>
            </div>
            {deferred.size > 0 && editable && (
              <div className="mt-3 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                {deferred.size} deferred — jump to them from the dots above before finishing.
              </div>
            )}
            {/* Finishing moved to the header, where the other session-level
                actions are and where it is actually visible. This card keeps
                the tallies that tell you whether you are ready to. */}
            {session?.status === 'finished' && session?.finishedAt && (
              <p className="mt-3 text-[11px] text-slate-500 text-center">Finished {new Date(session.finishedAt).toLocaleString()}</p>
            )}
          </div>
        </div>
      </div>

      {/* Log a blocker for the current mentee */}
      <Drawer
        open={showAddBlocker}
        onClose={() => setShowAddBlocker(false)}
        title="Log a roadblock"
        subtitle={mentee ? `Capture what's slowing ${mentee.name.split(' ')[0]} down.` : undefined}
        footer={
          <>
            <button onClick={() => setShowAddBlocker(false)} className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-sm hover:bg-slate-50">Cancel</button>
            <button onClick={addBlocker} disabled={busy === 'add-roadblock' || !bTitle.trim()} className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50">
              {busy === 'add-roadblock' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}Log roadblock
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">What&apos;s blocking them?</label>
            <textarea value={bTitle} onChange={(e) => setBTitle(e.target.value)} rows={2} placeholder="e.g. Stuck on async patterns" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-500" autoFocus />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
            <select value={bCat} onChange={(e) => setBCat(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm capitalize focus:outline-none focus:ring-2 focus:ring-brand-500">
              {['technical', 'knowledge', 'access', 'personal'].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Severity</label>
            <select value={bSev} onChange={(e) => setBSev(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm capitalize focus:outline-none focus:ring-2 focus:ring-brand-500">
              {['low', 'medium', 'high'].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
      </Drawer>

      {/* Extension request: adjust days, then approve or decline */}
      <Drawer
        open={!!extReview}
        onClose={() => setExtReview(null)}
        title="Review extension request"
        subtitle={extReview ? extReview.taskTitle : undefined}
        footer={
          <>
            <button onClick={() => decideExtension(false)} disabled={busy === 'extension' || historical} title={historical ? HISTORICAL_TITLE : undefined}
              className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-sm hover:bg-slate-50 disabled:opacity-50">
              Decline
            </button>
            <button onClick={() => decideExtension(true)} disabled={busy === 'extension' || historical} title={historical ? HISTORICAL_TITLE : undefined}
              className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50">
              {busy === 'extension' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}Approve
            </button>
          </>
        }
      >
        {extReview && (
          <div className="space-y-4">
            {extReview.reason && (
              <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Their reason</p>
                <p className="text-sm text-slate-700">&ldquo;{extReview.reason}&rdquo;</p>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Extend by (days)</label>
              <input type="number" min={1} max={60} value={extDays}
                onChange={(e) => setExtDays(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              <p className="mt-1.5 text-xs text-slate-500">
                {extReview.currentDue ? <>Current due {new Date(extReview.currentDue).toLocaleDateString()} → </> : <>New due </>}
                <span className="font-medium text-slate-700">{new Date(computeNewDue(extReview.currentDue, extDays)).toLocaleDateString()}</span>
                {extReview.days != null && extReview.days !== extDays && <span className="text-slate-400"> · they asked for {extReview.days}</span>}
              </p>
            </div>
          </div>
        )}
      </Drawer>

      {/* Review the right way for the task's type — interview + quiz have their
          own review UIs; everything else uses the generic ReviewDrawer. */}
      {reviewing && reviewing.type === 'interview' && (
        <InterviewReviewDrawer taskId={reviewing.taskId} onClose={() => setReviewing(null)} onFinalized={refresh} readOnly={historical} />
      )}
      {reviewing && reviewing.type === 'quiz' && (
        <QuizReviewDrawer taskId={reviewing.taskId} onClose={() => setReviewing(null)} onReviewed={refresh} readOnly={historical} />
      )}
      {reviewing && reviewing.type !== 'interview' && reviewing.type !== 'quiz' && (
        <ReviewDrawer item={reviewing} onClose={() => setReviewing(null)} onReviewed={refresh} readOnly={historical} />
      )}

      {/* Opening a task also respects its type, so an interview/quiz doesn't fall
          into the generic task drawer. */}
      {taskDetail && (() => {
        const taskType = taskDetail.roadmapTask?.type || taskDetail.type;
        if (taskType === 'interview') {
          return <InterviewReviewDrawer taskId={taskDetail.id} onClose={() => setTaskDetail(null)} onFinalized={refresh} readOnly={historical} />;
        }
        if (taskType === 'quiz') {
          return <QuizReviewDrawer taskId={taskDetail.id} onClose={() => setTaskDetail(null)} onReviewed={refresh} readOnly={historical} />;
        }
        return <MenteeTaskDrawer key={taskDetail.id} task={taskDetail} onClose={() => setTaskDetail(null)} onChanged={refresh} readOnly={historical} />;
      })()}

      {assigning && mentee && (
        <AssignTaskDrawer
          mode="single"
          mentee={{
            id: mentee.id,
            name: mentee.name,
            avatarUrl: mentee.profilePictureUrl,
            clanName: mentee.clan?.name ?? null,
            taskCount: mentee.taskCount,
            pendingApprovals: mentee.pendingApprovals,
            openBlockers: mentee.openBlockers,
            risk: mentee.risk,
            level: mentee.level,
          }}
          onClose={() => setAssigning(false)}
          onAssigned={refresh}
        />
      )}

      {/* Recurring reviews: set up / cancel weekly-biweekly reviews with invites. */}
      <ReviewScheduleDrawer
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        clans={clans}
        defaultClanId={effectiveClanId}
        readOnly={historical}
      />

      {/* Cohort-review history: browse & open past dated sessions to view or edit. */}
      <Drawer open={historyOpen} onClose={() => setHistoryOpen(false)} width="md" title="Clan review history" subtitle="Open a past session to view or edit it">
        {/* Deletion lock: org-enforced for audit integrity. Mentor can request access. */}
        {deletionBlocked && (
          <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-500/10 dark:border-amber-500/30 px-4 py-3">
            <div className="flex items-start gap-2.5">
              <Lock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-amber-800 dark:text-amber-200">Deletion is locked by your organization for audit integrity.</p>
                {lockState?.pendingRequest ? (
                  <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-amber-700"><Clock className="w-3.5 h-3.5" />Request pending review</p>
                ) : requestingAccess ? (
                  <div className="mt-2.5 space-y-2">
                    <textarea
                      value={accessReason}
                      onChange={(e) => setAccessReason(e.target.value)}
                      rows={2}
                      autoFocus
                      placeholder="Why do you need to edit or delete a review record?"
                      className="w-full border border-amber-300 dark:border-amber-500/40 rounded-lg px-3 py-2 text-sm bg-card resize-none focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                    <div className="flex items-center gap-2">
                      <button onClick={submitAccessRequest} disabled={sendingRequest || !accessReason.trim()}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium disabled:opacity-50">
                        {sendingRequest ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}Send request
                      </button>
                      <button onClick={() => { setRequestingAccess(false); setAccessReason(''); }} className="px-3 py-1.5 rounded-lg text-xs font-medium text-amber-700 hover:bg-amber-100/60">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setRequestingAccess(true)}
                    className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-300 text-amber-800 text-xs font-medium hover:bg-amber-100/60">
                    Request access
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
        {locked && hasGrant && (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-500/10 dark:border-emerald-500/30 px-4 py-2.5 flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300">
            <Unlock className="w-3.5 h-3.5 shrink-0" />
            Editing unlocked{lockState?.grantExpiresAt ? <> until {new Date(lockState.grantExpiresAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</> : ''}.
          </div>
        )}
        {sessions.length > 0 && <ReviewHistoryCalendar dates={sessions.map((s) => s.sessionDate)} selected={historyDate} onSelect={setHistoryDate} />}
        <div className="space-y-2">
          {sessions.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-10">No saved reviews yet.</p>
          ) : sessions.filter((s) => !historyDate || s.sessionDate === historyDate).map((s) => {
            const isCurrent = s.id === session?.id;
            const dateLabel = new Date(`${s.sessionDate}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
            const busy = busySession === s.id;
            return (
              <div key={s.id}
                className={`rounded-xl border px-3.5 py-3 transition-colors ${isCurrent ? 'border-brand-300 bg-brand-50 dark:bg-brand-500/10' : 'border-slate-200 dark:border-slate-700 hover:border-brand-300'}`}>
                <div className="flex items-start justify-between gap-2">
                  <button type="button" onClick={() => { setHistoryOpen(false); router.push(`/mentor/review?session=${s.id}`); }} className="min-w-0 flex-1 text-left">
                    <span className="text-sm font-medium text-slate-900 inline-flex flex-wrap items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5 text-slate-400" />{dateLabel}
                    </span>
                    {s.title && <p className="text-xs text-slate-500 mt-0.5">{s.title}</p>}
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-[11px] text-slate-500">
                      <span>{s.counts.reviewed}/{s.counts.total} reviewed</span>
                      <span className="text-emerald-600">{s.counts.present} present</span>
                      <span className="text-red-500">{s.counts.absent} absent</span>
                      <span>{s.counts.excused} excused</span>
                      {s.counts.deferred > 0 && <span className="text-amber-600">{s.counts.deferred} deferred</span>}
                    </div>
                  </button>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${s.status === 'finished' ? 'bg-emerald-100 text-emerald-700' : 'bg-sky-100 text-sky-700'}`}>{s.status === 'finished' ? 'Finished' : 'In progress'}</span>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-1 mt-2 pt-2 border-t border-slate-100 dark:border-slate-700/60">
                  {s.status === 'finished' && (
                    <button type="button" onClick={() => reopenHistorySession(s)} disabled={busy || deletionBlocked || historical}
                      className="px-2 py-1 rounded-md text-xs font-medium text-slate-600 hover:bg-slate-100 inline-flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed" title={historical ? HISTORICAL_TITLE : deletionBlocked ? 'Locked by your org' : 'Reopen to edit'}>
                      <RotateCcw className="w-3.5 h-3.5" />Reopen
                    </button>
                  )}
                  <button type="button" onClick={() => removeHistorySession(s)} disabled={busy || deletionBlocked || historical}
                    className="px-2 py-1 rounded-md text-xs font-medium text-red-600 hover:bg-red-50 inline-flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                    title={historical ? HISTORICAL_TITLE : deletionBlocked ? 'Locked by your org' : sessionIsEmpty(s) ? 'Discard empty session' : 'Delete session'}>
                    {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : deletionBlocked ? <Lock className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
                    {sessionIsEmpty(s) ? 'Discard' : 'Delete'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </Drawer>

      {/* Per-mentee attendance history — every clan review they were marked on,
          newest first. A late-joiner simply has no entries before they joined. */}
      <Drawer open={attOpen} onClose={() => setAttOpen(false)} width="md"
        title="Attendance history"
        subtitle={mentee ? `${mentee.name} · ${attHistory.length} recorded meeting${attHistory.length === 1 ? '' : 's'}` : undefined}>
        <AttendanceHistoryCalendar key={`${mentee?.id}-${attHistory[0]?.date || "empty"}`} entries={attHistory} />
      </Drawer>

      {/* Everything this mentee has done in the organisation, clan by clan —
          the same record as their profile's History tab, so there is one answer
          to "what have they already done" and not two.

          Open work in other clans is listed first: it is the part that changes
          what you assign in the next few minutes. The rest is background. */}
      <Drawer open={recordOpen} onClose={() => setRecordOpen(false)} width="lg"
        title="Work history"
        subtitle={mentee ? `${mentee.name} · across every clan in this organisation` : undefined}>
        {mentee && (
          <div className="space-y-4">
            {elsewhere.length > 0 && (
              <section className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5 dark:border-slate-800 dark:bg-slate-900/50" aria-label="Open work in other clans">
                <div className="flex items-start gap-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-card text-slate-500 dark:border-slate-700">
                    <ListTodo className="h-4 w-4" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">Open right now in other clans</h3>
                      <span className="rounded-full border border-slate-200 bg-card px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:border-slate-700 dark:text-slate-400">Context only</span>
                    </div>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                      {elsewhere.length} active item{elsewhere.length === 1 ? '' : 's'} — so you do not assign the same thing twice.
                    </p>
                  </div>
                </div>
                <ul className="mt-3 space-y-1.5">
                  {elsewhere.map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-200/80 bg-card px-2.5 py-2 text-[11px] dark:border-slate-800">
                      <span className="min-w-0 flex-1 font-medium text-slate-800 dark:text-slate-200">{t.title}</span>
                      <span className="rounded-full bg-sky-50 px-1.5 py-0.5 font-medium capitalize text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">{t.status.replace(/_/g, ' ')}</span>
                      <span className="text-slate-500 dark:text-slate-400">{t.clanName}</span>
                      {t.assignedByViewer && <span className="text-slate-400">· assigned by you</span>}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <MenteeRecordPanel menteeId={mentee.id} />
            <Link
              href={`/mentor/mentees/${mentee.id}`}
              className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-800 dark:text-brand-300"
            >
              Open their full profile <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
        )}
      </Drawer>

      {showHelp && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowHelp(false)}>
          <div className="bg-card rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-slate-900 mb-3">Keyboard shortcuts</h3>
            <div className="space-y-1.5 text-sm text-slate-600">
              {[['← / →', 'Prev / next mentee'], ['S', 'Skip (defer)'], ['J / K', 'Focus next / prev submission'], ['A', 'Approve focused'], ['C', 'Request changes'], ['R', 'Open full review'], ['T', 'Assign a task'], ['P / X / E', 'Present / absent / excused'], ['?', 'Toggle this help']].map(([k, d]) => (
                <div key={k} className="flex justify-between gap-4"><kbd className="px-1.5 py-0.5 bg-slate-100 rounded text-xs font-mono">{k}</kbd><span className="text-right flex-1">{d}</span></div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Mobile sticky action bar for clan review */}
      <MobileReviewActionBar
        currentIndex={idx}
        totalCount={cohort.length}
        onPrev={() => go(-1)}
        onSkip={skip}
        onNext={() => go(1)}
        canPrev={idx > 0}
        canNext={idx < cohort.length - 1}
      />
    </div>
  );
}
