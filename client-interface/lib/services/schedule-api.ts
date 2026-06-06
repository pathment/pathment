import { apiClient } from './api-client';

export interface ScheduleBlock { id: string; label: string; time: string; days: string; bookable: boolean }
export interface ScheduleSlot {
  id: string; label: string; time: string; days: string;
  kind: 'roadmap' | 'recurring' | 'empty';
  roadmapChain: string[];
  recurring: { title: string; type: string; recurrence: string } | null;
  bookable: boolean;
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

  getMenteeSchedule: (menteeId: string) => apiClient.get(`/schedules/mentee/${menteeId}`),
  getMySchedule: () => apiClient.get('/schedules/me'),
  updateSlot: (menteeId: string, slotId: string, patch: {
    kind?: string; roadmapChain?: string[]; recurring?: { title: string; type: string; recurrence: string } | null; bookable?: boolean;
  }) => apiClient.patch(`/schedules/mentee/${menteeId}/slot/${slotId}`, patch),
  // Push one slot's config to ALL the mentor's mentees who have that slot.
  applySlotToAll: (slotId: string, patch: {
    kind?: string; roadmapChain?: string[]; recurring?: { title: string; type: string; recurrence: string } | null;
  }) => apiClient.post<{ data: { applied: number } }>(`/schedules/slot/${slotId}/apply-all`, patch),
};
