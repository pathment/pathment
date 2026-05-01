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
