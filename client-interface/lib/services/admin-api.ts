import { apiClient } from './api-client';

export interface AdminPromotionCandidate {
  id: string;
  menteeId: string;
  stage: 'nominated' | 'interview' | 'approved' | 'promoted' | 'rejected';
  name: string;
  avatar: string;
  avatarUrl?: string | null;
  program: string | null;
  level: string | null;
  absoluteProgress: number;
  onTimeRate: number;
  readiness: number;
  willingness: number;
  motivation: string | null;
  strengths: string | null;
  availability: string | null;
  decisionNote: string | null;
  targetClanId: string | null;
  targetClanName: string | null;
  nominatedBy: string | null;
  nominatorName: string | null;
  createdAt: string;
}

export const adminApi = {
  dashboard: {
    getStats: async () => {
      const response = await apiClient.get('/admin/dashboard/stats');
      return response.data;
    }
  },
  /** Admin user management — edit profile/email/base-role + password actions. */
  users: {
    update: (id: string, data: { firstName?: string; lastName?: string; email?: string; role?: 'mentee' | 'mentor' }) =>
      apiClient.patch(`/admin/users/${id}`, data),
    setPassword: (id: string, password: string) =>
      apiClient.post(`/admin/users/${id}/password`, { password }),
    sendReset: (id: string) =>
      apiClient.post(`/admin/users/${id}/send-reset`, {}),
    disable2FA: (id: string) =>
      apiClient.post(`/admin/users/${id}/disable-2fa`, {}),
  },
  /** Co-mentor promotion pipeline — admin review of mentor nominations. */
  promotions: {
    list: () => apiClient.get('/admin/promotions'),
    update: (id: string, data: Record<string, unknown>) => apiClient.patch(`/admin/promotions/${id}`, data),
    promote: (id: string, clanId?: string) => apiClient.post(`/admin/promotions/${id}/promote`, { clanId }),
    decline: (id: string, decisionNote?: string) => apiClient.post(`/admin/promotions/${id}/decline`, { decisionNote }),
  },
};
