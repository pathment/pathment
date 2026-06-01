export type Role = 'mentor' | 'mentee' | 'admin';

export type Momentum = 'up' | 'flat' | 'down';
export type Risk = 'low' | 'watch' | 'high';
export type Sentiment = 'positive' | 'neutral' | 'low';

export type TaskType =
  | 'assignment'
  | 'project'
  | 'quiz'
  | 'reading'
  | 'video'
  | 'discussion';

export type TaskStatus =
  | 'assigned'
  | 'in_progress'
  | 'submitted'
  | 'under_review'
  | 'completed'
  | 'changes_requested'
  | 'rejected';

export type FrictionKind =
  | 'job'
  | 'domestic'
  | 'electricity'
  | 'hardware'
  | 'health'
  | 'connectivity'
  | 'other';

export type BlockerCategory = 'technical' | 'knowledge' | 'access' | 'personal';

/* How the AI reads a delay (brief §7.1) — the fairness lens. */
export type DelayCategory = 'external' | 'scope' | 'avoidance';

/* The four review outcomes (brief §6.2). */
export type ReviewDecision = 'approved' | 'approved_notes' | 'changes' | 'rejected';

export interface ReviewRecord {
  decision: ReviewDecision;
  notes?: string;
  checks: string[]; // labels of ticked checks
  at: string;
  by: string;
}

export type Effort = 'xs' | 's' | 'm' | 'l';

export interface Attachment {
  label: string;
  url: string;
}

/* When a task happens in the day (for schedule-linked / recurring work). */
export type ScheduleSlot = 'morning' | 'lunch' | 'dinner' | 'anytime';
export type Recurrence = 'once' | 'daily' | 'weekly';

/* Scoring: an automatic speed score (from submit-vs-due) plus an optional
   mentor quality score. */
export interface TaskScore {
  speed?: number; // 0–100, auto
  mentor?: number; // 1–5, optional
}

export interface Task {
  id: number;
  title: string;
  type: TaskType;
  status: TaskStatus;
  due: string;
  dueIn?: number; // days; negative = overdue
  track?: string;
  trackId?: number;
  effort?: Effort;
  attachments?: Attachment[];
  submittedAt?: string;
  late?: boolean;
  score?: number; // legacy single score (kept for existing UI)
  scoreDetail?: TaskScore;
  brief?: string;
  criteria?: string[];
  artifact?: string; // submission link
  review?: ReviewRecord;
  // scheduling / recurrence
  slot?: ScheduleSlot;
  recurrence?: Recurrence;
  // roadmap linkage — approving advances the roadmap and assigns the next step
  roadmapId?: number;
  roadmapStepId?: number;
  extensionRequested?: boolean;
}

/* A reusable one-click feedback note shown as a chip in the review drawer.
   Mentors get defaults and can show/hide or add their own. */
export interface FeedbackTemplate {
  id: string;
  text: string;
  hidden?: boolean;
}

/* A personalized lane of work for one individual (brief §5). */
export interface Track {
  id: number;
  name: string;
  menteeId: number;
  color?: string;
  source?: 'blank' | 'template' | 'program';
  archived?: boolean;
  createdAt: string;
}

/* Reusable library item — a task you can drop into any track in one click. */
export interface TaskTemplate {
  id: string;
  title: string;
  type: TaskType;
  brief?: string;
  defaultEffort?: Effort;
  criteria: string[];
  defaultDueOffsetDays?: number;
}

/* A named bundle of task templates ("Backend Stretch"). */
export interface TrackTemplate {
  id: string;
  name: string;
  color?: string;
  taskTemplateIds: string[];
}

/* ----------------------------------------------------------------
   Roadmaps — an ordered sequence of steps. Approving a roadmap-linked
   task advances the roadmap and auto-assigns the next step's task.
   Roadmaps can be authored locally or imported from the organization.
----------------------------------------------------------------- */
export interface RoadmapStep {
  id: number;
  title: string;
  type: TaskType;
  brief?: string;
  effort?: Effort;
  criteria?: string[];
  dueOffsetDays?: number;
}

export interface Roadmap {
  id: number;
  name: string;
  description?: string;
  steps: RoadmapStep[];
  source: 'local' | 'org';
  published?: boolean; // org roadmaps available to import
  skillTags?: string[];
}

/* Per-mentee assignment of a roadmap, tracking which step they're on. The slot
   ties this roadmap to a part of the mentee's day. */
export interface RoadmapProgress {
  roadmapId: number;
  menteeId: number;
  currentStep: number; // index into steps
  startedAt: string;
  slot?: ScheduleSlot;
  completed?: boolean;
}

/* ----------------------------------------------------------------
   Schedule = the parts of a mentee's day. Each slot ("track") links to
   EITHER an ordered chain of roadmaps OR a recurring task. Everything a
   mentee does flows through these slots.
----------------------------------------------------------------- */
export type SlotKind = 'roadmap' | 'recurring' | 'empty';

export interface RecurringConfig {
  title: string;
  type: TaskType;
  recurrence: Recurrence; // daily | weekly
  brief?: string;
}

export interface SlotConfig {
  kind: SlotKind;
  /* the slot's name + time, inherited from the assigned schedule's block */
  label?: string;
  time?: string;
  /* roadmap chain — ordered roadmap ids; mentee advances through them. When one
     completes the mentor confirms starting the next. */
  roadmapChain?: number[];
  /* recurring task config (when kind === 'recurring') */
  recurring?: RecurringConfig;
  /* if true, mentees may book a 1:1 with the mentor in this slot */
  bookable?: boolean;
}

/* A mentee's full day schedule: one config per slot. */
export type Schedule = Record<ScheduleSlot, SlotConfig>;

/* ----------------------------------------------------------------
   1:1 availability — Calendly-style. The mentor publishes concrete time
   slots; mentees book one and it becomes a ScheduledMeeting.
----------------------------------------------------------------- */
export interface AvailabilitySlot {
  id: number;
  day: string; // 'Mon', 'Tue', … or a date label
  time: string; // '2:00 PM'
  durationMins: number;
  taken?: boolean; // booked by a mentee
  takenBy?: number; // menteeId
}

/* A time block in a schedule — PURE STRUCTURE: a named slot at a time.
   A schedule has NO tasks or roadmaps. Those are assigned into the slots
   per-mentee, only after the schedule is assigned to them. */
export interface TimeBlock {
  id: number;
  label: string; // 'Morning talk', 'Lunch talk', 'Core work'
  time: string; // '8:30 AM' or 'Flexible'
  bookable?: boolean; // mentees can book a 1:1 in this block
}

/* A named, reusable schedule = the day's time structure (its blocks). It holds
   NO roadmaps or tasks. Assign it to mentees, then drop a roadmap or recurring
   task into each slot per person. Org schedules can be inherited by mentors. */
export interface ScheduleTemplate {
  id: number;
  name: string;
  description?: string;
  source: 'org' | 'mentor';
  /* the schedule's named time blocks — structure only */
  blocks: TimeBlock[];
  /* per-mentee fill of those slots happens after assignment (see Schedule) */
  schedule: Schedule;
}

/* ----------------------------------------------------------------
   Release notes — the super admin broadcasts an update to mentors
   (optionally scoped to a program), delivered in-app and/or by email.
----------------------------------------------------------------- */
export interface ReleaseNote {
  id: number;
  title: string;
  body: string;
  program?: string; // 'All programs' if undefined
  channels: ('in_app' | 'email')[];
  at: string;
  by: string;
}

/* The org-wide default schedule, applied to all mentees; individuals can
   override any slot. */
export interface ScheduleAssignment {
  menteeId: number;
  schedule: Schedule;
}

/* ----------------------------------------------------------------
   Daily log — a mentee ticks off what they did each day against their
   schedule (the slot talks) and assigned tasks, with a quick note.
   Missed days can be backfilled by picking the date.
----------------------------------------------------------------- */
export interface DailyLogEntry {
  id: number;
  menteeId: number;
  date: string; // 'Mon May 26' — the day this log is for (may be backfilled)
  dateKey: string; // stable sort/lookup key, e.g. '2025-05-26'
  /* slots the mentee completed that day (the recurring talks) */
  slotsDone: ScheduleSlot[];
  /* assigned-task ids they marked done that day */
  tasksDone: number[];
  /* per-item notes — keyed by slot ('morning') or task id ('t101'), so a
     mentee can say what they did for the morning talk specifically */
  itemNotes?: Record<string, string>;
  /* free-text reflection for the day */
  note?: string;
  loggedAt: string; // when it was actually recorded ('just now', 'backfilled')
}

/* ----------------------------------------------------------------
   Attendance — captured during the weekly quick review (standup).
----------------------------------------------------------------- */
export type AttendanceStatus = 'present' | 'absent' | 'excused';

export interface AttendanceRecord {
  menteeId: number;
  sessionDate: string;
  status: AttendanceStatus;
}

/* ----------------------------------------------------------------
   Documents — an org-shared library all mentors see (mentorship
   guidance + general reading).
----------------------------------------------------------------- */
export type DocCategory = 'guidance' | 'reading' | 'template' | 'policy';

export interface Document {
  id: number;
  title: string;
  category: DocCategory;
  summary?: string;
  author: string;
  updatedAt: string;
  pinned?: boolean;
  url?: string;
  readMins?: number;
}

/* ----------------------------------------------------------------
   Mentor-logged insights about a mentee (outside /review) — captured
   from text syncs, 1:1s, observation. Feeds the mentee's insight
   dashboard (personality, analytical skills, issues, strengths).
----------------------------------------------------------------- */
export type InsightKind =
  | 'personality'
  | 'analytical'
  | 'issue'
  | 'strength'
  | 'general';

export interface Insight {
  id: number;
  menteeId: number;
  kind: InsightKind;
  note: string;
  at: string;
  by: string;
  source?: '1:1' | 'text' | 'observation';
}

export interface Blocker {
  id: number;
  title: string;
  category: BlockerCategory;
  severity: 'low' | 'medium' | 'high';
  daysOpen: number;
  resolved?: boolean;
  // which assigned task this blocker is about (so it's relevant, not floating)
  taskId?: number;
  taskTitle?: string;
}

export interface DelayEvent {
  id: number;
  task: string;
  reason: string;
  kind: FrictionKind;
  days: number;
  accepted: boolean;
  date: string;
  category: DelayCategory;
  aiRationale?: string; // why the AI categorized it this way
}

export interface MeetingNote {
  id: number;
  date: string;
  summary: string;
  sentiment: Sentiment;
  personalityRead?: string;
  issues?: string[];
  nextSteps?: string[];
  by?: string; // which mentor logged this (attribution)
  kind?: string; // '1:1', 'Psychological session', etc.
}

/* ----------------------------------------------------------------
   Collaborators — other mentors/specialists invited to work with a mentee
   (e.g. a psychologist for a session). They can log data too, and everything
   they log is attributed to them.
----------------------------------------------------------------- */
export interface Collaborator {
  id: number;
  name: string;
  avatar: string;
  role: string; // 'Psychologist', 'Career coach', 'Guest mentor'
  menteeId: number;
  invitedBy: string;
  status: 'invited' | 'active';
}

export interface Personality {
  consistency: number;
  communication: number;
  resilience: number;
  independence: number;
}

export interface Mentee {
  id: number;
  name: string;
  avatar: string;
  program: string;
  level: string;
  week: number;
  totalWeeks: number;
  absoluteProgress: number;
  relativeProgress: number;
  momentum: Momentum;
  risk: Risk;
  riskReason?: string;
  lastActive: string;
  pendingApprovals: number;
  openBlockers: number;
  onTimeRate: number;
  sentiment: Sentiment;
  joined: string;
  location: string;
  email: string;
  aiSummary: string;
  aiSignals: string[];
  personality: Personality;
  tasks: Task[];
  blockers: Blocker[];
  delays: DelayEvent[];
  notes: MeetingNote[];
  nudgesSent?: number;
}

/* A "Clan" — a group of mentees under a mentor (the clan leader), running the
   same schedule-driven program. (Type name kept as ProgramHealth to avoid
   churn; the product language is "Clan".) */
export interface ProgramHealth {
  id: number;
  name: string;
  status: 'green' | 'amber' | 'red';
  cohortSize: number;
  completion: number;
  onTime: number;
  dropoff: number;
  extensions: number;
  blockers: number;
  mentorLoad: string;
  atRisk: number;
  leader?: string; // the clan leader (lead mentor)
  leaderAvatar?: string;
  program?: string; // the underlying program/curriculum this clan runs
}

/* ----------------------------------------------------------------
   AI configuration — "bring your own key" (brief §7, §8.1 mentor settings)
----------------------------------------------------------------- */
export type AIProvider = 'groq' | 'openai' | 'anthropic' | 'gemini' | 'custom';

export type AIKeyStatus = 'connected' | 'error' | 'untested';

export interface AIKey {
  id: string;
  provider: AIProvider;
  label: string;
  keyMasked: string; // e.g. "gsk_…7f3a"
  model?: string;
  status: AIKeyStatus;
  addedAt: string;
}

/* The AI features a key can power. Each can be routed to a different key. */
export type AIFeature =
  | 'summary'
  | 'delay'
  | 'atrisk'
  | 'nudge'
  | 'stall'
  | 'coaching'
  | 'feedback';

export type AIRouting = Record<AIFeature, string | null>; // feature -> keyId | null(off)

/* ----------------------------------------------------------------
   Notifications & reminders (brief §7.3, §8)
----------------------------------------------------------------- */
export type NotificationKind =
  | 'nudge'
  | 'review'
  | 'blocker'
  | 'assignment'
  | 'meeting'
  | 'friction'
  | 'system';

export interface Notification {
  id: number;
  role: Role; // who sees it
  kind: NotificationKind;
  title: string;
  body?: string;
  at: string;
  read?: boolean;
  menteeId?: number;
  taskId?: number;
  to?: string; // deep-link route
}

/* ----------------------------------------------------------------
   Direct messages — a mentor can send a custom message to any mentee
   (e.g. someone drifting off-track), optionally also delivered by email.
----------------------------------------------------------------- */
export type MessageChannel = 'in_app' | 'email';

export interface Message {
  id: number;
  menteeId: number;
  from: 'mentor' | 'mentee';
  body: string;
  at: string;
  channels: MessageChannel[];
  templateId?: string;
}

/* A reusable message template the mentor can tweak before sending. */
export interface MessageTemplate {
  id: string;
  label: string;
  subject: string;
  body: string; // supports {name}, {mentor}, {task} tokens
}

/* ----------------------------------------------------------------
   Scheduling — 1:1s a mentor books with a mentee, with a slot.
----------------------------------------------------------------- */
export type MeetingKind = '1:1' | 'standup' | 'review' | 'pairing';

export interface ScheduledMeeting {
  id: number;
  menteeId: number;
  kind: MeetingKind;
  date: string; // 'Thu, May 29'
  time: string; // '2:00 PM'
  durationMins: number;
  agenda?: string;
  status: 'scheduled' | 'done' | 'cancelled';
}
