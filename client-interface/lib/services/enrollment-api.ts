import { apiClient } from './api-client';
import { apiConfig } from '../config/api';

export const enrollmentApi = {
  // Get all enrollments with filters
  getAll: (filters?: { status?: string; programId?: string; menteeId?: string; search?: string; page?: number; limit?: number }) => {
    const params = new URLSearchParams();
    if (filters?.status)    params.append('status',    filters.status);
    if (filters?.programId) params.append('programId', filters.programId);
    if (filters?.menteeId)  params.append('menteeId',  filters.menteeId);
    if (filters?.search)    params.append('search',    filters.search);
    if (filters?.page)      params.append('page',      filters.page.toString());
    if (filters?.limit)     params.append('limit',     filters.limit.toString());
    
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

  // ─── Level completion & progression ────────────────────────────────────────

  // Mentee or Mentor: request completion of current level
  requestCompletion: (id: string) => {
    return apiClient.post(`${apiConfig.endpoints.enrollments}/${id}/request-completion`);
  },

  // Mentor or Admin: approve the completion request
  approveCompletion: (id: string) => {
    return apiClient.post(`${apiConfig.endpoints.enrollments}/${id}/approve-completion`);
  },

  // Mentor or Admin: reject the completion request
  rejectCompletion: (id: string, reason?: string) => {
    return apiClient.post(`${apiConfig.endpoints.enrollments}/${id}/reject-completion`, { reason });
  },

  // Admin: promote level_completed mentee to next level
  promoteToNextLevel: (id: string) => {
    return apiClient.post(`${apiConfig.endpoints.enrollments}/${id}/promote-next-level`);
  },
};

export const matchingApi = {
  // Create mentor-mentee match
  createMatch: (data: { enrollmentId: string; mentorId: string; levelId: string }) => {
    return apiClient.post(apiConfig.endpoints.matches, data);
  },

  // Auto-match all pending enrollments
  autoMatchPending: (programId?: string) => {
    return apiClient.post(`${apiConfig.endpoints.matches}/auto-match`, { programId });
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

  // Get all programs+levels this mentor is assigned to teach (via LevelMentorAssignment)
  getMentorAssignedLevels: () => {
    return apiClient.get(`${apiConfig.endpoints.matches}/mentor-levels`);
  },
};

// ─── Mentor API ───────────────────────────────────────────────────────────────
export const mentorApi = {
  getAll: (filters?: { search?: string; page?: number; limit?: number; accepting?: 'true' | 'false' }) => {
    const params = new URLSearchParams();
    if (filters?.search) params.append('search', filters.search);
    if (filters?.page) params.append('page', String(filters.page));
    if (filters?.limit) params.append('limit', String(filters.limit));
    if (filters?.accepting) params.append('accepting', filters.accepting);
    const qs = params.toString();
    return apiClient.get(`/mentors${qs ? `?${qs}` : ''}`);
  },

  getById: (id: string) => {
    return apiClient.get(`/mentors/${id}`);
  },
};
