import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import {
  MENTEES,
  DEFAULT_AI_KEYS,
  DEFAULT_AI_ROUTING,
  CURRENT_MENTOR,
  CURRENT_MENTEE,
  TASK_TEMPLATES,
  TRACK_TEMPLATES,
  FEEDBACK_TEMPLATES,
  MESSAGE_TEMPLATES,
  SCHEDULED_MEETINGS,
  DEFAULT_SCHEDULE,
  SCHEDULE_TEMPLATES,
  SEED_DAILY_LOGS,
  SEED_AVAILABILITY,
  SEED_RELEASE_NOTES,
  SEED_COLLABORATORS,
  SEED_NOTIFICATIONS,
  ROADMAPS,
  DOCUMENTS,
  SEED_INSIGHTS,
  SEED_ROADMAP_PROGRESS,
} from '@/data/mock';
import type {
  Mentee,
  Task,
  TaskType,
  Blocker,
  MeetingNote,
  Personality,
  ReviewDecision,
  Sentiment,
  AIKey,
  AIRouting,
  AIFeature,
  AIProvider,
  Track,
  TaskTemplate,
  TrackTemplate,
  FeedbackTemplate,
  Effort,
  Attachment,
  ScheduleSlot,
  Recurrence,
  FrictionKind,
  Notification,
  NotificationKind,
  Role,
  Roadmap,
  RoadmapStep,
  RoadmapProgress,
  AttendanceStatus,
  AttendanceRecord,
  Document,
  Insight,
  InsightKind,
  Message,
  MessageChannel,
  MessageTemplate,
  ScheduledMeeting,
  Schedule,
  SlotConfig,
  ScheduleTemplate,
  DailyLogEntry,
  AvailabilitySlot,
  ReleaseNote,
  TimeBlock,
  Collaborator,
} from '@/lib/types';

/* ----------------------------------------------------------------
   In-session store — the single source of truth across ALL three roles.
   Seeds from mock data; every action (review, 1:1, blocker, delay, nudge,
   tracks, assignment, mentee submissions, AI keys) mutates here so the whole
   app reflects it live without a backend.
----------------------------------------------------------------- */

interface MeetingInput {
  summary: string;
  sentiment: Sentiment;
  personalityRead?: string;
  issues?: string[];
  nextSteps?: string[];
  personality?: Personality;
  blockers?: Array<{ title: string; category: Blocker['category']; severity: Blocker['severity'] }>;
  kind?: string; // '1:1', 'Psychological session', etc.
}

interface ReviewInput {
  decision: ReviewDecision;
  notes?: string;
  checks: string[];
}

export interface TaskInput {
  title: string;
  type: TaskType;
  brief?: string;
  due: string;
  effort?: Effort;
  criteria?: string[];
  attachments?: Attachment[];
  trackId?: number;
  track?: string;
  slot?: ScheduleSlot;
  recurrence?: Recurrence;
}

export interface BulkTarget {
  menteeId: number;
  due: string;
  trackId?: number;
}

interface Toast {
  id: number;
  message: string;
  undo?: () => void;
}

interface Store {
  // identity
  mentees: Mentee[];
  mentor: typeof CURRENT_MENTOR;
  currentMenteeId: number;
  getMentee: (id: number) => Mentee | undefined;

  // mentor actions
  reviewTask: (menteeId: number, taskId: number, input: ReviewInput) => void;
  // revert a review — task goes back to submitted, score/decision cleared, and
  // any roadmap auto-advance is rolled back. For accidental approvals.
  unreview: (menteeId: number, taskId: number) => void;
  quickAction: (menteeId: number, taskId: number, action: 'approve' | 'retry', comment?: string) => void;
  scoreTask: (menteeId: number, taskId: number, mentorScore: number) => void;
  bulkReview: (items: Array<{ menteeId: number; taskId: number }>, input: ReviewInput) => void;
  logMeeting: (menteeId: number, input: MeetingInput) => void;
  updatePersonality: (menteeId: number, p: Personality) => void;
  acceptDelay: (menteeId: number, delayId: number) => void;
  addBlocker: (menteeId: number, b: Omit<Blocker, 'id' | 'daysOpen'>) => void;
  resolveBlocker: (menteeId: number, blockerId: number) => void;
  sendNudge: (menteeId: number, message?: string) => number;

  // tracks + assignment (§5)
  templates: { tasks: TaskTemplate[]; tracks: TrackTemplate[] };

  // one-click feedback templates (review drawer chips)
  feedbackTemplates: FeedbackTemplate[];
  addFeedbackTemplate: (text: string) => void;
  toggleFeedbackTemplate: (id: string) => void;
  removeFeedbackTemplate: (id: string) => void;
  getTracks: (menteeId: number) => Track[];
  createTrack: (menteeId: number, name: string, opts?: { color?: string; templateId?: string }) => number;
  renameTrack: (menteeId: number, trackId: number, name: string) => void;
  archiveTrack: (menteeId: number, trackId: number) => void;
  createTrackFromTemplate: (menteeId: number, templateId: string) => number;
  assignTask: (menteeId: number, input: TaskInput) => number;
  bulkAssignTask: (targets: BulkTarget[], input: TaskInput) => void;
  moveTaskToTrack: (menteeId: number, taskId: number, trackId: number) => void;
  saveTaskTemplate: (input: TaskInput) => string;

  // schedule — parts of the day, each a "track" (roadmap chain or recurring)
  getSchedule: (menteeId: number) => Schedule;
  setSlot: (menteeId: number, slot: ScheduleSlot, config: SlotConfig) => void;
  applyScheduleToAll: (schedule: Schedule) => void;
  // start a slot's roadmap chain for a mentee, at a chosen step of the first roadmap
  startSlotRoadmap: (menteeId: number, slot: ScheduleSlot, startStep?: number) => void;
  // named schedule templates — create, inherit org ones, assign to mentees
  scheduleTemplates: ScheduleTemplate[];
  createScheduleTemplate: (name: string, description: string, blocks: TimeBlock[]) => number;
  inheritOrgTemplate: (orgTemplateId: number) => number; // clone an org template to a mentor one
  assignTemplateToMentees: (templateId: number, menteeIds: number[]) => void;
  // 1:1 availability — mark which slots a mentee can book a call in
  toggleSlotBookable: (menteeId: number, slot: ScheduleSlot) => void;
  bookableSlots: (menteeId: number) => ScheduleSlot[];

  // daily progress log — mentee ticks off schedule + tasks per day, with notes
  getDailyLogs: (menteeId: number) => DailyLogEntry[];
  saveDailyLog: (
    menteeId: number,
    entry: {
      date: string;
      dateKey: string;
      slotsDone: ScheduleSlot[];
      tasksDone: number[];
      itemNotes?: Record<string, string>;
      note?: string;
    },
  ) => void;

  // 1:1 availability (Calendly-style concrete time slots)
  availabilitySlots: AvailabilitySlot[];
  addAvailabilitySlot: (slot: Omit<AvailabilitySlot, 'id'>) => void;
  removeAvailabilitySlot: (id: number) => void;
  bookAvailabilitySlot: (id: number, menteeId: number) => void;

  // super-admin release notes broadcast to mentors
  releaseNotes: ReleaseNote[];
  publishReleaseNote: (note: Omit<ReleaseNote, 'id' | 'at' | 'by'>) => void;

  // collaborators — invite specialists onto a mentee; everything they log is
  // attributed to them. `actingAs` is who the current session logs data as.
  collaborators: Collaborator[];
  getCollaborators: (menteeId: number) => Collaborator[];
  inviteCollaborator: (menteeId: number, name: string, role: string) => void;
  actingAs: string;
  setActingAs: (name: string) => void;
  // a roadmap finished → mentor confirms moving to the next roadmap in the chain
  pendingChainAdvance: { menteeId: number; slot: ScheduleSlot; nextRoadmapId: number } | null;
  confirmChainAdvance: (startStep?: number) => void;
  dismissChainAdvance: () => void;

  // mentee write-path
  submitTask: (taskId: number, artifact: string, note?: string) => void;
  requestExtension: (taskId: number, reason: string, kind: FrictionKind, newDue: string) => void;
  logFriction: (taskId: number, reason: string, kind: FrictionKind, severity: Blocker['severity']) => void;

  // roadmaps
  roadmaps: Roadmap[];
  roadmapProgress: RoadmapProgress[];
  createRoadmap: (name: string, description: string, steps: RoadmapStep[]) => number;
  importRoadmap: (orgRoadmapId: number) => number;
  /* startStep lets a mentee join at the point that matches their current
     standing — relative to their journey, not an absolute step 1. */
  assignRoadmap: (menteeId: number, roadmapId: number, startStep?: number) => void;
  bulkAssignRoadmap: (menteeIds: number[], roadmapId: number, startStep?: number) => void;

  // attendance (weekly quick review)
  attendance: AttendanceRecord[];
  markAttendance: (menteeId: number, status: AttendanceStatus) => void;
  getAttendance: (menteeId: number) => AttendanceStatus | undefined;

  // documents (org-shared library)
  documents: Document[];
  addDocument: (doc: Omit<Document, 'id' | 'updatedAt'>) => void;
  togglePinDocument: (id: number) => void;
  removeDocument: (id: number) => void;

  // per-mentee insights (logged outside /review)
  insights: Insight[];
  getInsights: (menteeId: number) => Insight[];
  logInsight: (menteeId: number, kind: InsightKind, note: string, source?: Insight['source']) => void;

  // direct messages (custom outreach to a mentee, optional email)
  messages: Message[];
  messageTemplates: MessageTemplate[];
  getMessages: (menteeId: number) => Message[];
  sendMessage: (menteeId: number, body: string, channels: MessageChannel[], templateId?: string) => void;

  // scheduling — 1:1s a mentor books
  meetings: ScheduledMeeting[];
  getMeetings: (menteeId: number) => ScheduledMeeting[];
  scheduleMeeting: (menteeId: number, m: Omit<ScheduledMeeting, 'id' | 'menteeId' | 'status'>) => void;
  cancelMeeting: (id: number) => void;

  // notifications (§7.3)
  notifications: Notification[];
  unread: (role: Role) => number;
  notify: (n: Omit<Notification, 'id' | 'at'>) => void;
  markRead: (id: number) => void;
  markAllRead: (role: Role) => void;

  // toasts + undo
  toasts: Toast[];
  dismissToast: (id: number) => void;

  // AI keys
  aiKeys: AIKey[];
  routing: AIRouting;
  addKey: (k: { provider: AIProvider; label: string; key: string; model?: string }) => void;
  removeKey: (id: string) => void;
  testKey: (id: string) => void;
  setRoute: (feature: AIFeature, keyId: string | null) => void;
  setMentorPref: (patch: Partial<typeof CURRENT_MENTOR>) => void;
}

const StoreContext = createContext<Store | null>(null);

function maskKey(raw: string): string {
  const tail = raw.slice(-4);
  const head = raw.slice(0, raw.indexOf('_') + 1 || 3);
  return `${head}••••••••${tail}`;
}

const DECISION_TO_STATUS: Record<ReviewDecision, Task['status']> = {
  approved: 'completed',
  approved_notes: 'completed',
  changes: 'changes_requested',
  rejected: 'rejected',
};

const NOTIF_TITLE: Partial<Record<NotificationKind, string>> = {};
void NOTIF_TITLE;

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [mentees, setMentees] = useState<Mentee[]>(() =>
    MENTEES.map((m) => ({ ...m, nudgesSent: m.nudgesSent ?? 0 })),
  );
  const [tracks, setTracks] = useState<Track[]>(() => seedTracks());
  const [aiKeys, setAiKeys] = useState<AIKey[]>(DEFAULT_AI_KEYS);
  const [routing, setRouting] = useState<AIRouting>(DEFAULT_AI_ROUTING);
  const [mentor, setMentor] = useState(CURRENT_MENTOR);
  const [notifications, setNotifications] = useState<Notification[]>(SEED_NOTIFICATIONS);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [roadmaps, setRoadmaps] = useState<Roadmap[]>(ROADMAPS);
  const [roadmapProgress, setRoadmapProgress] = useState<RoadmapProgress[]>(SEED_ROADMAP_PROGRESS);
  const [schedules, setSchedules] = useState<Record<number, Schedule>>({});
  const [scheduleTemplates, setScheduleTemplates] = useState<ScheduleTemplate[]>(SCHEDULE_TEMPLATES);
  const [dailyLogs, setDailyLogs] = useState<DailyLogEntry[]>(SEED_DAILY_LOGS);
  const [availabilitySlots, setAvailabilitySlots] = useState<AvailabilitySlot[]>(SEED_AVAILABILITY);
  const [releaseNotes, setReleaseNotes] = useState<ReleaseNote[]>(SEED_RELEASE_NOTES);
  const [collaborators, setCollaborators] = useState<Collaborator[]>(SEED_COLLABORATORS);
  const [actingAs, setActingAs] = useState<string>(CURRENT_MENTOR.name);
  const [pendingChainAdvance, setPendingChainAdvance] = useState<Store['pendingChainAdvance']>(null);
  // ref mirror so advanceRoadmap (defined earlier) can read the latest schedules
  const schedulesRef = useRef(schedules);
  schedulesRef.current = schedules;
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [insights, setInsights] = useState<Insight[]>(SEED_INSIGHTS);
  const [documents, setDocuments] = useState<Document[]>(DOCUMENTS);
  const [feedbackTemplates, setFeedbackTemplates] = useState<FeedbackTemplate[]>(FEEDBACK_TEMPLATES);
  const [messages, setMessages] = useState<Message[]>([]);
  const [meetings, setMeetings] = useState<ScheduledMeeting[]>(SCHEDULED_MEETINGS);
  const idRef = useRef(100000);
  const nextId = () => ++idRef.current;
  const SESSION_DATE = 'This week';

  const currentMenteeId = CURRENT_MENTEE.id;

  const patchMentee = useCallback((id: number, fn: (m: Mentee) => Mentee) => {
    setMentees((prev) => prev.map((m) => (m.id === id ? fn(m) : m)));
  }, []);

  const getMentee = useCallback((id: number) => mentees.find((m) => m.id === id), [mentees]);

  /* ---------------- toasts + undo ---------------- */
  const toast = useCallback((message: string, undo?: () => void) => {
    const id = nextId();
    setToasts((t) => [...t, { id, message, undo }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  /* ---------------- notifications ---------------- */
  const notify = useCallback<Store['notify']>((n) => {
    setNotifications((prev) => [{ ...n, id: idRef.current++ + 1, at: 'just now' }, ...prev]);
  }, []);

  const unread = useCallback(
    (role: Role) => notifications.filter((n) => n.role === role && !n.read).length,
    [notifications],
  );
  const markRead = useCallback((id: number) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }, []);
  const markAllRead = useCallback((role: Role) => {
    setNotifications((prev) => prev.map((n) => (n.role === role ? { ...n, read: true } : n)));
  }, []);

  /* ---------------- roadmap advancement helper ----------------
     When an approved task is roadmap-linked, advance that mentee's
     roadmap progress and auto-assign the next step's task. */
  const advanceRoadmap = useCallback(
    (menteeId: number, task: Task) => {
      if (!task.roadmapId) return;
      const rm = roadmaps.find((r) => r.id === task.roadmapId);
      if (!rm) return;
      const stepIdx = rm.steps.findIndex((s) => s.id === task.roadmapStepId);
      const nextStep = rm.steps[stepIdx + 1];
      setRoadmapProgress((prev) =>
        prev.map((p) =>
          p.menteeId === menteeId && p.roadmapId === rm.id
            ? { ...p, currentStep: Math.min(stepIdx + 1, rm.steps.length - 1) }
            : p,
        ),
      );
      if (nextStep) {
        const newTask: Task = {
          id: idRef.current++ + 1,
          title: `Roadmap: ${nextStep.title}`,
          type: nextStep.type,
          status: 'assigned',
          due: `+${nextStep.dueOffsetDays ?? 7}d`,
          track: rm.name,
          roadmapId: rm.id,
          roadmapStepId: nextStep.id,
          effort: nextStep.effort,
          brief: nextStep.brief,
          criteria: nextStep.criteria,
          slot: task.slot,
        };
        patchMentee(menteeId, (m) => ({ ...m, tasks: [newTask, ...m.tasks] }));
        notify({
          role: 'mentee',
          kind: 'assignment',
          title: `Next on your roadmap: ${nextStep.title}`,
          body: `${rm.name} · due ${newTask.due}`,
          menteeId,
          taskId: newTask.id,
        });
        toast(`Roadmap advanced → "${nextStep.title}" assigned`);
      } else {
        // roadmap complete — mark it, then see if its slot's chain has a next one
        setRoadmapProgress((prev) =>
          prev.map((p) =>
            p.menteeId === menteeId && p.roadmapId === rm.id ? { ...p, completed: true } : p,
          ),
        );
        const slot = task.slot;
        const sched = schedulesRef.current[menteeId] ?? DEFAULT_SCHEDULE;
        const chain = slot ? sched[slot]?.roadmapChain ?? [] : [];
        const pos = chain.indexOf(rm.id);
        const nextRoadmapId = pos >= 0 ? chain[pos + 1] : undefined;
        if (slot && nextRoadmapId != null) {
          // queue a mentor-confirmed advance to the next roadmap in this slot's chain
          setPendingChainAdvance({ menteeId, slot, nextRoadmapId });
          const nextRm = roadmaps.find((r) => r.id === nextRoadmapId);
          notify({
            role: 'mentor',
            kind: 'system',
            title: `Roadmap complete — ready to start "${nextRm?.name}"?`,
            body: `Confirm to move them to the next roadmap in their ${slot} track.`,
            menteeId,
            to: `/mentor/mentee/${menteeId}`,
          });
          toast(`Roadmap "${rm.name}" complete — confirm the next one`);
        } else {
          toast(`Roadmap "${rm.name}" complete 🎉`);
        }
      }
    },
    [roadmaps, patchMentee, notify, toast],
  );

  /* ---------------- mentor: review (with speed scoring) ---------------- */
  const applyReview = useCallback(
    (menteeId: number, taskId: number, input: ReviewInput) => {
      let approvedTask: Task | undefined;
      patchMentee(menteeId, (m) => {
        const tasks = m.tasks.map((t) => {
          if (t.id !== taskId) return t;
          const status = DECISION_TO_STATUS[input.decision];
          // auto speed score on approval: early=100, on-time=90, late=70
          const isApprove = input.decision === 'approved' || input.decision === 'approved_notes';
          const speed = isApprove ? (t.late ? 70 : 95) : undefined;
          const updated: Task = {
            ...t,
            status,
            extensionRequested: false,
            scoreDetail: isApprove ? { ...t.scoreDetail, speed } : t.scoreDetail,
            score: isApprove ? (t.score ?? speed) : t.score,
            review: { decision: input.decision, notes: input.notes, checks: input.checks, at: 'just now', by: mentor.name },
          };
          if (isApprove) approvedTask = updated;
          return updated;
        });
        return { ...m, tasks, pendingApprovals: tasks.filter((t) => t.status === 'submitted').length };
      });
      // advance roadmap AFTER the patch (uses the captured task)
      if (approvedTask?.roadmapId) advanceRoadmap(menteeId, approvedTask);
    },
    [patchMentee, mentor.name, advanceRoadmap],
  );

  /* Revert a review back to "submitted" and undo any roadmap side-effects.
     Catches accidental approvals (e.g. an errant `A` press). */
  const unreview = useCallback<Store['unreview']>(
    (menteeId, taskId) => {
      let revertedTask: Task | undefined;
      patchMentee(menteeId, (m) => {
        const target = m.tasks.find((t) => t.id === taskId);
        if (!target) return m;
        revertedTask = target;
        // if approving this task auto-assigned a next roadmap step, remove it
        let tasks = m.tasks;
        if (target.roadmapId && (target.status === 'completed')) {
          const rm = roadmaps.find((r) => r.id === target.roadmapId);
          const stepIdx = rm ? rm.steps.findIndex((s) => s.id === target.roadmapStepId) : -1;
          const nextStepId = rm?.steps[stepIdx + 1]?.id;
          if (nextStepId != null) {
            // drop the freshly-assigned next-step task (only if untouched)
            tasks = tasks.filter(
              (t) =>
                !(t.roadmapId === target.roadmapId && t.roadmapStepId === nextStepId && t.status === 'assigned'),
            );
          }
        }
        tasks = tasks.map((t) =>
          t.id === taskId
            ? {
                ...t,
                status: 'submitted' as const,
                review: undefined,
                scoreDetail: t.scoreDetail ? { ...t.scoreDetail, speed: undefined } : undefined,
                score: undefined,
              }
            : t,
        );
        return { ...m, tasks, pendingApprovals: tasks.filter((t) => t.status === 'submitted').length };
      });

      // roll back roadmap progress + cancel any queued chain advance for this task
      if (revertedTask?.roadmapId) {
        const rm = roadmaps.find((r) => r.id === revertedTask!.roadmapId);
        const stepIdx = rm ? rm.steps.findIndex((s) => s.id === revertedTask!.roadmapStepId) : -1;
        if (stepIdx >= 0) {
          setRoadmapProgress((prev) =>
            prev.map((p) =>
              p.menteeId === menteeId && p.roadmapId === revertedTask!.roadmapId
                ? { ...p, currentStep: stepIdx, completed: false }
                : p,
            ),
          );
        }
        // cancel a queued chain advance triggered by this mentee's completion
        setPendingChainAdvance((p) => (p && p.menteeId === menteeId ? null : p));
      }
      toast('Review undone — back to submitted');
    },
    [patchMentee, roadmaps, toast],
  );

  const reviewTask = useCallback<Store['reviewTask']>(
    (menteeId, taskId, input) => {
      applyReview(menteeId, taskId, input);
      const verb =
        input.decision === 'changes'
          ? 'Changes requested'
          : input.decision === 'rejected'
            ? 'Rejected'
            : 'Approved';
      notify({
        role: 'mentee',
        kind: 'review',
        title: `${verb}: a submission was reviewed`,
        body: input.notes,
        taskId,
      });
      // toast offers an Undo — instant recovery from a mis-click / errant key
      toast(verb, () => unreview(menteeId, taskId));
    },
    [applyReview, notify, toast, unreview],
  );

  /* one-click quick actions for the fast weekly review */
  const quickAction = useCallback<Store['quickAction']>(
    (menteeId, taskId, action, comment) => {
      if (action === 'approve') {
        applyReview(menteeId, taskId, { decision: comment ? 'approved_notes' : 'approved', notes: comment, checks: [] });
        // Undo guards the one-tap / `A`-key approval against mis-clicks
        toast('Approved', () => unreview(menteeId, taskId));
      } else {
        applyReview(menteeId, taskId, { decision: 'changes', notes: comment, checks: [] });
        notify({ role: 'mentee', kind: 'review', title: 'Changes requested on your submission', body: comment, taskId });
        toast('Sent back for changes', () => unreview(menteeId, taskId));
      }
    },
    [applyReview, notify, toast, unreview],
  );

  const scoreTask = useCallback<Store['scoreTask']>(
    (menteeId, taskId, mentorScore) => {
      patchMentee(menteeId, (m) => ({
        ...m,
        tasks: m.tasks.map((t) =>
          t.id === taskId ? { ...t, scoreDetail: { ...t.scoreDetail, mentor: mentorScore } } : t,
        ),
      }));
      toast(`Scored ${mentorScore}/5`);
    },
    [patchMentee, toast],
  );

  const bulkReview = useCallback<Store['bulkReview']>(
    (items, input) => {
      items.forEach((it) => applyReview(it.menteeId, it.taskId, input));
      toast(`${items.length} reviewed`);
    },
    [applyReview, toast],
  );

  /* ---------------- attendance ---------------- */
  const markAttendance = useCallback<Store['markAttendance']>(
    (menteeId, status) => {
      setAttendance((prev) => {
        const without = prev.filter((a) => !(a.menteeId === menteeId && a.sessionDate === SESSION_DATE));
        return [...without, { menteeId, sessionDate: SESSION_DATE, status }];
      });
      if (status === 'absent') {
        const m = mentees.find((x) => x.id === menteeId);
        notify({ role: 'mentor', kind: 'system', title: `${m?.name ?? 'Mentee'} marked absent`, body: 'Recorded for this week’s review.', menteeId });
      }
    },
    [mentees, notify],
  );
  const getAttendance = useCallback<Store['getAttendance']>(
    (menteeId) => attendance.find((a) => a.menteeId === menteeId && a.sessionDate === SESSION_DATE)?.status,
    [attendance],
  );

  /* ---------------- roadmaps ---------------- */
  const createRoadmap = useCallback<Store['createRoadmap']>(
    (name, description, steps) => {
      const id = idRef.current++ + 1;
      setRoadmaps((prev) => [...prev, { id, name, description, steps, source: 'local' }]);
      toast(`Roadmap "${name}" created`);
      return id;
    },
    [toast],
  );
  const importRoadmap = useCallback<Store['importRoadmap']>(
    (orgRoadmapId) => {
      const org = roadmaps.find((r) => r.id === orgRoadmapId);
      const id = idRef.current++ + 1;
      if (org) {
        setRoadmaps((prev) => [
          ...prev,
          { ...org, id, source: 'local', published: false, name: org.name.replace(/^Org:\s*/, '') },
        ]);
        toast(`Imported "${org.name}"`);
      }
      return id;
    },
    [roadmaps, toast],
  );
  /* core (no toast) — reused by single + bulk assignment */
  const assignRoadmapCore = useCallback(
    (menteeId: number, roadmapId: number, startStep = 0, slot?: ScheduleSlot) => {
      const rm = roadmaps.find((r) => r.id === roadmapId);
      if (!rm) return false;
      const start = Math.max(0, Math.min(startStep, rm.steps.length - 1));
      setRoadmapProgress((prev) => {
        const without = prev.filter((p) => !(p.menteeId === menteeId && p.roadmapId === roadmapId));
        return [...without, { menteeId, roadmapId, currentStep: start, startedAt: 'Today', slot }];
      });
      const step = rm.steps[start];
      if (step) {
        const newTask: Task = {
          id: idRef.current++ + 1,
          title: `Roadmap: ${step.title}`,
          type: step.type,
          status: 'assigned',
          due: `+${step.dueOffsetDays ?? 7}d`,
          track: rm.name,
          roadmapId: rm.id,
          roadmapStepId: step.id,
          effort: step.effort,
          brief: step.brief,
          criteria: step.criteria,
          slot,
        };
        patchMentee(menteeId, (m) => ({ ...m, tasks: [newTask, ...m.tasks] }));
        notify({
          role: 'mentee',
          kind: 'assignment',
          title: `New roadmap: ${rm.name}`,
          body: `Starting with "${step.title}"`,
          menteeId,
          taskId: newTask.id,
        });
      }
      return true;
    },
    [roadmaps, patchMentee, notify],
  );

  const assignRoadmap = useCallback<Store['assignRoadmap']>(
    (menteeId, roadmapId, startStep = 0) => {
      if (!assignRoadmapCore(menteeId, roadmapId, startStep)) return;
      const rm = roadmaps.find((r) => r.id === roadmapId);
      const m = mentees.find((x) => x.id === menteeId);
      toast(
        `Assigned "${rm?.name}" to ${m ? m.name.split(' ')[0] : 'mentee'}${startStep > 0 ? ` from step ${startStep + 1}` : ''}`,
      );
    },
    [assignRoadmapCore, roadmaps, mentees, toast],
  );

  /* fast bulk — one roadmap to many mentees in a click */
  const bulkAssignRoadmap = useCallback<Store['bulkAssignRoadmap']>(
    (menteeIds, roadmapId, startStep = 0) => {
      menteeIds.forEach((id) => assignRoadmapCore(id, roadmapId, startStep));
      const rm = roadmaps.find((r) => r.id === roadmapId);
      toast(`Assigned "${rm?.name}" to ${menteeIds.length} mentees`);
    },
    [assignRoadmapCore, roadmaps, toast],
  );

  /* ---------------- schedule (parts of the day = tracks) ---------------- */
  const getSchedule = useCallback<Store['getSchedule']>(
    (menteeId) => schedules[menteeId] ?? DEFAULT_SCHEDULE,
    [schedules],
  );
  const setSlot = useCallback<Store['setSlot']>(
    (menteeId, slot, config) => {
      setSchedules((prev) => {
        const cur = prev[menteeId] ?? DEFAULT_SCHEDULE;
        return { ...prev, [menteeId]: { ...cur, [slot]: config } };
      });
      toast('Schedule updated');
    },
    [toast],
  );
  const applyScheduleToAll = useCallback<Store['applyScheduleToAll']>(
    (schedule) => {
      setSchedules(() => {
        const next: Record<number, Schedule> = {};
        mentees.forEach((m) => (next[m.id] = schedule));
        return next;
      });
      toast(`Schedule applied to all ${mentees.length} mentees`);
    },
    [mentees, toast],
  );
  const startSlotRoadmap = useCallback<Store['startSlotRoadmap']>(
    (menteeId, slot, startStep = 0) => {
      const sched = schedules[menteeId] ?? DEFAULT_SCHEDULE;
      const chain = sched[slot]?.roadmapChain ?? [];
      const firstId = chain[0];
      if (firstId == null) return;
      assignRoadmapCore(menteeId, firstId, startStep, slot);
      const rm = roadmaps.find((r) => r.id === firstId);
      const m = mentees.find((x) => x.id === menteeId);
      toast(`Started "${rm?.name}" for ${m ? m.name.split(' ')[0] : 'mentee'} (${slot})`);
    },
    [schedules, assignRoadmapCore, roadmaps, mentees, toast],
  );

  /* ---------------- schedule templates ---------------- */
  const createScheduleTemplate = useCallback<Store['createScheduleTemplate']>(
    (name, description, blocks) => {
      const id = idRef.current++ + 1;
      // A schedule is structure only — empty, labeled, timed slots. Roadmaps/
      // recurring tasks are dropped in per-mentee after assignment.
      const order: ScheduleSlot[] = ['morning', 'lunch', 'dinner', 'anytime'];
      const schedule: Schedule = {
        morning: { kind: 'empty' },
        lunch: { kind: 'empty' },
        dinner: { kind: 'empty' },
        anytime: { kind: 'empty' },
      };
      blocks.forEach((b, i) => {
        const slot = order[Math.min(i, order.length - 1)];
        schedule[slot] = { kind: 'empty', label: b.label, time: b.time, bookable: b.bookable };
      });
      setScheduleTemplates((prev) => [
        ...prev,
        { id, name, description, source: 'mentor', blocks, schedule },
      ]);
      toast(`Schedule "${name}" created`);
      return id;
    },
    [toast],
  );
  const inheritOrgTemplate = useCallback<Store['inheritOrgTemplate']>(
    (orgTemplateId) => {
      const org = scheduleTemplates.find((t) => t.id === orgTemplateId);
      const id = idRef.current++ + 1;
      if (org) {
        setScheduleTemplates((prev) => [
          ...prev,
          { ...org, id, source: 'mentor', name: `${org.name} (mine)` },
        ]);
        toast(`Inherited "${org.name}"`);
      }
      return id;
    },
    [scheduleTemplates, toast],
  );
  const assignTemplateToMentees = useCallback<Store['assignTemplateToMentees']>(
    (templateId, menteeIds) => {
      const tpl = scheduleTemplates.find((t) => t.id === templateId);
      if (!tpl) return;
      // A schedule is pure structure: assigning it gives EMPTY, labeled, timed
      // slots. The mentor fills each slot (roadmap or recurring task) afterward.
      const order: ScheduleSlot[] = ['morning', 'lunch', 'dinner', 'anytime'];
      const buildEmpty = (): Schedule => {
        const s: Schedule = {
          morning: { kind: 'empty' },
          lunch: { kind: 'empty' },
          dinner: { kind: 'empty' },
          anytime: { kind: 'empty' },
        };
        tpl.blocks.forEach((b, i) => {
          const slot = order[Math.min(i, order.length - 1)];
          s[slot] = { kind: 'empty', label: b.label, time: b.time, bookable: b.bookable };
        });
        return s;
      };
      setSchedules((prev) => {
        const next = { ...prev };
        menteeIds.forEach((id) => {
          next[id] = buildEmpty();
        });
        return next;
      });
      toast(`"${tpl.name}" assigned to ${menteeIds.length} mentee${menteeIds.length === 1 ? '' : 's'} — now fill the slots`);
    },
    [scheduleTemplates, toast],
  );

  /* ---------------- 1:1 availability ---------------- */
  const toggleSlotBookable = useCallback<Store['toggleSlotBookable']>(
    (menteeId, slot) => {
      setSchedules((prev) => {
        const cur = prev[menteeId] ?? DEFAULT_SCHEDULE;
        const slotCfg = cur[slot];
        return { ...prev, [menteeId]: { ...cur, [slot]: { ...slotCfg, bookable: !slotCfg.bookable } } };
      });
    },
    [],
  );
  const bookableSlots = useCallback<Store['bookableSlots']>(
    (menteeId) => {
      const sched = schedulesRef.current[menteeId] ?? DEFAULT_SCHEDULE;
      return (Object.keys(sched) as ScheduleSlot[]).filter((s) => sched[s].bookable);
    },
    [],
  );

  /* ---------------- daily progress log ---------------- */
  const getDailyLogs = useCallback<Store['getDailyLogs']>(
    (menteeId) =>
      dailyLogs
        .filter((l) => l.menteeId === menteeId)
        .sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1)), // newest first
    [dailyLogs],
  );
  const saveDailyLog = useCallback<Store['saveDailyLog']>(
    (menteeId, entry) => {
      const backfill = entry.dateKey < new Date().toISOString().slice(0, 10);
      setDailyLogs((prev) => {
        const existing = prev.find((l) => l.menteeId === menteeId && l.dateKey === entry.dateKey);
        if (existing) {
          return prev.map((l) =>
            l.id === existing.id ? { ...l, ...entry, loggedAt: backfill ? 'backfilled' : 'just now' } : l,
          );
        }
        return [
          { id: idRef.current++ + 1, menteeId, ...entry, loggedAt: backfill ? 'backfilled' : 'just now' },
          ...prev,
        ];
      });
      toast(backfill ? `Logged ${entry.date}` : 'Day logged');
    },
    [toast],
  );

  /* ---------------- 1:1 availability (Calendly-style) ---------------- */
  const addAvailabilitySlot = useCallback<Store['addAvailabilitySlot']>(
    (slot) => {
      setAvailabilitySlots((prev) => [...prev, { ...slot, id: idRef.current++ + 1 }]);
      toast('Availability added');
    },
    [toast],
  );
  const removeAvailabilitySlot = useCallback<Store['removeAvailabilitySlot']>((id) => {
    setAvailabilitySlots((prev) => prev.filter((s) => s.id !== id));
  }, []);
  const bookAvailabilitySlot = useCallback<Store['bookAvailabilitySlot']>(
    (id, menteeId) => {
      let booked: AvailabilitySlot | undefined;
      setAvailabilitySlots((prev) =>
        prev.map((s) => {
          if (s.id === id) {
            booked = s;
            return { ...s, taken: true, takenBy: menteeId };
          }
          return s;
        }),
      );
      if (booked) {
        setMeetings((prev) => [
          { id: idRef.current++ + 1, menteeId, kind: '1:1', date: booked!.day, time: booked!.time, durationMins: booked!.durationMins, status: 'scheduled' },
          ...prev,
        ]);
        notify({ role: 'mentor', kind: 'meeting', title: 'A mentee booked a 1:1', body: `${booked.day} at ${booked.time}`, menteeId });
        toast(`Booked ${booked.day} at ${booked.time}`);
      }
    },
    [notify, toast],
  );

  /* ---------------- super-admin release notes ---------------- */
  const publishReleaseNote = useCallback<Store['publishReleaseNote']>(
    (note) => {
      setReleaseNotes((prev) => [
        { ...note, id: idRef.current++ + 1, at: 'just now', by: 'Org · Admin' },
        ...prev,
      ]);
      // deliver to every mentor in-app (email is simulated by the channel flag)
      notify({
        role: 'mentor',
        kind: 'system',
        title: note.title,
        body: note.body,
        to: '/mentor/library',
      });
      const via = note.channels.includes('email')
        ? note.channels.includes('in_app')
          ? 'in-app + email'
          : 'email only'
        : 'in-app only';
      toast(`Released to mentors (${via})`);
    },
    [notify, toast],
  );

  /* ---------------- collaborators (invited specialists) ---------------- */
  const getCollaborators = useCallback<Store['getCollaborators']>(
    (menteeId) => collaborators.filter((c) => c.menteeId === menteeId),
    [collaborators],
  );
  const inviteCollaborator = useCallback<Store['inviteCollaborator']>(
    (menteeId, name, role) => {
      const initials = name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
      setCollaborators((prev) => [
        ...prev,
        { id: idRef.current++ + 1, name, avatar: initials, role, menteeId, invitedBy: mentor.name, status: 'invited' },
      ]);
      const m = mentees.find((x) => x.id === menteeId);
      toast(`Invited ${name} (${role})${m ? ` for ${m.name.split(' ')[0]}` : ''}`);
    },
    [mentor.name, mentees, toast],
  );

  const confirmChainAdvance = useCallback<Store['confirmChainAdvance']>(
    (startStep = 0) => {
      setPendingChainAdvance((p) => {
        if (p) assignRoadmapCore(p.menteeId, p.nextRoadmapId, startStep, p.slot);
        return null;
      });
    },
    [assignRoadmapCore],
  );
  const dismissChainAdvance = useCallback<Store['dismissChainAdvance']>(() => {
    setPendingChainAdvance(null);
  }, []);

  /* ---------------- insights ---------------- */
  const getInsights = useCallback<Store['getInsights']>(
    (menteeId) => insights.filter((i) => i.menteeId === menteeId),
    [insights],
  );
  const logInsight = useCallback<Store['logInsight']>(
    (menteeId, kind, note, source) => {
      setInsights((prev) => [
        { id: idRef.current++ + 1, menteeId, kind, note, at: 'Today', by: actingAs, source },
        ...prev,
      ]);
      toast('Insight logged');
    },
    [actingAs, toast],
  );

  /* ---------------- documents (org-shared library) ---------------- */
  const addDocument = useCallback<Store['addDocument']>(
    (doc) => {
      setDocuments((prev) => [{ ...doc, id: idRef.current++ + 1, updatedAt: 'Today' }, ...prev]);
      notify({
        role: 'mentor',
        kind: 'system',
        title: `New in the library: ${doc.title}`,
        body: 'Shared with all mentors by the organization.',
        to: '/mentor/library',
      });
      toast('Published to the library');
    },
    [notify, toast],
  );
  const togglePinDocument = useCallback<Store['togglePinDocument']>((id) => {
    setDocuments((prev) => prev.map((d) => (d.id === id ? { ...d, pinned: !d.pinned } : d)));
  }, []);
  const removeDocument = useCallback<Store['removeDocument']>(
    (id) => {
      setDocuments((prev) => prev.filter((d) => d.id !== id));
      toast('Document removed');
    },
    [toast],
  );

  /* ---------------- feedback templates ---------------- */
  const addFeedbackTemplate = useCallback<Store['addFeedbackTemplate']>(
    (text) => {
      const t = text.trim();
      if (!t) return;
      setFeedbackTemplates((prev) => [{ id: `ft_${idRef.current++}`, text: t }, ...prev]);
      toast('Template saved');
    },
    [toast],
  );
  const toggleFeedbackTemplate = useCallback<Store['toggleFeedbackTemplate']>((id) => {
    setFeedbackTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, hidden: !t.hidden } : t)));
  }, []);
  const removeFeedbackTemplate = useCallback<Store['removeFeedbackTemplate']>((id) => {
    setFeedbackTemplates((prev) => prev.filter((t) => t.id !== id));
  }, []);

  /* ---------------- direct messages ---------------- */
  const getMessages = useCallback<Store['getMessages']>(
    (menteeId) => messages.filter((m) => m.menteeId === menteeId),
    [messages],
  );
  const sendMessage = useCallback<Store['sendMessage']>(
    (menteeId, body, channels, templateId) => {
      const text = body.trim();
      if (!text) return;
      setMessages((prev) => [
        { id: idRef.current++ + 1, menteeId, from: 'mentor', body: text, at: 'just now', channels, templateId },
        ...prev,
      ]);
      const mentee = mentees.find((x) => x.id === menteeId);
      notify({
        role: 'mentee',
        kind: 'nudge',
        title: `Message from ${mentor.name.split(' ')[0]}`,
        body: text.length > 80 ? `${text.slice(0, 80)}…` : text,
        menteeId,
      });
      const via = channels.includes('email') ? 'Sent · also emailed' : 'Message sent';
      toast(`${via}${mentee ? ` to ${mentee.name.split(' ')[0]}` : ''}`);
    },
    [mentees, mentor.name, notify, toast],
  );

  /* ---------------- scheduling ---------------- */
  const getMeetings = useCallback<Store['getMeetings']>(
    (menteeId) => meetings.filter((m) => m.menteeId === menteeId && m.status !== 'cancelled'),
    [meetings],
  );
  const scheduleMeeting = useCallback<Store['scheduleMeeting']>(
    (menteeId, m) => {
      setMeetings((prev) => [
        { ...m, id: idRef.current++ + 1, menteeId, status: 'scheduled' },
        ...prev,
      ]);
      const mentee = mentees.find((x) => x.id === menteeId);
      notify({
        role: 'mentee',
        kind: 'meeting',
        title: `${m.kind} scheduled with ${mentor.name.split(' ')[0]}`,
        body: `${m.date} at ${m.time} · ${m.durationMins} min`,
        menteeId,
      });
      toast(`Scheduled ${m.kind}${mentee ? ` with ${mentee.name.split(' ')[0]}` : ''}`);
    },
    [mentees, mentor.name, notify, toast],
  );
  const cancelMeeting = useCallback<Store['cancelMeeting']>(
    (id) => {
      setMeetings((prev) => prev.map((m) => (m.id === id ? { ...m, status: 'cancelled' } : m)));
      toast('Meeting cancelled');
    },
    [toast],
  );

  /* ---------------- mentor: 1:1, personality, delays, blockers ---------------- */
  const logMeeting = useCallback<Store['logMeeting']>(
    (menteeId, input) => {
      patchMentee(menteeId, (m) => {
        const note: MeetingNote = {
          id: idRef.current++ + 1,
          date: 'Today',
          summary: input.summary,
          sentiment: input.sentiment,
          personalityRead: input.personalityRead,
          issues: input.issues,
          nextSteps: input.nextSteps,
          by: actingAs,
          kind: input.kind ?? '1:1',
        };
        const newBlockers: Blocker[] = (input.blockers ?? []).map((b) => ({
          id: idRef.current++ + 1,
          title: b.title,
          category: b.category,
          severity: b.severity,
          daysOpen: 0,
        }));
        return {
          ...m,
          notes: [note, ...m.notes],
          sentiment: input.sentiment,
          personality: input.personality ?? m.personality,
          blockers: [...newBlockers, ...m.blockers],
          openBlockers: m.openBlockers + newBlockers.length,
        };
      });
      toast(`${input.kind ?? '1:1'} captured`);
    },
    [patchMentee, toast, actingAs],
  );

  const updatePersonality = useCallback<Store['updatePersonality']>(
    (menteeId, p) => patchMentee(menteeId, (m) => ({ ...m, personality: p })),
    [patchMentee],
  );

  const acceptDelay = useCallback<Store['acceptDelay']>(
    (menteeId, delayId) => {
      patchMentee(menteeId, (m) => ({
        ...m,
        delays: m.delays.map((d) => (d.id === delayId ? { ...d, accepted: true } : d)),
      }));
      toast('Delay reason accepted');
    },
    [patchMentee, toast],
  );

  const addBlocker = useCallback<Store['addBlocker']>(
    (menteeId, b) =>
      patchMentee(menteeId, (m) => ({
        ...m,
        blockers: [{ ...b, id: idRef.current++ + 1, daysOpen: 0 }, ...m.blockers],
        openBlockers: m.openBlockers + 1,
      })),
    [patchMentee],
  );

  const resolveBlocker = useCallback<Store['resolveBlocker']>(
    (menteeId, blockerId) => {
      patchMentee(menteeId, (m) => ({
        ...m,
        blockers: m.blockers.map((b) => (b.id === blockerId ? { ...b, resolved: true } : b)),
        openBlockers: Math.max(0, m.openBlockers - 1),
      }));
      toast('Blocker resolved');
    },
    [patchMentee, toast],
  );

  const sendNudge = useCallback<Store['sendNudge']>(
    (menteeId, message) => {
      let count = 0;
      patchMentee(menteeId, (m) => {
        count = (m.nudgesSent ?? 0) + 1;
        return { ...m, nudgesSent: count };
      });
      const m = mentees.find((x) => x.id === menteeId);
      notify({
        role: 'mentee',
        kind: 'nudge',
        title: 'A gentle nudge from your mentor',
        body: message ?? 'Checking in — let me know if anything is blocking you.',
        menteeId,
      });
      toast(`Nudge sent${m ? ` to ${m.name.split(' ')[0]}` : ''}`);
      return count;
    },
    [patchMentee, mentees, notify, toast],
  );

  /* ---------------- tracks + assignment (§5) ---------------- */
  const getTracks = useCallback(
    (menteeId: number) => tracks.filter((t) => t.menteeId === menteeId && !t.archived),
    [tracks],
  );

  const createTrack = useCallback<Store['createTrack']>(
    (menteeId, name, opts) => {
      const id = idRef.current++ + 1;
      setTracks((prev) => [
        ...prev,
        {
          id,
          name,
          menteeId,
          color: opts?.color,
          source: opts?.templateId ? 'template' : 'blank',
          createdAt: 'Today',
        },
      ]);
      toast(`Track "${name}" created`);
      return id;
    },
    [toast],
  );

  const renameTrack = useCallback<Store['renameTrack']>((_menteeId, trackId, name) => {
    setTracks((prev) => prev.map((t) => (t.id === trackId ? { ...t, name } : t)));
  }, []);

  const archiveTrack = useCallback<Store['archiveTrack']>(
    (_menteeId, trackId) => {
      setTracks((prev) => prev.map((t) => (t.id === trackId ? { ...t, archived: true } : t)));
      toast('Track archived');
    },
    [toast],
  );

  const makeTask = useCallback((input: TaskInput, trackName?: string): Task => {
    return {
      id: idRef.current++ + 1,
      title: input.title,
      type: input.type,
      status: 'assigned',
      due: input.due,
      track: input.track ?? trackName,
      trackId: input.trackId,
      effort: input.effort,
      brief: input.brief,
      criteria: input.criteria,
      attachments: input.attachments,
      slot: input.slot,
      recurrence: input.recurrence,
    };
  }, []);

  const assignTask = useCallback<Store['assignTask']>(
    (menteeId, input) => {
      const trackName =
        input.track ?? tracks.find((t) => t.id === input.trackId)?.name ?? 'Core';
      const task = makeTask(input, trackName);
      patchMentee(menteeId, (m) => ({ ...m, tasks: [task, ...m.tasks] }));
      notify({
        role: 'mentee',
        kind: 'assignment',
        title: `New task: ${input.title}`,
        body: `Due ${input.due}`,
        menteeId,
        taskId: task.id,
      });
      const m = mentees.find((x) => x.id === menteeId);
      toast(`Assigned to ${m ? m.name.split(' ')[0] : 'mentee'}`);
      return task.id;
    },
    [tracks, makeTask, patchMentee, mentees, notify, toast],
  );

  const bulkAssignTask = useCallback<Store['bulkAssignTask']>(
    (targets, input) => {
      setMentees((prev) =>
        prev.map((m) => {
          const target = targets.find((t) => t.menteeId === m.id);
          if (!target) return m;
          const trackName = tracks.find((t) => t.id === target.trackId)?.name ?? input.track ?? 'Core';
          const task = makeTask({ ...input, due: target.due, trackId: target.trackId }, trackName);
          return { ...m, tasks: [task, ...m.tasks] };
        }),
      );
      targets.forEach((t) =>
        notify({
          role: 'mentee',
          kind: 'assignment',
          title: `New task: ${input.title}`,
          body: `Due ${t.due}`,
          menteeId: t.menteeId,
        }),
      );
      toast(`Assigned to ${targets.length} mentees`);
    },
    [tracks, makeTask, notify, toast],
  );

  const createTrackFromTemplate = useCallback<Store['createTrackFromTemplate']>(
    (menteeId, templateId) => {
      const tpl = TRACK_TEMPLATES.find((t) => t.id === templateId);
      const id = idRef.current++ + 1;
      const name = tpl?.name ?? 'New track';
      setTracks((prev) => [
        ...prev,
        { id, name, menteeId, color: tpl?.color, source: 'template', createdAt: 'Today' },
      ]);
      if (tpl) {
        const newTasks: Task[] = tpl.taskTemplateIds
          .map((tid) => TASK_TEMPLATES.find((tt) => tt.id === tid))
          .filter((x): x is TaskTemplate => !!x)
          .map((tt) => ({
            id: idRef.current++ + 1,
            title: tt.title,
            type: tt.type,
            status: 'assigned' as const,
            due: `+${tt.defaultDueOffsetDays ?? 7}d`,
            track: name,
            trackId: id,
            effort: tt.defaultEffort,
            brief: tt.brief,
            criteria: tt.criteria,
          }));
        patchMentee(menteeId, (m) => ({ ...m, tasks: [...newTasks, ...m.tasks] }));
        toast(`"${name}" added with ${newTasks.length} tasks`);
      }
      return id;
    },
    [patchMentee, toast],
  );

  const moveTaskToTrack = useCallback<Store['moveTaskToTrack']>(
    (menteeId, taskId, trackId) => {
      const trackName = tracks.find((t) => t.id === trackId)?.name;
      patchMentee(menteeId, (m) => ({
        ...m,
        tasks: m.tasks.map((t) => (t.id === taskId ? { ...t, trackId, track: trackName } : t)),
      }));
    },
    [tracks, patchMentee],
  );

  const saveTaskTemplate = useCallback<Store['saveTaskTemplate']>(
    (input) => {
      const id = `tt_custom_${idRef.current++}`;
      TASK_TEMPLATES.push({
        id,
        title: input.title,
        type: input.type,
        brief: input.brief,
        defaultEffort: input.effort,
        criteria: input.criteria ?? [],
      });
      toast('Saved to library');
      return id;
    },
    [toast],
  );

  /* ---------------- mentee write-path ---------------- */
  const findTaskOwner = useCallback(
    (taskId: number) => mentees.find((m) => m.tasks.some((t) => t.id === taskId)),
    [mentees],
  );

  const submitTask = useCallback<Store['submitTask']>(
    (taskId, artifact, note) => {
      const owner = findTaskOwner(taskId);
      if (!owner) return;
      patchMentee(owner.id, (m) => {
        const tasks = m.tasks.map((t) =>
          t.id === taskId
            ? { ...t, status: 'submitted' as const, submittedAt: 'just now', artifact }
            : t,
        );
        return { ...m, tasks, pendingApprovals: tasks.filter((t) => t.status === 'submitted').length };
      });
      const task = owner.tasks.find((t) => t.id === taskId);
      notify({
        role: 'mentor',
        kind: 'review',
        title: `${owner.name} submitted ${task?.title ?? 'a task'}`,
        body: note,
        menteeId: owner.id,
        taskId,
        to: '/mentor/approvals',
      });
      toast('Submitted for review');
    },
    [findTaskOwner, patchMentee, notify, toast],
  );

  const requestExtension = useCallback<Store['requestExtension']>(
    (taskId, reason, kind, newDue) => {
      const owner = findTaskOwner(taskId);
      if (!owner) return;
      const task = owner.tasks.find((t) => t.id === taskId);
      patchMentee(owner.id, (m) => ({
        ...m,
        tasks: m.tasks.map((t) => (t.id === taskId ? { ...t, due: newDue } : t)),
        delays: [
          {
            id: idRef.current++ + 1,
            task: task?.title ?? 'Task',
            reason,
            kind,
            days: 2,
            accepted: false,
            date: 'Today',
            category: 'external',
            aiRationale: 'Newly logged — pending the mentor’s read against this mentee’s friction history.',
          },
          ...m.delays,
        ],
      }));
      notify({
        role: 'mentor',
        kind: 'friction',
        title: `${owner.name} requested an extension`,
        body: reason,
        menteeId: owner.id,
        taskId,
        to: `/mentor/mentee/${owner.id}`,
      });
      toast('Extension requested');
    },
    [findTaskOwner, patchMentee, notify, toast],
  );

  const logFriction = useCallback<Store['logFriction']>(
    (taskId, reason, kind, severity) => {
      const owner = findTaskOwner(taskId);
      if (!owner) return;
      const taskTitle = owner.tasks.find((t) => t.id === taskId)?.title;
      patchMentee(owner.id, (m) => ({
        ...m,
        blockers: [
          { id: idRef.current++ + 1, title: reason, category: 'access', severity, daysOpen: 0, taskId, taskTitle },
          ...m.blockers,
        ],
        openBlockers: m.openBlockers + 1,
        delays: [
          {
            id: idRef.current++ + 1,
            task: m.tasks.find((t) => t.id === taskId)?.title ?? 'Task',
            reason,
            kind,
            days: 1,
            accepted: false,
            date: 'Today',
            category: 'external',
            aiRationale: 'External friction just logged — counts in the relative-progress lens once accepted.',
          },
          ...m.delays,
        ],
      }));
      notify({
        role: 'mentor',
        kind: 'friction',
        title: `${owner.name} logged friction`,
        body: reason,
        menteeId: owner.id,
        taskId,
        to: `/mentor/mentee/${owner.id}`,
      });
      toast('Friction logged — your mentor can see it');
    },
    [findTaskOwner, patchMentee, notify, toast],
  );

  /* ---------------- AI keys ---------------- */
  const addKey = useCallback<Store['addKey']>(
    (k) => {
      const id = `key_${idRef.current++}`;
      setAiKeys((prev) => [
        ...prev,
        {
          id,
          provider: k.provider,
          label: k.label || k.provider,
          keyMasked: maskKey(k.key),
          model: k.model,
          status: 'connected',
          addedAt: 'Today',
        },
      ]);
      toast('Key connected');
    },
    [toast],
  );

  const removeKey = useCallback<Store['removeKey']>((id) => {
    setAiKeys((prev) => prev.filter((k) => k.id !== id));
    setRouting((prev) => {
      const next = { ...prev };
      (Object.keys(next) as AIFeature[]).forEach((f) => {
        if (next[f] === id) next[f] = null;
      });
      return next;
    });
  }, []);

  const testKey = useCallback<Store['testKey']>((id) => {
    setAiKeys((prev) => prev.map((k) => (k.id === id ? { ...k, status: 'connected' } : k)));
  }, []);

  const setRoute = useCallback<Store['setRoute']>((feature, keyId) => {
    setRouting((prev) => ({ ...prev, [feature]: keyId }));
  }, []);

  const setMentorPref = useCallback<Store['setMentorPref']>((patch) => {
    setMentor((prev) => ({ ...prev, ...patch }));
  }, []);

  const value = useMemo<Store>(
    () => ({
      mentees,
      mentor,
      currentMenteeId,
      getMentee,
      reviewTask,
      unreview,
      quickAction,
      scoreTask,
      bulkReview,
      logMeeting,
      updatePersonality,
      acceptDelay,
      addBlocker,
      resolveBlocker,
      sendNudge,
      templates: { tasks: TASK_TEMPLATES, tracks: TRACK_TEMPLATES },
      getTracks,
      createTrack,
      renameTrack,
      archiveTrack,
      createTrackFromTemplate,
      assignTask,
      bulkAssignTask,
      moveTaskToTrack,
      saveTaskTemplate,
      getSchedule,
      setSlot,
      applyScheduleToAll,
      startSlotRoadmap,
      scheduleTemplates,
      createScheduleTemplate,
      inheritOrgTemplate,
      assignTemplateToMentees,
      toggleSlotBookable,
      bookableSlots,
      getDailyLogs,
      saveDailyLog,
      availabilitySlots,
      addAvailabilitySlot,
      removeAvailabilitySlot,
      bookAvailabilitySlot,
      releaseNotes,
      publishReleaseNote,
      collaborators,
      getCollaborators,
      inviteCollaborator,
      actingAs,
      setActingAs,
      pendingChainAdvance,
      confirmChainAdvance,
      dismissChainAdvance,
      roadmaps,
      roadmapProgress,
      createRoadmap,
      importRoadmap,
      assignRoadmap,
      bulkAssignRoadmap,
      attendance,
      markAttendance,
      getAttendance,
      documents,
      addDocument,
      togglePinDocument,
      removeDocument,
      feedbackTemplates,
      addFeedbackTemplate,
      toggleFeedbackTemplate,
      removeFeedbackTemplate,
      insights,
      getInsights,
      logInsight,
      messages,
      messageTemplates: MESSAGE_TEMPLATES,
      getMessages,
      sendMessage,
      meetings,
      getMeetings,
      scheduleMeeting,
      cancelMeeting,
      submitTask,
      requestExtension,
      logFriction,
      notifications,
      unread,
      notify,
      markRead,
      markAllRead,
      toasts,
      dismissToast,
      aiKeys,
      routing,
      addKey,
      removeKey,
      testKey,
      setRoute,
      setMentorPref,
    }),
    [
      mentees, mentor, currentMenteeId, getMentee, reviewTask, unreview, quickAction, scoreTask, bulkReview, logMeeting,
      updatePersonality, acceptDelay, addBlocker, resolveBlocker, sendNudge, getTracks,
      createTrack, renameTrack, archiveTrack, createTrackFromTemplate, assignTask,
      bulkAssignTask, moveTaskToTrack, saveTaskTemplate, roadmaps, roadmapProgress,
      createRoadmap, importRoadmap, assignRoadmap, bulkAssignRoadmap,
      getSchedule, setSlot, applyScheduleToAll, startSlotRoadmap,
      scheduleTemplates, createScheduleTemplate, inheritOrgTemplate, assignTemplateToMentees, toggleSlotBookable, bookableSlots,
      getDailyLogs, saveDailyLog,
      availabilitySlots, addAvailabilitySlot, removeAvailabilitySlot, bookAvailabilitySlot,
      releaseNotes, publishReleaseNote,
      collaborators, getCollaborators, inviteCollaborator, actingAs, setActingAs,
      pendingChainAdvance, confirmChainAdvance, dismissChainAdvance,
      attendance, markAttendance, getAttendance,
      documents, addDocument, togglePinDocument, removeDocument,
      feedbackTemplates, addFeedbackTemplate, toggleFeedbackTemplate, removeFeedbackTemplate,
      messages, getMessages, sendMessage, meetings, getMeetings, scheduleMeeting, cancelMeeting,
      insights, getInsights, logInsight, submitTask, requestExtension,
      logFriction, notifications, unread, notify, markRead, markAllRead, toasts,
      dismissToast, aiKeys, routing, addKey, removeKey, testKey, setRoute, setMentorPref,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

/* derive seed tracks from the mock tasks' loose `track` strings so the Tracks
   UI has content on first load without a data migration. */
function seedTracks(): Track[] {
  const out: Track[] = [];
  let id = 5000;
  for (const m of MENTEES) {
    const names = Array.from(new Set(m.tasks.map((t) => t.track).filter(Boolean))) as string[];
    for (const name of names) {
      out.push({ id: ++id, name, menteeId: m.id, source: 'blank', createdAt: 'Jan 2025' });
    }
  }
  return out;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within AppStoreProvider');
  return ctx;
}
