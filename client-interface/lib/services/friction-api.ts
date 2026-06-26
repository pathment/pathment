import { apiClient } from './api-client';

/** Blockers and delay events (the "what's slowing them down" inputs). */
export const frictionApi = {
  listBlockers: (menteeId?: string, status?: string) =>
    apiClient.get('/blockers', { params: { menteeId, status } }),
  createBlocker: (data: {
    menteeId?: string;
    title: string;
    category?: string;
    severity?: string;
    assignedTaskId?: string;
  }) => apiClient.post('/blockers', data),
  resolveBlocker: (id: string) => apiClient.patch(`/blockers/${id}/resolve`, {}),
  deleteBlocker: (id: string) => apiClient.delete(`/blockers/${id}`),

  listDelays: (menteeId?: string) => apiClient.get('/delays', { params: { menteeId } }),
  createDelay: (data: {
    menteeId?: string;
    reason: string;
    kind?: string;
    days?: number;
    category?: string;
    assignedTaskId?: string;
  }) => apiClient.post('/delays', data),
  acceptDelay: (id: string, accepted = true, category?: string) =>
    apiClient.patch(`/delays/${id}/accept`, { accepted, category }),
  // Reject removes the delay (used to clear duplicate / bogus requests).
  rejectDelay: (id: string) => apiClient.delete(`/delays/${id}`),
};
