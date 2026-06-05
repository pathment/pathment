'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ChevronLeft, ChevronRight, SkipForward, Check, MessageSquarePlus, Loader2,
  TrendingUp, TrendingDown, Minus, Flag, Clock, ClipboardCheck, Keyboard, CheckCircle2, ArrowUpRight, Send, Plus, ListTodo,
} from 'lucide-react';
import Link from 'next/link';
import { useMentorCohort, useMentorApprovals, type CohortMentee, type CohortMomentum, type CohortRisk, type ApprovalItem } from '@/lib/hooks/mentor';
import { useAuth } from '@/lib/context/AuthContext';
import { mentorApi } from '@/lib/services/mentor-api';
import { taskApi } from '@/lib/services/task-api';
import { submissionService } from '@/lib/services/submissionService';
import { frictionApi } from '@/lib/services/friction-api';
import { DualProgress } from '@/components/mentor/DualProgress';
import { ReviewDrawer } from '@/components/mentor/ReviewDrawer';
import { AssignTaskDrawer } from '@/components/mentor/AssignTaskDrawer';
import { Drawer } from '@/components/shared/Drawer';

type Attendance = 'present' | 'absent' | 'excused';

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
  const { user } = useAuth();
  const { cohort, loading } = useMentorCohort();
  const { queue, refetch: refetchQueue } = useMentorApprovals();

  const [idx, setIdx] = useState(0);
  const [tasks, setTasks] = useState<any[]>([]); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [tasksLoading, setTasksLoading] = useState(false);
  const [attendance, setAttendance] = useState<Record<string, Attendance>>({});
  const [deferred, setDeferred] = useState<Set<string>>(new Set());
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState(0);
  const [blockers, setBlockers] = useState<any[]>([]);
  const [note, setNote] = useState('');
  const [noteSent, setNoteSent] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<ApprovalItem | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const mentee: CohortMentee | undefined = cohort[idx];
  const pending = useMemo(
    () => queue.filter((q) => q.mentee?.id === mentee?.id),
    [queue, mentee?.id]
  );

  // Load open blockers + assigned tasks for the current mentee; reset state.
  useEffect(() => {
    if (!mentee) return;
    setFocus(0); setNote(''); setNoteSent(false); setBlockers([]); setTasks([]);
    setSeen((s) => new Set(s).add(mentee.id));
    frictionApi.listBlockers(mentee.id, 'open').then((r: any) => setBlockers(r?.data?.blockers ?? [])).catch(() => {});
    if (user?.id) {
      setTasksLoading(true);
      taskApi.getMentorTasks(user.id, { menteeId: mentee.id })
        .then((r: any) => setTasks(r?.data?.tasks ?? []))
        .catch(() => setTasks([]))
        .finally(() => setTasksLoading(false));
    }
  }, [mentee?.id, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // The mentee's assigned work, grouped by status (their "day").
  const taskGroups = useMemo(() => {
    const by: Record<string, any[]> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
    tasks.forEach((t) => { const k = t.status || 'assigned'; (by[k] = by[k] || []).push(t); });
    return TASK_STATUS_ORDER.filter((s) => by[s]?.length).map((s) => ({ status: s, items: by[s] }));
  }, [tasks]);

  const go = useCallback((delta: number) => {
    setIdx((i) => Math.max(0, Math.min(cohort.length - 1, i + delta)));
  }, [cohort.length]);

  const skip = useCallback(() => {
    if (mentee) setDeferred((d) => new Set(d).add(mentee.id));
    go(1);
  }, [mentee, go]);

  const refresh = async () => {
    await refetchQueue();
    if (user?.id && mentee) {
      try { const r: any = await taskApi.getMentorTasks(user.id, { menteeId: mentee.id }); setTasks(r?.data?.tasks ?? []); } catch { /* keep prior */ }
    }
  };

  const approve = useCallback(async (item: ApprovalItem) => {
    try {
      setBusy(item.submissionId);
      await submissionService.reviewSubmission(item.submissionId, { rating: 5, feedbackText: 'Approved.', isApproved: true, decision: 'approved' });
      toast.success('Approved');
      await refresh();
    } catch { toast.error('Could not approve'); } finally { setBusy(null); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const requestChanges = useCallback(async (item: ApprovalItem) => {
    try {
      setBusy(item.submissionId);
      await submissionService.reviewSubmission(item.submissionId, { rating: 3, feedbackText: 'Please take another pass.', isApproved: false, decision: 'changes', revisionNotes: 'Please take another pass.' });
      toast.success('Changes requested');
      await refresh();
    } catch { toast.error('Could not update'); } finally { setBusy(null); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const mark = useCallback((status: Attendance) => {
    if (mentee) setAttendance((a) => ({ ...a, [mentee.id]: status }));
  }, [mentee]);

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
      const r: any = await frictionApi.createBlocker({ menteeId: mentee.id, title: bTitle.trim(), category: bCat, severity: bSev });
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
  const allSeen = seen.size >= cohort.length && deferred.size === 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-slate-900">Cohort review</h1>
          <p className="text-slate-600 text-sm">{idx + 1} of {cohort.length} · review each mentee, then finish</p>
        </div>
        <div className="flex items-center gap-2">
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
                <div className="mt-0.5 text-xs text-slate-500">{mentee!.level} · Wk {mentee!.week}/{mentee!.totalWeeks || '—'} · {mentee!.onTimeRate}% on-time</div>
              </div>
              <Link href={`/mentor/mentees/${mentee!.id}`} className="text-xs text-brand-600 hover:text-brand-700 inline-flex items-center gap-0.5 shrink-0">Profile <ArrowUpRight className="w-3.5 h-3.5" /></Link>
            </div>
            <div className="mt-4"><DualProgress absolute={mentee!.absoluteProgress} relative={mentee!.relativeProgress} compact /></div>
            {mentee!.riskReason && <p className="mt-3 text-xs text-slate-500 border-t border-slate-100 pt-3">{mentee!.riskReason}</p>}
          </div>

          {/* Assigned work — everything currently on this mentee's plate */}
          <div className="bg-card rounded-2xl border border-slate-200">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
              <ListTodo className="w-4 h-4 text-brand-500" />
              <h3 className="text-slate-900 font-medium">Assigned work</h3>
              {tasks.length > 0 && <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded-full">{tasks.length}</span>}
              <button onClick={() => setAssigning(true)} className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"><Plus className="w-3.5 h-3.5" />Assign</button>
            </div>
            <div className="p-4">
              {tasksLoading ? (
                <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
              ) : tasks.length === 0 ? (
                <p className="text-sm text-slate-500 px-1 py-2">Nothing assigned yet — use Assign to give {mentee!.name.split(' ')[0]} their first task.</p>
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
                            return (
                              <div key={t.id} className="flex items-center gap-3 p-2.5 rounded-xl border border-slate-200">
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm text-slate-900 truncate">{t.roadmapTask?.title || t.title || 'Task'}</p>
                                  <div className="flex items-center gap-2 text-xs text-slate-500">
                                    {t.roadmapTask?.type && <span className="capitalize">{t.roadmapTask.type}</span>}
                                    {due && <span className={overdue ? 'text-red-600 inline-flex items-center gap-1' : ''}>{overdue && <Clock className="w-3 h-3" />}due {due.toLocaleDateString()}</span>}
                                  </div>
                                </div>
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${meta.cls}`}>{meta.label}</span>
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
                <p className="text-sm text-slate-500 flex items-center gap-2 px-1 py-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" />Nothing waiting — all clear.</p>
              ) : (
                <div className="space-y-2">
                  {pending.map((item, i) => (
                    <div key={item.submissionId} onClick={() => setFocus(i)}
                      className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer ${i === focus ? 'border-brand-300 bg-brand-50 dark:bg-brand-500/10/40 dark:bg-brand-500/10' : 'border-slate-200'}`}>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900 truncate">{item.title}</p>
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          {item.type && <span className="capitalize">{item.type}</span>}
                          {item.isLate && <span className="inline-flex items-center gap-1 text-red-600"><Clock className="w-3 h-3" />late</span>}
                        </div>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); approve(item); }} disabled={busy === item.submissionId}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-medium disabled:opacity-50">
                        {busy === item.submissionId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}Approve
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); requestChanges(item); }} disabled={busy === item.submissionId}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-amber-300 text-amber-700 text-xs font-medium hover:bg-amber-50 disabled:opacity-50">Changes</button>
                      <button onClick={(e) => { e.stopPropagation(); setReviewing(item); }}
                        className="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 text-xs font-medium hover:border-brand-300">Review</button>
                    </div>
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
                <button key={s} onClick={() => mark(s)}
                  className={`flex-1 px-2 py-1.5 rounded-lg border text-xs font-medium capitalize transition-colors ${attendance[mentee!.id] === s ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                  {s}
                </button>
              ))}
            </div>
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
              <div className="flex justify-between"><span className="text-slate-300">Seen</span><span>{seen.size}/{cohort.length}</span></div>
              <div className="flex justify-between"><span className="text-slate-300">Attendance marked</span><span>{Object.keys(attendance).length}</span></div>
              <div className="flex justify-between"><span className="text-slate-300">Deferred</span><span>{deferred.size}</span></div>
            </div>
            <button onClick={() => router.push('/mentor/dashboard')}
              className={`mt-4 w-full px-3 py-2 rounded-xl text-sm font-medium ${allSeen ? 'bg-card text-slate-900 hover:bg-slate-100' : 'bg-card/10 text-white/70'}`}>
              {allSeen ? 'Finish review' : 'Finish (some unseen)'}
            </button>
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

      {reviewing && <ReviewDrawer item={reviewing} onClose={() => setReviewing(null)} onReviewed={refresh} />}

      {assigning && mentee && (
        <AssignTaskDrawer
          mode="single"
          mentee={{ id: mentee.id, name: mentee.name }}
          onClose={() => setAssigning(false)}
          onAssigned={refresh}
        />
      )}

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
