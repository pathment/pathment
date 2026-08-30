import {apiClient} from './api-client';
import { apiConfig } from '@/lib/config/api';

// ── Mentee transfers ────────────────────────────────────────────────────────
export interface TransferConfig {
  /** False before the release date → the UI teases instead of acting. */
  enabled: boolean;
  comingSoon: boolean;
  releaseAt: string;
  /** Released within the last week → worth a "New" badge. */
  isNew: boolean;
}

export interface TransferPerson { id: string; name: string; avatarUrl?: string | null; email?: string | null }

export interface TransferClanOption {
  id: string;
  name: string;
  programId: string | null;
  programName: string | null;
  /** A move across programs wipes the old enrollment + tasks — the picker warns. */
  crossProgram: boolean;
  menteeCount: number;
  leadMentor: TransferPerson | null;
  coMentors: TransferPerson[];
  coMentorCount: number;
}

export interface TransferTargets {
  mentee: { id: string; name: string };
  currentClan: { id: string; name: string; programId: string | null };
  pendingRequest: { id: string; toClanId: string } | null;
  clans: TransferClanOption[];
}

export interface TransferRequest {
  id: string;
  status: 'pending' | 'approved' | 'denied' | 'cancelled';
  reason: string | null;
  resolutionNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
  mentee: TransferPerson | null;
  requester: TransferPerson | null;
  resolver: { id: string; name: string } | null;
  fromClan: { id: string; name: string } | null;
  toClan: { id: string; name: string } | null;
}

export const mentorApi = {
  // Get all active mentors
  getAll: async (search?: string) => {
    const params = search ? { search } : {};
    return apiClient.get(apiConfig.endpoints.mentors, { params });
  },

  // The logged-in mentor's cohort for the Cockpit (computed fairness signals).
  getCohort: () => apiClient.get('/mentor/cohort'),

  // Period-scoped cohort throughput (week / month window).
  getCohortActivity: (period: 'week' | 'month') =>
    apiClient.get(`/mentor/cohort/activity?period=${period}`),

  // AI-drafted narrative cohort summary (uses the mentor's AI connection).
  getCohortReportSummary: (period: 'week' | 'month') =>
    apiClient.post('/mentor/cohort/report-summary', { period }),

  // Rich profile bundle for one mentee.
  getMenteeProfile: (menteeId: string) => apiClient.get(`/mentor/mentee/${menteeId}`),

  // Working-style (personality) + insight logging.
  updatePersonality: (menteeId: string, dims: { consistency?: number; communication?: number; resilience?: number; independence?: number }) =>
    apiClient.patch(`/mentor/mentee/${menteeId}/personality`, dims),
  addInsight: (menteeId: string, data: { kind: string; note: string; source?: string }) =>
    apiClient.post(`/mentor/mentee/${menteeId}/insights`, data),
  addMeetingNote: (menteeId: string, data: {
    kind?: string; summary: string; sentiment?: string; issues?: string[]; nextSteps?: string[]; date?: string;
    personalityRead?: string; workingStyle?: { consistency: number; communication: number; resilience: number; independence: number }; blockers?: string[];
    attributedTo?: string; attributedToId?: string | null;
  }) => apiClient.post(`/mentor/mentee/${menteeId}/notes`, data),
  addCollaborator: (menteeId: string, data: { name: string; role: string; email?: string }) =>
    apiClient.post(`/mentor/mentee/${menteeId}/collaborators`, data),
  removeCollaborator: (menteeId: string, collaboratorId: string) =>
    apiClient.delete(`/mentor/mentee/${menteeId}/collaborators/${collaboratorId}`),

  // Cohort-review attendance (persists per mentee per day; survives refresh).
  setAttendance: (menteeId: string, status: 'present' | 'absent' | 'excused') =>
    apiClient.post(`/mentor/mentee/${menteeId}/attendance`, { status }),
  getReviewAttendance: () => apiClient.get<{ data: { attendance: Record<string, 'present' | 'absent' | 'excused'> } }>('/mentor/review/attendance'),
  getMenteeAttendanceHistory: (menteeId: string) =>
    apiClient.get<{ data: { history: { sessionId: string; date: string | null; status: 'present' | 'absent' | 'excused'; title: string | null }[] } }>(`/mentor/mentee/${menteeId}/attendance/history`),

  // Dated, saved, editable cohort-review sessions (full history). Clan-scoped:
  // pass the active clan so lead + co-mentors of the same clan share one session.
  getTodayReviewSession: (clanId?: string | null) =>
    apiClient.get('/mentor/review/sessions/today', clanId ? { params: { clanId } } : undefined),
  listReviewSessions: (clanId?: string | null) =>
    apiClient.get('/mentor/review/sessions', clanId ? { params: { clanId } } : undefined),
  createReviewSession: (data: { date?: string; title?: string; clanId?: string | null }) => apiClient.post('/mentor/review/sessions', data),
  getReviewSession: (id: string) => apiClient.get(`/mentor/review/sessions/${id}`),
  updateReviewSession: (id: string, data: { title?: string; note?: string; sessionDate?: string }) =>
    apiClient.patch(`/mentor/review/sessions/${id}`, data),
  setReviewEntry: (id: string, menteeId: string, data: { attendance?: 'present' | 'absent' | 'excused' | null; status?: 'pending' | 'reviewed' | 'deferred'; note?: string }) =>
    apiClient.put(`/mentor/review/sessions/${id}/entries/${menteeId}`, data),
  finishReviewSession: (id: string) => apiClient.post(`/mentor/review/sessions/${id}/finish`, {}),
  reopenReviewSession: (id: string) => apiClient.post(`/mentor/review/sessions/${id}/reopen`, {}),
  deleteReviewSession: (id: string) => apiClient.delete(`/mentor/review/sessions/${id}`),
  // Live-video (Jitsi) host controls for a review session.
  startReviewMeeting: (id: string, externalUrl?: string) =>
    apiClient.post(`/mentor/review/sessions/${id}/meeting/start`, { externalUrl }),
  endReviewMeeting: (id: string) => apiClient.post(`/mentor/review/sessions/${id}/meeting/end`, {}),
  // Feature availability, independent of any session — lets the panel decide to
  // show / hide / "coming soon" before a review session exists (draft state).
  getReviewMeetingConfig: () => apiClient.get(`/mentor/review/meeting-config`),
  getReviewMeeting: (id: string) => apiClient.get(`/mentor/review/sessions/${id}/meeting`),
  setReviewAttendanceTracking: (id: string, enabled: boolean) => apiClient.put(`/mentor/review/sessions/${id}/meeting/attendance-tracking`, { enabled }),
  setReviewPolls: (id: string, enabled: boolean) => apiClient.put(`/mentor/review/sessions/${id}/meeting/polls`, { enabled }),
  markReviewPresent: (id: string, menteeId: string, present: boolean) =>
    apiClient.put(`/mentor/review/sessions/${id}/meeting/present/${menteeId}`, { present }),
  recordReviewTalkTime: (id: string, items: { menteeId: string; seconds: number }[]) =>
    apiClient.post(`/mentor/review/sessions/${id}/meeting/talk-time`, { items }),
  proposeReviewContribution: (id: string) => apiClient.get(`/mentor/review/sessions/${id}/meeting/contribution`),
  finalizeReviewContribution: (id: string, menteeIds: string[], sendAbsentEmails?: boolean) =>
    apiClient.post(`/mentor/review/sessions/${id}/meeting/contribution`, { menteeIds, sendAbsentEmails }),

  // Recurring review schedules (weekly / biweekly). Each occurrence auto-creates
  // a session, opens its room at the scheduled time, and emails timezone-correct
  // invites + 24h/1h reminders with a calendar (.ics) attachment.
  listReviewSchedules: () => apiClient.get('/mentor/review/schedules'),
  createReviewSchedule: (data: {
    clanId: string; title?: string; dayOfWeek: number; timeLocal: string;
    timezone: string; intervalWeeks: 1 | 2; durationMinutes?: number;
    startsOn: string; endsOn?: string | null;
  }) => apiClient.post('/mentor/review/schedules', data),
  cancelReviewSchedule: (id: string) => apiClient.delete(`/mentor/review/schedules/${id}`),

  // Approvals queue (pending reviews across the cohort) + bulk approve.
  getApprovals: () => apiClient.get('/mentor/approvals'),
  /** Just the review-queue size (+ per-clan breakdown) for the sidebar badge. */
  getApprovalsCount: () => apiClient.get('/mentor/approvals/count'),
  // Tasks the mentor sent back for changes, awaiting the mentee's resubmission.
  getChangesRequested: () => apiClient.get('/mentor/approvals/changes-requested'),
  // Tasks the mentor has already approved (the "Reviewed" history, with scores).
  getReviewed: () => apiClient.get('/mentor/approvals/reviewed'),
  bulkApprove: (submissionIds: string[]) => apiClient.post('/mentor/approvals/bulk', { submissionIds }),
  bulkReview: (
    submissionIds: string[],
    payload: {
      decision: 'approved' | 'approved_notes' | 'changes' | 'rejected';
      rating?: number;
      feedbackText?: string;
      revisionNotes?: string;
      pointsAwarded?: number;
      pointsPercent?: number;
    }
  ) => apiClient.post('/mentor/approvals/bulk-review', { submissionIds, ...payload }),

  // Paused mentees + win-back. Paused mentees stay in the clan but drop out of
  // reports and receive re-engagement reminders.
  listPausedMentees: () => apiClient.get('/mentor/paused'),
  getMenteePauseState: (menteeId: string) => apiClient.get(`/mentor/mentees/${menteeId}/pause-state`),
  listPauseSuggestions: (clanId?: string) =>
    apiClient.get(`/mentor/pause-suggestions${clanId ? `?clanId=${clanId}` : ''}`),
  // Run an inactivity check now. autoPause=false previews the flagged list;
  // autoPause=true pauses them (and emails them). clanId scopes to one clan.
  runInactivityCheck: (opts?: { clanId?: string; autoPause?: boolean }) =>
    apiClient.post('/mentor/inactivity-check', { clanId: opts?.clanId, autoPause: !!opts?.autoPause }),
  pauseMentee: (menteeId: string, reason?: string, clanId?: string) =>
    apiClient.post(`/mentor/mentees/${menteeId}/pause`, { reason, clanId }),
  resumeMentee: (menteeId: string, clanId?: string) =>
    apiClient.post(`/mentor/mentees/${menteeId}/resume`, { clanId }),
  dismissPauseSuggestion: (menteeId: string, clanId?: string) =>
    apiClient.post(`/mentor/pause-suggestions/${menteeId}/dismiss`, { clanId }),

  // Send a gentle nudge to a mentee.
  nudge: (menteeId: string, message?: string) => apiClient.post('/mentor/nudge', { menteeId, message }),

  // AI-draft constructive feedback for a submitted task (uses the mentor's AI
  // connection). Throws with the server message when AI is not configured.
  draftFeedback: (payload: {
    taskTitle: string;
    brief?: string | null;
    criteria?: string[];
    decision: 'approved' | 'approved_notes' | 'changes' | 'rejected';
    count?: number;
  }) =>
    apiClient
      .post<{ data: { text: string } }>('/mentor/feedback/draft', payload, { timeout: 120000 })
      .then((r) => r.data),

  // Saved feedback snippets (per-mentor).
  listFeedbackSnippets: () =>
    apiClient
      .get<{ data: { snippets: { id: string; label: string; body: string }[] } }>('/mentor/feedback-snippets')
      .then((r) => r.data.snippets),
  createFeedbackSnippet: (payload: { label: string; body: string }) =>
    apiClient
      .post<{ data: { snippet: { id: string; label: string; body: string } } }>('/mentor/feedback-snippets', payload)
      .then((r) => r.data.snippet),
  removeFeedbackSnippet: (id: string) =>
    apiClient.delete(`/mentor/feedback-snippets/${id}`),

  // Promotions (mentee → co-mentor).
  listPromotions: () => apiClient.get('/mentor/promotions'),
  nominate: (menteeId: string) => apiClient.post('/mentor/promotions', { menteeId }),
  advancePromotion: (id: string, data: { stage?: string; motivation?: string; strengths?: string; availability?: string }) =>
    apiClient.patch(`/mentor/promotions/${id}`, data),
  promote: (id: string, clanId?: string) => apiClient.post(`/mentor/promotions/${id}/promote`, { clanId }),
  /** AI-draft the interview write-up (motivation + strengths) from the mentee's real stats. */
  draftPromotion: (id: string) =>
    apiClient.post<{ data: { motivation: string; strengths: string } }>(`/mentor/promotions/${id}/draft`, {}, { timeout: 120000 }),

  // Linear roadmaps (author / import / assign).
  listRoadmaps: () => apiClient.get('/mentor/roadmaps'),
  createRoadmap: (data: {
    name: string;
    programId: string;
    description?: string;
    skillTags?: string[];
    steps: Array<{ title: string; type?: string; brief?: string; description?: string; criteria?: string[]; effort?: string; dueOffsetDays?: number; difficulty?: string; deliverable?: string; pointsBase?: number; resources?: { label?: string; title?: string; url: string }[] }>;
    // Many steps = many cross-region DB round-trips; allow longer than the 30s default.
  }) => apiClient.post('/mentor/roadmaps', data, { timeout: 90000 }),
  updateRoadmapMeta: (id: string, data: { name?: string; description?: string; skillTags?: string[] }) =>
    apiClient.patch(`/mentor/roadmaps/${id}`, data),
  replaceRoadmapSteps: (id: string, steps: any[]) => apiClient.put(`/mentor/roadmaps/${id}/steps`, { steps }, { timeout: 90000 }), // eslint-disable-line @typescript-eslint/no-explicit-any
  addRoadmapStep: (id: string, step: { title: string; type?: string; brief?: string; criteria?: string[] }) =>
    apiClient.post(`/mentor/roadmaps/${id}/steps`, step),
  removeRoadmapStep: (id: string, stepId: string) => apiClient.delete(`/mentor/roadmaps/${id}/steps/${stepId}`),
  importRoadmap: (orgRoadmapId: string) => apiClient.post('/mentor/roadmaps/import', { orgRoadmapId }),
  // Mentee IDs that already have this roadmap (to disable re-assigning).
  getRoadmapAssignees: (id: string) => apiClient.get(`/mentor/roadmaps/${id}/assignees`),
  assignRoadmap: (id: string, payload: { menteeId?: string; menteeIds?: string[]; startStep?: number; dueDate?: string; stepIndexes?: number[]; stepOverrides?: Record<string, unknown> }) =>
    apiClient.post(`/mentor/roadmaps/${id}/assign`, payload),
  // Per-step assignment status for one mentee (powers multi-select batch assign).
  getRoadmapMenteeSteps: (id: string, menteeId: string) =>
    apiClient.get<{ data: { steps: { index: number; stepId: string; title: string; type: string; status: string | null }[]; activeCount: number; assignedCount: number } }>(`/mentor/roadmaps/${id}/mentee/${menteeId}/steps`),
  // Roadmap chaining: read/set "what comes next", and manually advance a mentee.
  getRoadmapLinks: (id: string) =>
    apiClient.get<{ data: { links: { id: string; toRoadmapId: string; name: string | null; position: number }[] } }>(`/mentor/roadmaps/${id}/links`),
  setRoadmapLinks: (id: string, toIds: string[]) =>
    apiClient.put(`/mentor/roadmaps/${id}/links`, { toIds }),
  advanceRoadmap: (menteeId: string, nextRoadmapId: string) =>
    apiClient.post('/mentor/roadmaps/advance', { menteeId, nextRoadmapId }),

  // ── Mentee transfers (mentor → mentor clan moves) ────────────────────────
  // Ask another clan to take one of your mentees; their lead (or a co-mentor who
  // still holds `mentee.transfer`) accepts or declines. Accepting runs the same
  // reassignment an admin move does.
  transfers: {
    /** Release gate: live yet, still teasing, and is it new enough to badge. */
    config: () => apiClient.get<{ data: TransferConfig }>('/mentor/transfers/config'),
    /** Clans this mentee could move to, with each clan's lead + team + size. */
    targets: (menteeId: string, q?: string) =>
      apiClient.get<{ data: TransferTargets }>('/mentor/transfers/targets', { params: { menteeId, q: q || undefined } }),
    request: (menteeId: string, toClanId: string, reason?: string) =>
      apiClient.post<{ data: { request: TransferRequest } }>('/mentor/transfers', { menteeId, toClanId, reason }),
    incoming: () => apiClient.get<{ data: { requests: TransferRequest[] } }>('/mentor/transfers/incoming'),
    outgoing: () => apiClient.get<{ data: { requests: TransferRequest[] } }>('/mentor/transfers/outgoing'),
    respond: (id: string, accept: boolean, note?: string) =>
      apiClient.post<{ data: { request: TransferRequest } }>(`/mentor/transfers/${id}/respond`, { accept, note }),
    cancel: (id: string) => apiClient.post(`/mentor/transfers/${id}/cancel`, {}),
  },

  // A mentee's day-by-day progress on one task, read only.
  getTaskProgress: (taskId: string) => apiClient.get('/mentor/tasks/' + taskId + '/progress'),

  deleteUser: (id: string) => {
    return apiClient.delete(`/admin/users/${id}`);
  },

  suspendUser: (id: string) => {
    return apiClient.put(`/admin/users/${id}/suspend`, {});
  },

  unsuspendUser: (id: string) => {
    return apiClient.put(`/admin/users/${id}/unsuspend`, {});
  },
};
