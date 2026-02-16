import { apiClient } from './api-client';

export const adminApi = {
  dashboard: {
    getStats: async () => {
      const response = await apiClient.get('/admin/dashboard/stats');
      return response.data;
    }
  }
};
