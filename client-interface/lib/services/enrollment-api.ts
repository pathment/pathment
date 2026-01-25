import { apiClient } from './api-client';
import { apiConfig } from '../config/api';

export const enrollmentApi = {
  // Get all enrollments with filters
  getAll: (filters?: { status?: string; programId?: string; menteeId?: string; page?: number; limit?: number }) => {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.programId) params.append('programId', filters.programId);
    if (filters?.menteeId) params.append('menteeId', filters.menteeId);
    if (filters?.page) params.append('page', filters.page.toString());
    if (filters?.limit) params.append('limit', filters.limit.toString());
    
    const queryString = params.toString();
    return apiClient.get(`${apiConfig.endpoints.enrollments}${queryString ? `?${queryString}` : ''}`);
  },

  // Get enrollment by ID
  getById: (id: string) => {
    return apiClient.get(apiConfig.endpoints.enrollmentById(id));
  },

  // Create enrollment (mentee enrolls)
  create: (data: { programId: string }) => {
    return apiClient.post(apiConfig.endpoints.enrollments, data);
  },

  // Update enrollment status
  updateStatus: (id: string, status: string) => {
    return apiClient.patch(apiConfig.endpoints.enrollmentStatus(id), { status });
  },

  // Approve enrollment (admin only)
  approve: (id: string) => {
    return apiClient.post(`${apiConfig.endpoints.enrollments}/${id}/approve`);
  },

  // Reject enrollment (admin only)
  reject: (id: string, reason?: string) => {
    return apiClient.post(`${apiConfig.endpoints.enrollments}/${id}/reject`, { reason });
  },
};

export const matchingApi = {
  // Create mentor-mentee match
  createMatch: (data: { enrollmentId: string; mentorId: string; levelId: string }) => {
    return apiClient.post(apiConfig.endpoints.matches, data);
  },

  // Get AI match suggestions
  getSuggestions: (enrollmentId: string) => {
    return apiClient.get(apiConfig.endpoints.matchSuggestions(enrollmentId));
  },

  // Get mentors assigned to a level
  getLevelMentors: (levelId: string) => {
    return apiClient.get(apiConfig.endpoints.levelMentors(levelId));
  },

  // Get all matches with filters
  getMatches: (filters?: { status?: string; mentorId?: string; menteeId?: string; enrollmentId?: string }) => {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.mentorId) params.append('mentorId', filters.mentorId);
    if (filters?.menteeId) params.append('menteeId', filters.menteeId);
    if (filters?.enrollmentId) params.append('enrollmentId', filters.enrollmentId);
    
    const queryString = params.toString();
    return apiClient.get(`${apiConfig.endpoints.matches}${queryString ? `?${queryString}` : ''}`);
  },

  // Update match status
  updateMatchStatus: (id: string, status: string) => {
    return apiClient.patch(apiConfig.endpoints.matchStatus(id), { status });
  },
};
