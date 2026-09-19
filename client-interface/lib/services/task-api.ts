import { apiClient } from './api-client';
import type { InterviewAssignOptions } from './interview-api';

export const taskApi = {
  // Mentee APIs
  getMenteeTasks: (menteeId: string, params?: { status?: string; enrollmentId?: string }) =>
    apiClient.get(`/tasks/mentee/${menteeId}`, { params }),

  getMenteeTaskStats: (menteeId: string, enrollmentId?: string) =>
    apiClient.get(`/tasks/mentee/${menteeId}/stats`, { params: { enrollmentId } }),

  getTaskById: (taskId: string) =>
    apiClient.get(`/tasks/${taskId}`),

  submitTask: (taskId: string, data: { submissionText: string; submissionUrls?: string[] }) =>
    apiClient.post(`/tasks/${taskId}/submit`, data),

  updateTaskStatus: (taskId: string, status: string) =>
    apiClient.patch(`/tasks/${taskId}/status`, { status }),

  // Mentor APIs
  getMentorTasks: (mentorId: string, params?: { 
    status?: string; 
    enrollmentId?: string; 
    menteeId?: string;
    pendingReview?: boolean;
  }) =>
    apiClient.get(`/tasks/mentor/${mentorId}`, { params }),

  getMentorTaskStats: (mentorId: string) =>
    apiClient.get(`/tasks/mentor/${mentorId}/stats`),

  createCustomTask: (data: {
    menteeId: string;
    enrollmentId?: string; // Optional: server resolves active enrollment if omitted
    roadmapTaskId?: string; // Optional: assign existing roadmap task
    trackId?: string; // Optional: personal lane
    title?: string;
    description?: string;
    type?: string;
    difficulty?: string;
    dueDate?: string;
    pointsBase?: number;
    deliverable?: string;
    acceptanceCriteria?: string[];
    resources?: { title: string; url: string; resourceType?: string }[];
    openSourceOrgIds?: string[];
    interview?: InterviewAssignOptions;
  }) =>
    apiClient.post('/tasks/custom', data),

  bulkCreateCustomTasks: (data: {
    menteeIds: string[];
    trackId?: string;
    title?: string;
    description?: string;
    type?: string;
    difficulty?: string;
    dueDate?: string;
    pointsBase?: number;
    deliverable?: string;
    acceptanceCriteria?: string[];
    resources?: { title: string; url: string; resourceType?: string }[];
    openSourceOrgIds?: string[];
    interview?: InterviewAssignOptions;
  }) =>
    apiClient.post('/tasks/custom/bulk', data),

  reviewTask: (taskId: string, data: {
    rating: number;
    feedback: string;
    status: 'completed' | 'revision_needed';
    pointsAwarded?: number;
  }) =>
    apiClient.post(`/tasks/${taskId}/review`, data),

  cancelTask: (taskId: string, reason?: string) =>
    apiClient.post(`/tasks/${taskId}/cancel`, { reason }),

  // Edit a mentee's assigned task — per-mentee overrides + note + due date.
  // Pass null/'' for an override field to reset it to the roadmap default.
  updateTask: (taskId: string, data: {
    titleOverride?: string | null;
    descriptionOverride?: string | null;
    deliverableOverride?: string | null;
    acceptanceCriteriaOverride?: string[] | null;
    resourcesOverride?: { title: string; url: string; resourceType?: string }[] | null;
    mentorNote?: string | null;
    pointsBase?: number | null;
    dueDate?: string;
  }) => apiClient.patch(`/tasks/${taskId}`, data),

  // Reassign (reactivate) a cancelled task in place.
  reassignTask: (taskId: string, dueDate?: string) =>
    apiClient.post(`/tasks/${taskId}/reassign`, dueDate ? { dueDate } : {}),

  deleteCustomTask: (taskId: string) =>
    apiClient.delete(`/tasks/${taskId}`),

  // Change an assigned task's deadline (mentor/admin). Accepts a YYYY-MM-DD date
  // (anchored to end-of-day in the mentee's timezone) or a full ISO instant.
  updateTaskDueDate: (taskId: string, dueDate: string) =>
    apiClient.patch(`/tasks/${taskId}/due-date`, { dueDate }),

  // Unassign (delete) an assigned task — roadmap or custom — for a mistaken assignment.
  unassignTask: (taskId: string) =>
    apiClient.post(`/tasks/${taskId}/unassign`, {}),

  // Roadmap APIs
  getRoadmapTasks: (programId: string, levelId: string, menteeId?: string) =>
    apiClient.get(`/tasks/roadmap/program/${programId}/level/${levelId}`, {
      params: menteeId ? { menteeId } : undefined
    }),

  // Admin APIs
  autoAssignWeekTasks: (enrollmentId: string, weekNumber: number) =>
    apiClient.post('/tasks/auto-assign', { enrollmentId, weekNumber })
};

export default taskApi;
