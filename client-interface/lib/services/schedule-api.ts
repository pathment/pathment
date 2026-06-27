import { apiClient } from './api-client';

export interface ScheduleBlock { id: string; label: string; time: string; days: string; bookable: boolean }
/** Live per-roadmap progress the server attaches to a roadmap slot (read-only). */
export interface ChainRoadmapDetail {
  id: string; name: string; started: boolean; completed: boolean;
  currentStep: number; totalSteps: number; percent: number;
}
export interface ScheduleSlot {
  id: string; label: string; time: string; days: string;
  kind: 'roadmap' | 'recurring' | 'empty';
  roadmapChain: string[];
  /** Step index of the chain's FIRST roadmap to start the mentee at (skip known steps). */
  startStep?: number;
  recurring: { title: string; type: string; recurrence: string } | null;
  bookable: boolean;
  /** Server-enriched: each chained roadmap's name + this mentee's live progress. */
  chainDetails?: ChainRoadmapDetail[];
}

/** One slot of a mentee's filled schedule (what the read-only views render). */
export interface MenteeScheduleResult {
  templateId: string | null;
  templateName: string | null;
  schedule: ScheduleSlot[];
}

/** Schedule engine: reusable templates + per-mentee filled slot schedules. */
export const scheduleApi = {
  listTemplates: () => apiClient.get('/schedules/templates'),
  createTemplate: (data: { name: string; description?: string; blocks: Partial<ScheduleBlock>[] }) =>
    apiClient.post('/schedules/templates', data),
  updateTemplate: (id: string, data: { name?: string; description?: string; blocks?: Partial<ScheduleBlock>[] }) =>
    apiClient.patch(`/schedules/templates/${id}`, data),
  deleteTemplate: (id: string) => apiClient.delete(`/schedules/templates/${id}`),
  importTemplate: (orgId: string) => apiClient.post('/schedules/templates/import', { orgId }),
  assign: (id: string, menteeIds: string[]) => apiClient.post(`/schedules/templates/${id}/assign`, { menteeIds }),

  // Admin org templates (the shared library mentors import).
  listOrgTemplates: () => apiClient.get('/schedules/org'),
  createOrgTemplate: (data: { name: string; description?: string; blocks: Partial<ScheduleBlock>[] }) =>
    apiClient.post('/schedules/org', data),
  updateOrgTemplate: (id: string, data: { name?: string; description?: string; blocks?: Partial<ScheduleBlock>[] }) =>
    apiClient.patch(`/schedules/org/${id}`, data),
  deleteOrgTemplate: (id: string) => apiClient.delete(`/schedules/org/${id}`),

  getMenteeSchedule: (menteeId: string) =>
    apiClient.get<{ data: { schedule: MenteeScheduleResult | null } }>(`/schedules/mentee/${menteeId}`),
  getMySchedule: () => apiClient.get<{ data: { schedule: MenteeScheduleResult | null } }>('/schedules/me'),
  updateSlot: (menteeId: string, slotId: string, patch: {
    kind?: string; roadmapChain?: string[]; startStep?: number; recurring?: { title: string; type: string; recurrence: string } | null; bookable?: boolean;
  }) => apiClient.patch(`/schedules/mentee/${menteeId}/slot/${slotId}`, patch),
  // Push one slot's config to ALL the mentor's mentees who have that slot.
  applySlotToAll: (slotId: string, patch: {
    kind?: string; roadmapChain?: string[]; startStep?: number; recurring?: { title: string; type: string; recurrence: string } | null;
  }) => apiClient.post<{ data: { applied: number } }>(`/schedules/slot/${slotId}/apply-all`, patch),
};
