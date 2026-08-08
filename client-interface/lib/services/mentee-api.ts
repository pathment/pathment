import { apiClient } from './api-client';
import { apiConfig } from '@/lib/config/api';

export const menteeApi = {
  getAll: (filters?: { search?: string; page?: number; limit?: number }) => {
    const params = new URLSearchParams();
    if (filters?.search) params.append('search', filters.search);
    if (filters?.page) params.append('page', String(filters.page));
    if (filters?.limit) params.append('limit', String(filters.limit));
    const qs = params.toString();
    return apiClient.get(`${apiConfig.endpoints.mentees}${qs ? `?${qs}` : ''}`);
  },

  getById: (id: string) => {
    return apiClient.get(apiConfig.endpoints.menteeById(id));
  },

  // The logged-in mentee's own fairness read (My Progress).
  getMyProgress: () => apiClient.get('/mentee/progress'),

  // Daily check-in log.
  getDailyLog: () => apiClient.get('/mentee/daily-log'),
  saveDailyLog: (data: { dateKey: string; tasksDone: string[]; slotsDone?: string[]; note?: string }) =>
    apiClient.post('/mentee/daily-log', data),

  // Is the signed-in user's mentee side paused? Powers the paused gate.
  getPauseState: () => apiClient.get('/mentee/pause-state'),

  // Live cohort-review video (self-report attendance & upcoming countdown).
  getActiveReview: () => apiClient.get('/mentee/review/active'),
  getUpcomingReview: () => apiClient.get('/mentee/review/upcoming'),
  joinReview: (sessionId: string, talkSeconds?: number) => apiClient.post(`/mentee/review/${sessionId}/join`, talkSeconds != null ? { talkSeconds } : {}),
  leaveReview: (sessionId: string, seconds: number) => apiClient.post(`/mentee/review/${sessionId}/leave`, { seconds }),

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
