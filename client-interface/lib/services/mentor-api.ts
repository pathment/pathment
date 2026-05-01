import {apiClient} from './api-client';
import { apiConfig } from '@/lib/config/api';

export const mentorApi = {
  // Get all active mentors
  getAll: async (search?: string) => {
    const params = search ? { search } : {};
    return apiClient.get(apiConfig.endpoints.mentors, { params });
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
