import {apiClient} from './api-client';
import { apiConfig } from '@/lib/config/api';

export const mentorApi = {
  // Get all active mentors
  getAll: async (search?: string) => {
    const params = search ? { search } : {};
    return apiClient.get(apiConfig.endpoints.mentors, { params });
  }
};
