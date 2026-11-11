import { apiClient } from './api-client';

/**
 * System Pool — pre-clan selection. Operators and reviewers use `poolApi`
 * (/api/pools, every call checked against the pool's programme); candidates
 * use `candidateApi` (/api/candidate, their own work only).
 */

export type PoolStatus = 'draft' | 'open' | 'qualifying' | 'reviewing' | 'placing' | 'closed';
export type PoolDecision = 'selected' | 'waitlisted' | 'not_selected' | 'withdrawn' | 'disqualified';
export type ScoreSource = 'quiz' | 'task_review' | 'interview_review' | 'manual';
export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';
/** How one piece of work turned out for one candidate. */
// 'in_progress' is course work only: part-finished on Edorax, so it has
// earned part of its points and nobody is waiting to review it.
export type WorkScoreStatus = 'scored' | 'in_progress' | 'pending_review' | 'changes_requested' | 'missing' | 'not_assigned' | 'not_targeted' | 'no_work';
export type PoolBucket =
  | 'invite_pending' | 'not_started' | 'in_progress' | 'needs_review' | 'changes_requested'
  | 'completed' | 'stalled' | 'withdrawn';

/**
 * What a piece of work is worth, per difficulty.
 *
 * This replaced a list of weighted components that had to total 100%. Points
 * are decided on the work itself when it is added, so there is one number to
 * read and nothing to reconcile.
 */
export type DifficultyPoints = Record<Difficulty, number>;

export interface ScoringPolicy {
  version: number;
  mode?: 'points';
  difficultyPoints?: Partial<DifficultyPoints>;
}

/** Legacy shape, still present on pools created before points. Ignored by scoring. */
export interface ScoreComponent {
  key: string;
  label: string;
  weight: number;
  source: ScoreSource;
  required?: boolean;
  max?: number;
}

export interface ReminderPolicy {
  enabled: boolean;
  inviteAfterDays: number;
  inviteMaxCount: number;
  dueSoonHours: number;
  inactivityDays: number;
  inactivityMaxCount: number;
}

export interface PoolSettings {
  autoAssignOnActivation: boolean;
  waitlistSize: number | null;
  targetClanIds: string[];
}

export interface Pool {
  id: string;
  name: string;
  description: string | null;
  status: PoolStatus;
  programId: string;
  cohortId: string | null;
  capacity: number | null;
  selectionQuota: number;
  opensAt: string | null;
  closesAt: string | null;
  qualificationDueAt: string | null;
  avatarUrl: string | null;
  scoringPolicy: ScoringPolicy & { components?: ScoreComponent[] };
  reminderPolicy: ReminderPolicy;
  settings: PoolSettings;
  archivedAt: string | null;
  createdAt: string;
  program?: { id: string; name: string };
  cohort?: { id: string; name: string } | null;
  memberCount?: number;
  invitedCount?: number;
  selectedCount?: number;
}

export interface PoolAssignment {
  id: string;
  kind: 'task' | 'quiz' | 'interview' | 'course';
  title: string;
  /** What finishing it is worth. Always a number, even on older work. */
  points: number;
  required: boolean;
  dueAt: string | null;
  cancelledAt: string | null;
  /** Levels this work is aimed at. Empty or absent = everyone. */
  levels?: string[];
  /** Course work carries the Edorax course it enrolls candidates in. */
  config?: { courseId?: string; courseSlug?: string | null; courseTitle?: string } | null;
  roadmapTask?: { id: string; title: string; type: string; difficulty?: Difficulty | null } | null;
  counts?: Record<string, number>;
  /** The template's difficulty, which the default points come from. */
  difficulty?: Difficulty | null;
  /** Retired: work used to feed a weighted component. Old rows still carry it. */
  componentKey?: string | null;
}

export interface PoolMemberRow {
  id: string;
  email: string;
  name: string;
  userId: string | null;
  avatarUrl?: string | null;
  source: string;
  /** The level they applied at, when the round has levels. */
  level?: string | null;
  status: string;
  bucket: PoolBucket;
  decision: PoolDecision | null;
  decisionReason: string | null;
  totalScore: string | number | null;
  rank: number | null;
  placementStatus: 'pending' | 'placed' | 'failed' | null;
  placementError: string | null;
  placedClan: { id: string; name: string } | null;
  targetClan: { id: string; name: string } | null;
  /** `adjustment` is the one hand-entered number: points added to or taken off a total. */
  manualScores: Record<string, { score: number; note: string | null }>;
  invite: { expired: boolean; revoked: boolean; expiresAt: string } | null;
  work: { assignmentId: string; taskId: string | null; status: string | null; dueDate: string | null; isLate: boolean }[];
}

export interface PoolDashboard {
  pool: Pool;
  assignments: PoolAssignment[];
  members: PoolMemberRow[];
  buckets: Partial<Record<PoolBucket, number>>;
  /** Levels this round can aim work at. Empty = it has none. */
  levels: { key: string; label: string }[];
}

export interface RowResult { email?: string; memberId?: string; result: string; reason?: string }
export interface ImportResult {
  summary: Record<string, number>;
  results: RowResult[];
}

/** One piece of work, as it scored for one candidate. */
export interface ScoredWork {
  key: string;
  label: string;
  kind: 'task' | 'quiz' | 'interview' | 'course';
  required: boolean;
  points: number;
  earned: number;
  status: WorkScoreStatus;
}

export interface Blocker {
  code: string;
  message: string;
  severity?: 'block' | 'warn';
  memberIds?: string[];
}

export interface ScoreRow {
  memberId: string;
  name: string;
  email: string;
  rank: number;
  total: number;
  possible: number;
  adjustment: number;
  adjustmentNote: string | null;
  complete: boolean;
  components: ScoredWork[];
  proposedOutcome: 'selected' | 'waitlisted' | 'not_selected' | null;
}

/** The work a score table has a column for, in the order the columns read. */
export interface ScoreColumn { key: string; label: string; kind: 'task' | 'quiz' | 'interview' | 'course'; required: boolean }

export interface Shortlist {
  id: string;
  version: number;
  status: 'draft' | 'blocked' | 'confirmed' | 'superseded';
  quota: number;
  blockers: Blocker[];
  createdAt: string;
  confirmedAt: string | null;
  /** What a perfect round was worth when this version was generated. */
  possible?: number | null;
  work?: ScoreColumn[];
  entries?: {
    id: string;
    poolMemberId: string;
    rank: number;
    totalScore: string;
    complete: boolean;
    adjustment?: number;
    possible?: number;
    components: ScoredWork[];
    proposedOutcome: string;
    finalOutcome: string | null;
    overrideReason: string | null;
    member?: { id: string; email: string; firstName: string | null; lastName: string | null; user?: { firstName: string; lastName: string } | null };
  }[];
}

export interface ReviewQueueItem {
  submissionId: string;
  taskId: string;
  version: number;
  submittedAt: string;
  isLate: boolean;
  kind: 'task' | 'quiz' | 'interview' | 'course';
  title: string;
  /** What approving it can earn the candidate (rating out of 5, pro rata). */
  points?: number;
  required?: boolean;
  /** Which piece of the pool's work this submission is. */
  assignmentId?: string | null;
  componentKey?: string | null;
  member: { id: string; name: string; email: string };
}

export interface PlacementPreview {
  clans: {
    id: string; name: string; cap: number | null; fill: number; planned: number; room: number | null;
    /** Attending vs paused mentees. The system proposes the clan with the fewest active. */
    active: number; paused: number;
    status: 'active' | 'inactive' | 'archived';
    /** Never proposed automatically; still choosable by hand. */
    inactive: boolean;
    lead: { id: string; name: string } | null; coMentorCount: number; problem: string | null;
  }[];
  rows: { memberId: string; name: string; email: string; proposedClanId: string | null; proposedClanName: string | null; currentClanId: string | null; placementStatus: string | null; placementError: string | null; reason: string }[];
  unplaceable: number;
  insufficientCapacity: boolean;
  /** Proposals not yet saved as the plan. */
  suggested?: number;
}

/** A roadmap step as the work picker shows it. */
export interface RoadmapStepOption {
  id: string;
  title: string;
  type: string;
  difficulty?: Difficulty | null;
  taskOrder?: number;
  estimatedHours?: number | null;
  /** False for a quiz or interview step: it is assigned through its own kit. */
  assignable: boolean;
}

export interface RoadmapOption {
  id: string;
  name: string;
  description: string | null;
  published: boolean;
  source: string;
  totalWeeks: number | null;
  stepCount: number;
  assignableCount: number;
  steps: RoadmapStepOption[];
}

export interface PoolOptions {
  programs: { id: string; name: string }[];
  cohorts: { id: string; name: string }[];
  clans: { id: string; name: string; maxMentees: number | null }[];
  quizKits: { id: string; title: string }[];
  interviewKits: { id: string; title: string }[];
  /** Edorax courses this workspace may assign. Empty when it is not connected. */
  courses: { courseId: string; title: string; availableSeats: number | null; pricingType: string }[];
  /** False when Edorax is not connected, so the picker can explain itself. */
  coursesConnected: boolean;
  /** Roadmaps with their steps, in teaching order — what the picker opens. */
  roadmaps: RoadmapOption[];
  /** Flat list of assignable steps. Kept for search; the tree is the picker. */
  roadmapSteps: (RoadmapStepOption & { roadmapId: string; roadmap?: { id: string; name: string } })[];
  difficultyPoints: DifficultyPoints;
}

export interface PoolHistoryEvent {
  id: string;
  action: string;
  createdAt: string;
  newValues: Record<string, unknown> | null;
  oldValues: Record<string, unknown> | null;
  user?: { id: string; firstName: string; lastName: string } | null;
}

export interface PoolApplication {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  status: string;
  inPool: boolean;
  assessmentScore?: number | string | null;
  createdAt?: string;
  cohort?: { id: string; name: string; program?: { id: string; name: string } };
}

export interface ReviewVersion {
  id: string;
  version: number;
  submittedAt: string;
  submissionText: string | null;
  submissionUrls: string[] | null;
  files: { id: string; fileName: string; fileUrl: string; fileType?: string | null; fileSizeBytes?: number | null }[];
  feedback: { id: string; isApproved: boolean; rating: number | string | null; feedbackText: string | null; createdAt?: string }[];
}

export interface ReviewDetail {
  submissionId: string;
  task: {
    id: string; status: string; kind: string; title: string;
    description?: string; deliverable?: string; acceptanceCriteria: string[];
    dueDate: string | null; isLate: boolean;
    /** What approving it earns, and whether it is required. */
    points?: number; required?: boolean; assignmentId?: string | null;
  };
  candidate: { id: string; name: string; email: string } | null;
  versions: ReviewVersion[];
}

export interface BatchResult { summary: Record<string, number>; results: { memberId?: string; result: string; reason?: string; code?: string }[] }
export interface RoadmapBatchResult {
  assignments: PoolAssignment[];
  summary: { added: number; skipped: number; failed: number };
  results: { roadmapTaskId: string; result: 'added' | 'skipped' | 'failed'; reason?: string; assignmentId?: string }[];
}
export interface MemberAssignResult {
  summary: { assigned: number; skipped: number; failed: number };
  results: { assignmentId: string; title: string; result: string; reason?: string; taskId?: string }[];
}

/** Every endpoint answers `{ success, message, data }`; `apiClient` hands back that body. */
type Envelope<T> = { data: T };

export const poolApi = {
  list: (params?: { status?: string; programId?: string }) =>
    apiClient.get<Envelope<{ pools: Pool[] }>>('/pools', { params }).then((r) => r.data.pools ?? []),
  options: (programId?: string) =>
    apiClient.get<Envelope<PoolOptions>>('/pools/options', { params: programId ? { programId } : undefined }).then((r) => r.data),
  create: (data: Record<string, unknown>) => apiClient.post<Envelope<{ pool: Pool }>>('/pools', data).then((r) => r.data.pool),
  get: (id: string) => apiClient.get<Envelope<PoolDashboard>>(`/pools/${id}`).then((r) => r.data),
  update: (id: string, data: Record<string, unknown>) => apiClient.patch<Envelope<{ pool: Pool }>>(`/pools/${id}`, data).then((r) => r.data.pool),
  setStatus: (id: string, status: string) => apiClient.post<Envelope<{ pool: Pool }>>(`/pools/${id}/status`, { status }).then((r) => r.data.pool),
  history: (id: string) => apiClient.get<Envelope<{ events: PoolHistoryEvent[] }>>(`/pools/${id}/history`).then((r) => r.data.events ?? []),

  importMembers: (id: string, body: { csv?: string; emails?: string }) =>
    apiClient.post<Envelope<ImportResult>>(`/pools/${id}/members/import`, body).then((r) => r.data),
  applications: (id: string, status?: string) =>
    apiClient.get<Envelope<{ applications: PoolApplication[] }>>(`/pools/${id}/applications`, { params: status ? { status } : undefined }).then((r) => r.data.applications ?? []),
  addFromApplications: (id: string, applicationIds: string[]) =>
    apiClient.post<Envelope<ImportResult>>(`/pools/${id}/members/from-applications`, { applicationIds }).then((r) => r.data),
  resendInvite: (id: string, memberId: string) => apiClient.post(`/pools/${id}/members/${memberId}/resend-invite`, {}),
  withdraw: (id: string, memberId: string, reason: string) => apiClient.post(`/pools/${id}/members/${memberId}/withdraw`, { reason }),
  disqualify: (id: string, memberId: string, reason: string) => apiClient.post(`/pools/${id}/members/${memberId}/disqualify`, { reason }),
  /** The one hand-entered number: points added to or taken off a candidate's total. */
  setAdjustment: (id: string, memberId: string, body: { score: number | null; note?: string }) =>
    apiClient.put(`/pools/${id}/members/${memberId}/manual-score`, body),

  assignments: (id: string) => apiClient.get<Envelope<{ assignments: PoolAssignment[] }>>(`/pools/${id}/assignments`).then((r) => r.data.assignments ?? []),
  createAssignment: (id: string, body: Record<string, unknown>) =>
    apiClient.post<Envelope<{ assignment: PoolAssignment; assigned: BatchResult | null }>>(`/pools/${id}/assignments`, body).then((r) => r.data),
  assign: (id: string, assignmentId: string, memberIds?: string[]) =>
    apiClient.post<Envelope<BatchResult>>(`/pools/${id}/assignments/${assignmentId}/assign`, memberIds ? { memberIds } : {}).then((r) => r.data),
  /** Several roadmap steps in one go — one request per pass over a roadmap. */
  addRoadmapSteps: (id: string, body: {
    roadmapTaskIds: string[];
    required?: boolean;
    /** Levels the steps are aimed at. Empty = everyone. */
    levels?: string[];
    dueAt?: string | null;
    points?: Record<string, number>;
    assignTo?: 'all' | string[] | null;
  }) => apiClient.post<Envelope<RoadmapBatchResult>>(`/pools/${id}/assignments/from-roadmap`, body).then((r) => r.data),
  /** Re-price a piece of work, or change whether it is required / when it is due. */
  updateAssignment: (id: string, assignmentId: string, body: { points?: number; required?: boolean; dueAt?: string | null }) =>
    apiClient.patch<Envelope<{ assignment: PoolAssignment }>>(`/pools/${id}/assignments/${assignmentId}`, body).then((r) => r.data.assignment),
  /** Chosen work → one candidate. Omit `assignmentIds` for everything in the pool. */
  assignToMember: (id: string, memberId: string, assignmentIds?: string[]) =>
    apiClient.post<Envelope<MemberAssignResult>>(`/pools/${id}/members/${memberId}/assign`, assignmentIds ? { assignmentIds } : {}).then((r) => r.data),
  cancelAssignment: (id: string, assignmentId: string, reason?: string) =>
    apiClient.post(`/pools/${id}/assignments/${assignmentId}/cancel`, { reason }),

  reviewQueue: (id: string) => apiClient.get<Envelope<{ items: ReviewQueueItem[] }>>(`/pools/${id}/review-queue`).then((r) => r.data.items ?? []),
  submission: (id: string, submissionId: string) => apiClient.get<Envelope<ReviewDetail>>(`/pools/${id}/submissions/${submissionId}`).then((r) => r.data),
  review: (id: string, submissionId: string, body: Record<string, unknown>) =>
    apiClient.post<Envelope<ReviewDetail>>(`/pools/${id}/submissions/${submissionId}/review`, body).then((r) => r.data),

  scores: (id: string) =>
    apiClient.get<Envelope<{
      rows: ScoreRow[]; blockers: Blocker[]; warnings: Blocker[];
      possible: number; work: ScoreColumn[]; policy: ScoringPolicy;
    }>>(`/pools/${id}/scores`).then((r) => r.data),
  shortlists: (id: string) => apiClient.get<Envelope<{ shortlists: Shortlist[] }>>(`/pools/${id}/shortlists`).then((r) => r.data.shortlists ?? []),
  generateShortlist: (id: string) =>
    apiClient.post<Envelope<{ shortlist: Shortlist; reused: boolean }>>(`/pools/${id}/shortlists`, {}).then((r) => r.data),
  shortlist: (id: string, shortlistId: string) =>
    apiClient.get<Envelope<{ shortlist: Shortlist }>>(`/pools/${id}/shortlists/${shortlistId}`).then((r) => r.data.shortlist),
  confirm: (id: string, shortlistId: string, overrides: { memberId: string; outcome: string; reason: string }[]) =>
    apiClient.post<Envelope<{ shortlist: Shortlist }>>(`/pools/${id}/shortlists/${shortlistId}/confirm`, { overrides }).then((r) => r.data.shortlist),
  setDecision: (id: string, memberId: string, decision: string, reason: string) =>
    apiClient.post(`/pools/${id}/members/${memberId}/decision`, { decision, reason }),

  placementPreview: (id: string) => apiClient.get<Envelope<PlacementPreview>>(`/pools/${id}/placement/preview`).then((r) => r.data),
  setTargets: (id: string, targets: { memberId: string; clanId: string | null }[]) =>
    apiClient.put(`/pools/${id}/placement/targets`, { targets }),
  place: (id: string, memberIds?: string[]) =>
    apiClient.post<Envelope<BatchResult>>(`/pools/${id}/placement/run`, memberIds ? { memberIds } : {}).then((r) => r.data),

  // The pool photo. Crop → upload file → save URL, as a clan photo does.
  uploadAvatar: (id: string, body: FormData) =>
    apiClient.post<Envelope<{ url: string }>>(`/pools/${id}/avatar/upload`, body).then((r) => r.data),
  setAvatar: (id: string, avatarUrl: string) =>
    apiClient.put<Envelope<{ avatarUrl: string }>>(`/pools/${id}/avatar`, { avatarUrl }).then((r) => r.data),
  removeAvatar: (id: string) => apiClient.delete(`/pools/${id}/avatar`),
};

export interface CandidatePoolSummary {
  memberId: string;
  pool: {
    id: string; name: string; description: string | null; status: PoolStatus;
    qualificationDueAt: string | null; avatarUrl?: string | null;
    program?: { id?: string; name: string };
  };
  progress: { total: number; completed: number; submitted: number; changesRequested: number };
  outcome: { decision: PoolDecision; placedClan: { id: string; name: string } | null } | null;
}

export interface CandidateTask {
  id: string;
  status: string;
  dueDate: string | null;
  isLate: boolean;
  kind: 'task' | 'quiz' | 'interview' | 'course';
  required: boolean;
  title: string;
  type: string;
  readOnly: boolean;
  /** The same facts a clan task carries, so one row renders both. */
  difficulty?: Difficulty | null;
  estimatedHours?: number | null;
  description?: string | null;
  /** What the work is WORTH. A candidate is never shown what they scored. */
  points?: number | null;
  pool: { id: string; name: string; status: PoolStatus } | null;
}

export interface CandidateTaskDetail extends CandidateTask {
  description: string;
  deliverable: string;
  acceptanceCriteria: string[];
  resources: { id: string; title: string; url: string }[];
  submissions: {
    id: string;
    version: number;
    status: string;
    submissionText: string | null;
    submissionUrls: string[];
    submittedAt: string;
    files: { id: string; fileName: string; fileUrl: string }[];
    feedback: { id: string; feedbackText: string | null; isApproved: boolean; decision: string | null; revisionNotes: string | null; checkedCriteria: unknown; createdAt: string }[];
  }[];
}

export const candidateApi = {
  pools: () => apiClient.get<Envelope<{ pools: CandidatePoolSummary[] }>>('/candidate/pools').then((r) => r.data.pools ?? []),
  tasks: () => apiClient.get<Envelope<{ tasks: CandidateTask[] }>>('/candidate/tasks').then((r) => r.data.tasks ?? []),
  task: (taskId: string) => apiClient.get<Envelope<{ task: CandidateTaskDetail }>>(`/candidate/tasks/${taskId}`).then((r) => r.data.task),
  start: (taskId: string) => apiClient.post(`/candidate/tasks/${taskId}/start`, {}),
  submit: (taskId: string, form: FormData) =>
    apiClient.post(`/candidate/tasks/${taskId}/submit`, form, { headers: { 'Content-Type': 'multipart/form-data' } }),
};
