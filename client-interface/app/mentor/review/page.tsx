'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  ChevronLeft, ChevronRight, SkipForward, Check, Loader2,
  TrendingUp, TrendingDown, Minus, Flag, Clock, ClipboardCheck, Keyboard, CheckCircle2, ArrowUpRight, Send, Plus, ListTodo, CalendarClock,
  Trash2, X, History, RotateCcw, CalendarDays, AlertTriangle, StickyNote,
} from 'lucide-react';
import Link from 'next/link';
import { useMentorCohort, useMentorApprovals, type CohortMentee, type CohortMomentum, type CohortRisk, type ApprovalItem } from '@/lib/hooks/mentor';
import { useAuth } from '@/lib/context/AuthContext';
import { mentorApi } from '@/lib/services/mentor-api';
import { taskApi } from '@/lib/services/task-api';
import { submissionService } from '@/lib/services/submissionService';
import { frictionApi } from '@/lib/services/friction-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { DualProgress } from '@/components/mentor/DualProgress';
import { AISummaryPanel } from '@/components/mentor/AISummaryPanel';
import { NudgeButton } from '@/components/mentor/NudgeButton';
import { ReviewDrawer } from '@/components/mentor/ReviewDrawer';
import { AssignTaskDrawer } from '@/components/mentor/AssignTaskDrawer';
import { MenteeTaskDrawer } from '@/components/mentor/MenteeTaskDrawer';
import { Drawer } from '@/components/shared/Drawer';

type Attendance = 'present' | 'absent' | 'excused';
type EntryStatus = 'pending' | 'reviewed' | 'deferred';
interface ReviewEntry { id?: string; menteeId: string; attendance: Attendance | null; status: EntryStatus; note?: string | null; mentee?: { id: string; name: string } | null }
// `draft` = today's session that doesn't exist on the server yet. It's created
// lazily on the first real action so merely opening the page leaves no record.
interface ReviewSession { id: string; sessionDate: string; title: string | null; status: 'in_progress' | 'finished' | 'draft'; note: string | null; finishedAt?: string | null; entries: ReviewEntry[] }
interface ReviewSessionSummary extends Omit<ReviewSession, 'entries'> { counts: { total: number; present: number; absent: number; excused: number; reviewed: number; deferred: number } }

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
const TASK_STATUS_ORDER = ['revision_needed', 'submitted', 'in_progress', 'assigned', 'not_started', 'completed', 'cancelled'];

export default function CohortReview() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { cohort, loading } = useMentorCohort();
  const { queue, refetch: refetchQueue } = useMentorApprovals();

  const [idx, setIdx] = useState(0);
  const [tasks, setTasks] = useState<any[]>([]); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [tasksLoading, setTasksLoading] = useState(false);
  const [profile, setProfile] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any -- full mentee profile (aiSummary/signals)
  // The dated, saved cohort-review session (today by default, or ?session=<id>).
  // attendance / seen / deferred are derived from its entries — nothing ephemeral.
  const [session, setSession] = useState<ReviewSession | null>(null);
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

  const mentee: CohortMentee | undefined = cohort[idx];
  const menteeId = mentee?.id;
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
        : await mentorApi.getTodayReviewSession();
      const loaded = r?.data?.session ?? null;
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
  }, [sessionParam]);
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
  const editable = session?.status === 'in_progress' || session?.status === 'draft';
  const isDraft = session?.status === 'draft';

  // Create today's session on the first real action, flushing any "seen" marks
  // accumulated while it was a draft. Returns the now-persisted session. The
  // in-flight guard dedupes concurrent first-actions so we never create two
  // sessions for the same day on rapid clicks.
  const ensureRef = useRef<Promise<ReviewSession | null> | null>(null);
  const ensureSession = useCallback(async (): Promise<ReviewSession | null> => {
    if (session && session.id) return session;
    if (ensureRef.current) return ensureRef.current;
    const run = (async (): Promise<ReviewSession | null> => {
      const r: any = await mentorApi.createReviewSession({}); // eslint-disable-line @typescript-eslint/no-explicit-any
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
  }, [session]);

  // Optimistically patch one mentee's entry, then persist. `commit` marks a
  // deliberate action (attendance/defer/finish) that should create today's
  // session if it's still a draft; passive "seen on view" marks (commit=false)
  // only accumulate locally until a deliberate action commits them.
  const upsert = (entries: ReviewEntry[], mId: string, patch: Partial<ReviewEntry>): ReviewEntry[] =>
    entries.some((e) => e.menteeId === mId)
      ? entries.map((e) => (e.menteeId === mId ? { ...e, ...patch } : e))
      : [...entries, { menteeId: mId, attendance: null, status: 'pending', ...patch } as ReviewEntry];

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

  // Load open blockers + assigned tasks + the full profile (state/summary) for
  // the current mentee; reset state.
  useEffect(() => {
    if (!mentee) return;
    setFocus(0); setNote(''); setNoteSent(false); setBlockers([]); setTasks([]); setProfile(null);
    frictionApi.listBlockers(mentee.id, 'open').then((r: any) => setBlockers(r?.data?.blockers ?? [])).catch(() => {}); // eslint-disable-line @typescript-eslint/no-explicit-any
    mentorApi.getMenteeProfile(mentee.id).then((r: any) => setProfile(r?.data?.profile ?? r?.data ?? null)).catch(() => setProfile(null)); // eslint-disable-line @typescript-eslint/no-explicit-any
    // The mentee's FULL task list (every assignment, whoever made it) — not just
    // the viewer's own — so a co-mentor sees the same work as the lead.
    setTasksLoading(true);
    taskApi.getMenteeTasks(mentee.id)
      .then((r: any) => setTasks(r?.data?.tasks ?? [])) // eslint-disable-line @typescript-eslint/no-explicit-any
      .catch(() => setTasks([]))
      .finally(() => setTasksLoading(false));
  }, [mentee?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Landing on a mentee marks them "reviewed" (seen) — but only if still pending,
  // so a deferred mentee stays deferred and we never loop. Finished sessions stay put.
  useEffect(() => {
    if (!editable || !menteeId) return;
    const e = entriesByMentee[menteeId];
    if (e && e.status === 'pending') patchEntry(menteeId, { status: 'reviewed' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menteeId, session?.id, editable]);

  // The mentee's assigned work, grouped by status (their "day"). 'submitted'
  // tasks live in the "To review" queue below, so exclude them here.
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
  const taskGroups = useMemo(() => {
    const by: Record<string, any[]> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
    dayTasks.forEach((t) => { const k = t.status || 'assigned'; (by[k] = by[k] || []).push(t); });
    return TASK_STATUS_ORDER.filter((s) => by[s]?.length).map((s) => ({ status: s, items: by[s] }));
  }, [dayTasks]);

  // Latest mentor note + rating for a task, surfaced on reviewed/changes rows.
  const reviewOf = (t: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const fb = t.submissions?.[0]?.feedback;
    if (!fb) return { note: null as string | null, rating: null as number | null };
    const note = t.status === 'revision_needed'
      ? (fb.revisionNotes || fb.feedbackText || null)
      : t.status === 'completed' ? (fb.feedbackText || null) : null;
    const r = Number(fb.rating);
    return { note, rating: t.status === 'completed' && Number.isFinite(r) && r > 0 ? r : null };
  };

  const go = useCallback((delta: number) => {
    setIdx((i) => Math.max(0, Math.min(cohort.length - 1, i + delta)));
  }, [cohort.length]);

  const skip = useCallback(() => {
    if (mentee && editable) patchEntry(mentee.id, { status: 'deferred' }, true);
    go(1);
  }, [mentee, go, editable, patchEntry]);

  // Refresh the queue + the CURRENT mentee's tasks. Keyed on the live mentee so
  // actions never refetch a stale/previous mentee (the old bug).
  const refresh = useCallback(async () => {
    await refetchQueue();
    if (menteeId) {
      try { const r: any = await taskApi.getMenteeTasks(menteeId); setTasks(r?.data?.tasks ?? []); } catch { /* keep prior */ } // eslint-disable-line @typescript-eslint/no-explicit-any
    }
  }, [refetchQueue, menteeId]);

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
    if (typeof window !== 'undefined' && !window.confirm('Unassign this task from the mentee? It will be removed from their list.')) return;
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
    try {
      setBusy(item.submissionId);
      await submissionService.reviewSubmission(item.submissionId, { rating: 5, feedbackText: 'Approved.', isApproved: true, decision: 'approved' });
      toast.success('Approved - marked complete');
      await refresh();
    } catch { toast.error('Could not approve'); } finally { setBusy(null); }
  }, [refresh]);

  const requestChanges = useCallback(async (item: ApprovalItem) => {
    try {
      setBusy(item.submissionId);
      await submissionService.reviewSubmission(item.submissionId, { rating: 3, feedbackText: 'Please take another pass.', isApproved: false, decision: 'changes', revisionNotes: 'Please take another pass.' });
      toast.success('Changes requested - sent back to the mentee');
      await refresh();
    } catch { toast.error('Could not update'); } finally { setBusy(null); }
  }, [refresh]);

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

  const openHistory = useCallback(async () => {
    setHistoryOpen(true);
    try { const r: any = await mentorApi.listReviewSessions(); setSessions(r?.data?.sessions ?? []); } // eslint-disable-line @typescript-eslint/no-explicit-any
    catch { setSessions([]); }
  }, []);

  // Manage a saved session from history. Delete is TIERED: an empty session is a
  // one-tap discard; one with recorded data needs an explicit confirm naming what
  // is lost. (A future admin "lock" can disable delete org-wide — enforced server-side.)
  const [busySession, setBusySession] = useState<string | null>(null);
  const sessionIsEmpty = (s: ReviewSessionSummary) =>
    s.counts.reviewed === 0 && s.counts.present === 0 && s.counts.absent === 0 && s.counts.excused === 0 && s.counts.deferred === 0;
  const removeHistorySession = async (s: ReviewSessionSummary) => {
    const dateLabel = new Date(`${s.sessionDate}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const empty = sessionIsEmpty(s);
    const msg = empty
      ? `Discard the empty review for ${dateLabel}? Nothing was recorded, so this just removes the entry.`
      : `Permanently delete the review for ${dateLabel}?\n\nThis erases ${s.counts.reviewed} reviewed · ${s.counts.present} present · ${s.counts.absent} absent · ${s.counts.excused} excused${s.counts.deferred ? ` · ${s.counts.deferred} deferred` : ''}.\n\nThis cannot be undone.`;
    if (typeof window !== 'undefined' && !window.confirm(msg)) return;
    try {
      setBusySession(s.id);
      await mentorApi.deleteReviewSession(s.id);
      setSessions((prev) => prev.filter((x) => x.id !== s.id));
      toast.success(empty ? 'Session discarded' : 'Session deleted');
      if (s.id === session?.id || sessionParam === s.id) { setHistoryOpen(false); router.push('/mentor/review'); }
    } catch (e) { toast.error(extractApiErrorMessage(e, 'Could not delete the session')); }
    finally { setBusySession(null); }
  };
  const reopenHistorySession = async (s: ReviewSessionSummary) => {
    try {
      setBusySession(s.id);
      await mentorApi.reopenReviewSession(s.id);
      setSessions((prev) => prev.map((x) => (x.id === s.id ? { ...x, status: 'in_progress' } : x)));
      toast.success('Session reopened for editing');
      if (s.id === session?.id) loadSession();
    } catch (e) { toast.error(extractApiErrorMessage(e, 'Could not reopen the session')); }
    finally { setBusySession(null); }
  };

  // Give the next mentee a heads-up that they're up next, so they're ready.
  const notifyNext = useCallback(async () => {
    const next = cohort[idx + 1];
    if (!next) return;
    const first = next.name.split(' ')[0];
    setPinged((p) => new Set(p).add(next.id)); // optimistic
    try {
      await mentorApi.nudge(next.id, `Heads up ${first} — you're up next in today's cohort review. Please be ready 🙌`);
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
      setBusy('add-blocker');
      const r: any = await frictionApi.createBlocker({ menteeId: mentee.id, title: bTitle.trim(), category: bCat, severity: bSev }); // eslint-disable-line @typescript-eslint/no-explicit-any
      if (r?.data?.blocker) setBlockers((b) => [r.data.blocker, ...b]);
      setBTitle(''); setBCat('technical'); setBSev('medium'); setShowAddBlocker(false);
      toast.success('Blocker logged');
    } catch { toast.error('Could not add blocker'); } finally { setBusy(null); }
  };

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || reviewing || assigning) return;
      const k = e.key.toLowerCase();
      if (k === 't') { e.preventDefault(); setAssigning(true); return; }
      if (k === 'arrowright' || k === 'l') { e.preventDefault(); go(1); }
      else if (k === 'arrowleft' || k === 'h') { e.preventDefault(); go(-1); }
      else if (k === 's') { e.preventDefault(); skip(); }
      else if (k === 'j' || k === 'arrowdown') { e.preventDefault(); setFocus((f) => Math.min(pending.length - 1, f + 1)); }
      else if (k === 'k' || k === 'arrowup') { e.preventDefault(); setFocus((f) => Math.max(0, f - 1)); }
      else if (k === 'a' && pending[focus]) { e.preventDefault(); approve(pending[focus]); }
      else if (k === 'c' && pending[focus]) { e.preventDefault(); requestChanges(pending[focus]); }
      else if (k === 'r' && pending[focus]) { e.preventDefault(); setReviewing(pending[focus]); }
      else if (k === 'p') { e.preventDefault(); mark('present'); }
      else if (k === 'x') { e.preventDefault(); mark('absent'); }
      else if (k === 'e') { e.preventDefault(); mark('excused'); }
      else if (k === '?') { e.preventDefault(); setShowHelp((s) => !s); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, skip, approve, requestChanges, mark, pending, focus, reviewing, assigning]);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-600" /></div>;
  if (!cohort.length) return (
    <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center max-w-2xl">
      <p className="text-slate-600">No mentees to review yet.</p>
    </div>
  );

  const risk = RISK_PILL[mentee!.risk];
  const pendingCount = (session?.entries || []).filter((e) => e.status === 'pending').length;
  const allSeen = (session?.entries?.length ?? 0) > 0 && pendingCount === 0;
  const sessionDateLabel = session?.sessionDate
    ? new Date(`${session.sessionDate}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    : '';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-slate-900">Cohort review</h1>
            {sessionDateLabel && (
              <span className="inline-flex items-center gap-1 text-xs text-slate-500 bg-slate-100 rounded-full px-2 py-0.5"><CalendarDays className="w-3 h-3" />{sessionDateLabel}</span>
            )}
            {session?.status === 'finished' && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5"><CheckCircle2 className="w-3 h-3" />Finished</span>
            )}
          </div>
          <p className="text-slate-600 text-sm">{idx + 1} of {cohort.length} · {session?.title || 'review each mentee, then finish'}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={openHistory} className="px-3 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm hover:bg-slate-50 inline-flex items-center gap-1" title="Past reviews"><History className="w-4 h-4" />History</button>
          <button onClick={() => setAssigning(true)} className="px-3 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm hover:bg-slate-50 inline-flex items-center gap-1" title="Assign a task (t)"><Plus className="w-4 h-4" />Assign task</button>
          <button onClick={() => setShowHelp(true)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100" title="Shortcuts"><Keyboard className="w-4 h-4" /></button>
          <button onClick={() => go(-1)} disabled={idx === 0} className="px-3 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm hover:bg-slate-50 disabled:opacity-40 inline-flex items-center gap-1"><ChevronLeft className="w-4 h-4" />Prev</button>
          <button onClick={skip} className="px-3 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm hover:bg-slate-50 inline-flex items-center gap-1"><SkipForward className="w-4 h-4" />Skip</button>
          <button onClick={() => go(1)} disabled={idx === cohort.length - 1} className="px-3 py-2 rounded-lg bg-brand-600 text-white text-sm hover:bg-brand-700 disabled:opacity-40 inline-flex items-center gap-1">Next<ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>

      {/* Progress dots */}
      <div className="flex flex-wrap items-center gap-1.5">
        {cohort.map((m, i) => {
          const a = attendance[m.id];
          const cls = i === idx ? 'bg-slate-900' : a === 'present' ? 'bg-emerald-500' : a === 'absent' ? 'bg-red-500' : seen.has(m.id) ? 'bg-slate-400' : 'bg-slate-200';
          return <button key={m.id} onClick={() => setIdx(i)} title={m.name} className={`w-2.5 h-2.5 rounded-full ${cls}`} />;
        })}
      </div>

      {deferred.size > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-amber-800">Deferred:</span>
          {[...deferred].map((id) => {
            const m = cohort.find((x) => x.id === id);
            if (!m) return null;
            return <button key={id} onClick={() => setIdx(cohort.indexOf(m))} className="px-2 py-0.5 rounded-full bg-card border border-amber-300 text-amber-700 text-xs">{m.name.split(' ')[0]}</button>;
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

      {/* Up next: let the next mentee know it's nearly their turn so they're ready. */}
      {cohort[idx + 1] && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 dark:bg-slate-800/40 px-4 py-2.5 flex items-center gap-3 text-sm">
          <span className="inline-flex items-center gap-1.5 text-slate-500 shrink-0"><ChevronRight className="w-4 h-4" />Up next</span>
          <span className="font-medium text-slate-900 truncate">{cohort[idx + 1].name}</span>
          <button onClick={notifyNext} disabled={pinged.has(cohort[idx + 1].id)}
            className="ml-auto shrink-0 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 text-xs font-medium hover:border-brand-300 inline-flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-default">
            {pinged.has(cohort[idx + 1].id)
              ? (<><Check className="w-3.5 h-3.5 text-emerald-600" />Notified</>)
              : (<><Send className="w-3.5 h-3.5" />Let them know they&apos;re next</>)}
          </button>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main */}
        <div className="lg:col-span-2 space-y-5">
          {/* Mentee card */}
          <div className="bg-card rounded-2xl border border-slate-200 p-5">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 bg-brand-100 rounded-full flex items-center justify-center shrink-0"><span className="text-brand-700 font-semibold">{mentee!.avatar}</span></div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold text-slate-900 truncate">{mentee!.name}</h2>
                  <MomentumIcon m={mentee!.momentum} />
                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-medium ${risk.cls}`}><span className={`w-1.5 h-1.5 rounded-full ${risk.dot}`} />{risk.label}</span>
                </div>
                <div className="mt-0.5 text-xs text-slate-500">{mentee!.level} · Wk {mentee!.week}/{mentee!.totalWeeks || '-'} · {mentee!.onTimeRate}% on-time</div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <NudgeButton menteeId={mentee!.id} menteeName={mentee!.name} variant="icon" />
                <Link href={`/mentor/mentees/${mentee!.id}`} className="text-xs text-brand-600 hover:text-brand-700 inline-flex items-center gap-0.5">Profile <ArrowUpRight className="w-3.5 h-3.5" /></Link>
              </div>
            </div>
            <div className="mt-4"><DualProgress absolute={mentee!.absoluteProgress} relative={mentee!.relativeProgress} compact /></div>
            {mentee!.riskReason && <p className="mt-3 text-xs text-slate-500 border-t border-slate-100 pt-3">{mentee!.riskReason}</p>}
          </div>

          {/* State of this mentee - same read as the profile (AI summary + signals). */}
          {profile?.aiSummary && (
            <AISummaryPanel summary={profile.aiSummary} signals={profile.aiSignals || []} />
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
                    <button onClick={() => openExtReview(ext)}
                      className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium">
                      Review
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Assigned work - everything currently on this mentee's plate */}
          <div className="bg-card rounded-2xl border border-slate-200">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
              <ListTodo className="w-4 h-4 text-brand-500" />
              <h3 className="text-slate-900 font-medium">Assigned work</h3>
              {dayTasks.length > 0 && <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded-full">{dayTasks.length}</span>}
              <button onClick={() => setAssigning(true)} className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"><Plus className="w-3.5 h-3.5" />Assign</button>
            </div>
            <div className="p-4">
              {tasksLoading ? (
                <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
              ) : dayTasks.length === 0 ? (
                <p className="text-sm text-slate-500 px-1 py-2">Nothing assigned yet - use Assign to give {mentee!.name.split(' ')[0]} their first task.</p>
              ) : (
                <div className="space-y-4">
                  {taskGroups.map((g) => {
                    const meta = TASK_STATUS_META[g.status] ?? TASK_STATUS_META.assigned;
                    return (
                      <div key={g.status}>
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{meta.label}</span>
                          <span className="text-xs text-slate-400">{g.items.length}</span>
                        </div>
                        <div className="space-y-1.5">
                          {g.items.map((t: any) => { /* eslint-disable-line @typescript-eslint/no-explicit-any */
                            const due = t.dueDate ? new Date(t.dueDate) : null;
                            const overdue = due && t.status !== 'completed' && due.getTime() < Date.now();
                            const { note, rating } = reviewOf(t);
                            const canManage = !['cancelled'].includes(t.status);
                            const canUnassign = !['submitted', 'completed', 'cancelled'].includes(t.status);
                            const isEditingDue = editingDue === t.id;
                            const busy = busyTaskId === t.id;
                            return (
                              <div key={t.id} className="p-2.5 rounded-xl border border-slate-200">
                                <div className="flex items-center gap-3">
                                  <button type="button" onClick={() => setTaskDetail(t)} className="min-w-0 flex-1 text-left group">
                                    <p className="text-sm text-slate-900 truncate group-hover:text-brand-600 group-hover:underline">
                                      {t.roadmapTask?.title || t.title || 'Task'}
                                      {t.hasOverrides && <span className="ml-1.5 align-middle text-[10px] font-medium text-amber-600">• customized</span>}
                                    </p>
                                    <div className="flex items-center gap-2 text-xs text-slate-500">
                                      {t.roadmapTask?.type && <span className="capitalize">{t.roadmapTask.type}</span>}
                                      {due && <span className={overdue ? 'text-red-600 inline-flex items-center gap-1' : ''}>{overdue && <Clock className="w-3 h-3" />}due {due.toLocaleDateString()}</span>}
                                      {rating != null && <span className="inline-flex items-center gap-0.5 text-amber-600"><CheckCircle2 className="w-3 h-3" />{rating}★</span>}
                                      {t.mentorNote && <span className="inline-flex items-center gap-0.5 text-amber-600"><StickyNote className="w-3 h-3" />note</span>}
                                    </div>
                                  </button>
                                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${meta.cls}`}>{meta.label}</span>
                                  {canManage && (
                                    <div className="flex items-center gap-0.5 shrink-0">
                                      <button onClick={() => { setEditingDue(isEditingDue ? null : t.id); setDueVal(t.dueDate ? new Date(t.dueDate).toISOString().split('T')[0] : ''); }}
                                        title="Change deadline" className="p-1 text-slate-400 hover:text-brand-600 disabled:opacity-40" disabled={busy}>
                                        <CalendarClock className="w-3.5 h-3.5" />
                                      </button>
                                      {canUnassign && (
                                        <button onClick={() => unassignTask(t.id)} title="Unassign task"
                                          className="p-1 text-slate-400 hover:text-red-500 disabled:opacity-40" disabled={busy}>
                                          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                        </button>
                                      )}
                                    </div>
                                  )}
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
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Submissions to review */}
          <div className="bg-card rounded-2xl border border-slate-200">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4 text-brand-500" />
              <h3 className="text-slate-900 font-medium">To review</h3>
              {pending.length > 0 && <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded-full">{pending.length}</span>}
            </div>
            <div className="p-4">
              {pending.length === 0 ? (
                <p className="text-sm text-slate-500 flex items-center gap-2 px-1 py-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" />Nothing waiting - all clear.</p>
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
              )}
            </div>
          </div>
        </div>

        {/* Side rail */}
        <div className="space-y-4">
          {/* Attendance */}
          <div className="bg-card rounded-2xl border border-slate-200 p-5">
            <h3 className="font-semibold text-slate-900 mb-3">Attendance</h3>
            <div className="flex gap-2">
              {(['present', 'absent', 'excused'] as Attendance[]).map((s) => (
                <button key={s} onClick={() => mark(s)} disabled={!editable}
                  className={`flex-1 px-2 py-1.5 rounded-lg border text-xs font-medium capitalize transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${attendance[mentee!.id] === s ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                  {s}
                </button>
              ))}
            </div>
            {session?.status === 'finished' && <p className="text-[11px] text-slate-400 mt-2">This review is finished — reopen it to make changes.</p>}
            {!session && !sessionLoading && <p className="text-[11px] text-amber-600 mt-2">Couldn&apos;t load today&apos;s review session — marks won&apos;t save until it loads.</p>}
          </div>

          {/* Quick note */}
          <div className="bg-card rounded-2xl border border-slate-200 p-5">
            <h3 className="font-semibold text-slate-900 mb-2">Quick note</h3>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="A coaching note…"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-500" />
            <button onClick={sendNote} disabled={busy === 'note' || !note.trim()} className="mt-2 w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium disabled:opacity-50">
              {busy === 'note' ? <Loader2 className="w-4 h-4 animate-spin" /> : noteSent ? <Check className="w-4 h-4" /> : <Send className="w-4 h-4" />}{noteSent ? 'Logged' : 'Log note'}
            </button>
          </div>

          {/* Blockers */}
          <div className="bg-card rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-slate-900 flex items-center gap-2"><Flag className="w-4 h-4 text-red-500" />Open blockers</h3>
              <button onClick={() => setShowAddBlocker(true)} title="Log a blocker" className="p-1 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-slate-100"><Plus className="w-4 h-4" /></button>
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
                    <button onClick={() => resolveBlocker(b.id)} disabled={busy === b.id} className="text-emerald-600 hover:text-emerald-700 shrink-0">
                      {busy === b.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Progress / finish */}
          <div className="bg-[#0f172a] rounded-2xl p-5 text-white">
            <div className="text-sm space-y-1">
              <div className="flex justify-between"><span className="text-slate-300">Reviewed</span><span>{seen.size}/{cohort.length}</span></div>
              <div className="flex justify-between"><span className="text-slate-300">Present</span><span>{Object.values(attendance).filter((v) => v === 'present').length}</span></div>
              <div className="flex justify-between"><span className="text-slate-300">Absent</span><span>{Object.values(attendance).filter((v) => v === 'absent').length}</span></div>
              <div className="flex justify-between"><span className="text-slate-300">Excused</span><span>{Object.values(attendance).filter((v) => v === 'excused').length}</span></div>
              <div className="flex justify-between"><span className="text-amber-300">Deferred</span><span className="text-amber-300">{deferred.size}</span></div>
            </div>
            {deferred.size > 0 && editable && (
              <div className="mt-3 rounded-lg bg-amber-500/15 border border-amber-500/30 px-3 py-2 text-xs text-amber-200">
                {deferred.size} deferred — jump to them from the dots above before finishing.
              </div>
            )}
            <button onClick={finishOrReopen}
              className={`mt-4 w-full px-3 py-2 rounded-xl text-sm font-medium inline-flex items-center justify-center gap-1.5 ${session?.status === 'finished' ? 'bg-card/10 text-white hover:bg-card/20' : allSeen ? 'bg-card text-slate-900 hover:bg-slate-100' : 'bg-card/10 text-white/80 hover:bg-card/20'}`}>
              {session?.status === 'finished'
                ? (<><RotateCcw className="w-4 h-4" />Reopen to edit</>)
                : allSeen ? 'Finish review' : `Finish (${pendingCount} not reviewed)`}
            </button>
            {session?.status === 'finished' && session?.finishedAt && (
              <p className="mt-2 text-[11px] text-slate-400 text-center">Finished {new Date(session.finishedAt).toLocaleString()}</p>
            )}
          </div>
        </div>
      </div>

      {/* Log a blocker for the current mentee */}
      <Drawer
        open={showAddBlocker}
        onClose={() => setShowAddBlocker(false)}
        title="Log a blocker"
        subtitle={mentee ? `Capture what's slowing ${mentee.name.split(' ')[0]} down.` : undefined}
        footer={
          <>
            <button onClick={() => setShowAddBlocker(false)} className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-sm hover:bg-slate-50">Cancel</button>
            <button onClick={addBlocker} disabled={busy === 'add-blocker' || !bTitle.trim()} className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50">
              {busy === 'add-blocker' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}Log blocker
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
            <button onClick={() => decideExtension(false)} disabled={busy === 'extension'}
              className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-sm hover:bg-slate-50 disabled:opacity-50">
              Decline
            </button>
            <button onClick={() => decideExtension(true)} disabled={busy === 'extension'}
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

      {reviewing && <ReviewDrawer item={reviewing} onClose={() => setReviewing(null)} onReviewed={refresh} />}

      {taskDetail && <MenteeTaskDrawer task={taskDetail} onClose={() => setTaskDetail(null)} onChanged={refresh} />}

      {assigning && mentee && (
        <AssignTaskDrawer
          mode="single"
          mentee={{ id: mentee.id, name: mentee.name }}
          onClose={() => setAssigning(false)}
          onAssigned={refresh}
        />
      )}

      {/* Cohort-review history: browse & open past dated sessions to view or edit. */}
      <Drawer open={historyOpen} onClose={() => setHistoryOpen(false)} width="md" title="Cohort review history" subtitle="Open a past session to view or edit it">
        <div className="space-y-2">
          {sessions.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-10">No saved reviews yet.</p>
          ) : sessions.map((s) => {
            const isCurrent = s.id === session?.id;
            const dateLabel = new Date(`${s.sessionDate}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
            const busy = busySession === s.id;
            return (
              <div key={s.id}
                className={`rounded-xl border px-3.5 py-3 transition-colors ${isCurrent ? 'border-brand-300 bg-brand-50 dark:bg-brand-500/10' : 'border-slate-200 dark:border-slate-700 hover:border-brand-300'}`}>
                <div className="flex items-start justify-between gap-2">
                  <button type="button" onClick={() => { setHistoryOpen(false); router.push(`/mentor/review?session=${s.id}`); }} className="min-w-0 flex-1 text-left">
                    <span className="text-sm font-medium text-slate-900 inline-flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5 text-slate-400" />{dateLabel}</span>
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
                    <button type="button" onClick={() => reopenHistorySession(s)} disabled={busy}
                      className="px-2 py-1 rounded-md text-xs font-medium text-slate-600 hover:bg-slate-100 inline-flex items-center gap-1 disabled:opacity-50" title="Reopen to edit">
                      <RotateCcw className="w-3.5 h-3.5" />Reopen
                    </button>
                  )}
                  <button type="button" onClick={() => removeHistorySession(s)} disabled={busy}
                    className="px-2 py-1 rounded-md text-xs font-medium text-red-600 hover:bg-red-50 inline-flex items-center gap-1 disabled:opacity-50"
                    title={sessionIsEmpty(s) ? 'Discard empty session' : 'Delete session'}>
                    {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    {sessionIsEmpty(s) ? 'Discard' : 'Delete'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
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
    </div>
  );
}
