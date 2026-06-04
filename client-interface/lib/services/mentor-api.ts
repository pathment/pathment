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
  }) => apiClient.post(`/mentor/mentee/${menteeId}/notes`, data),
  addCollaborator: (menteeId: string, data: { name: string; role: string; email?: string }) =>
    apiClient.post(`/mentor/mentee/${menteeId}/collaborators`, data),
  removeCollaborator: (menteeId: string, collaboratorId: string) =>
    apiClient.delete(`/mentor/mentee/${menteeId}/collaborators/${collaboratorId}`),

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
    steps: Array<{ title: string; type?: string; brief?: string; criteria?: string[]; effort?: string; dueOffsetDays?: number }>;
  }) => apiClient.post('/mentor/roadmaps', data),
  updateRoadmapMeta: (id: string, data: { name?: string; description?: string; skillTags?: string[] }) =>
    apiClient.patch(`/mentor/roadmaps/${id}`, data),
  addRoadmapStep: (id: string, step: { title: string; type?: string; brief?: string; criteria?: string[] }) =>
    apiClient.post(`/mentor/roadmaps/${id}/steps`, step),
  removeRoadmapStep: (id: string, stepId: string) => apiClient.delete(`/mentor/roadmaps/${id}/steps/${stepId}`),
  importRoadmap: (orgRoadmapId: string) => apiClient.post('/mentor/roadmaps/import', { orgRoadmapId }),
  assignRoadmap: (id: string, payload: { menteeId?: string; menteeIds?: string[]; startStep?: number }) =>
    apiClient.post(`/mentor/roadmaps/${id}/assign`, payload),

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
