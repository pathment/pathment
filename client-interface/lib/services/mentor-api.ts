import {apiClient} from './api-client';
import { apiConfig } from '@/lib/config/api';

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

  // Dated, saved, editable cohort-review sessions (full history).
  getTodayReviewSession: () => apiClient.get('/mentor/review/sessions/today'),
  listReviewSessions: () => apiClient.get('/mentor/review/sessions'),
  createReviewSession: (data: { date?: string; title?: string }) => apiClient.post('/mentor/review/sessions', data),
  getReviewSession: (id: string) => apiClient.get(`/mentor/review/sessions/${id}`),
  updateReviewSession: (id: string, data: { title?: string; note?: string; sessionDate?: string }) =>
    apiClient.patch(`/mentor/review/sessions/${id}`, data),
  setReviewEntry: (id: string, menteeId: string, data: { attendance?: 'present' | 'absent' | 'excused' | null; status?: 'pending' | 'reviewed' | 'deferred'; note?: string }) =>
    apiClient.put(`/mentor/review/sessions/${id}/entries/${menteeId}`, data),
  finishReviewSession: (id: string) => apiClient.post(`/mentor/review/sessions/${id}/finish`, {}),
  reopenReviewSession: (id: string) => apiClient.post(`/mentor/review/sessions/${id}/reopen`, {}),
  deleteReviewSession: (id: string) => apiClient.delete(`/mentor/review/sessions/${id}`),

  // Approvals queue (pending reviews across the cohort) + bulk approve.
  getApprovals: () => apiClient.get('/mentor/approvals'),
  bulkApprove: (submissionIds: string[]) => apiClient.post('/mentor/approvals/bulk', { submissionIds }),

  // Send a gentle nudge to a mentee.
  nudge: (menteeId: string, message?: string) => apiClient.post('/mentor/nudge', { menteeId, message }),

  // Promotions (mentee → co-mentor).
  listPromotions: () => apiClient.get('/mentor/promotions'),
  nominate: (menteeId: string) => apiClient.post('/mentor/promotions', { menteeId }),
  advancePromotion: (id: string, data: { stage?: string; motivation?: string; strengths?: string; availability?: string }) =>
    apiClient.patch(`/mentor/promotions/${id}`, data),
  promote: (id: string, clanId?: string) => apiClient.post(`/mentor/promotions/${id}/promote`, { clanId }),

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
