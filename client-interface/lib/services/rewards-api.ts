import { apiClient } from './api-client';

/** Rewards: admin-managed gift catalog + mentor redemptions. */
export const rewardsApi = {
  overview: () => apiClient.get('/rewards'),
  redeem: (giftId: string, menteeId: string, requestKey?: string) => apiClient.post('/rewards/redeem', { giftId, menteeId, requestKey }),
  menteeBalance: (menteeId: string) => apiClient.get<{ data: { balance: number; earned: number; spent: number } }>(`/rewards/balance/${menteeId}`),
  // Catalog management (admin only).
  createGift: (data: { name: string; description?: string; costXp?: number; imageUrl?: string | null; stock?: number | null }) =>
    apiClient.post('/rewards/gifts', data),
  updateGift: (id: string, data: { name?: string; description?: string; costXp?: number; imageUrl?: string | null; stock?: number | null; active?: boolean }) =>
    apiClient.patch(`/rewards/gifts/${id}`, data),
  removeGift: (id: string) => apiClient.delete(`/rewards/gifts/${id}`),
  uploadGiftImage: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return apiClient.post<{ data: { url: string } }>('/rewards/gifts/upload', fd);
  },
};
