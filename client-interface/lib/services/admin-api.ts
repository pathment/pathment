import { apiClient } from './api-client';

export const adminApi = {
  dashboard: {
    getStats: async () => {
      const response = await apiClient.get('/admin/dashboard/stats');
      return response.data;
    }
  },
  analytics: {
    getOverview: async () => {
      const response = await apiClient.get('/admin/analytics/overview');
      return response.data;
    },
    getProgramsList: async (params?: { page?: number; limit?: number; search?: string }) => {
      const response = await apiClient.get('/admin/analytics/programs', { params });
      return response.data;
    },
    getMentorsList: async (params?: { page?: number; limit?: number }) => {
      const response = await apiClient.get('/admin/analytics/mentors', { params });
      return response.data;
    }
  }
};
