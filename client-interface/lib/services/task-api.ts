import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const taskApi = {
  // Mentee APIs
  getMenteeTasks: (menteeId: string, params?: { status?: string; enrollmentId?: string }) =>
    api.get(`/tasks/mentee/${menteeId}`, { params }),

  getMenteeTaskStats: (menteeId: string, enrollmentId?: string) =>
    api.get(`/tasks/mentee/${menteeId}/stats`, { params: { enrollmentId } }),

  getTaskById: (taskId: string) =>
    api.get(`/tasks/${taskId}`),

  submitTask: (taskId: string, data: { submissionText: string; submissionUrls?: string[] }) =>
    api.post(`/tasks/${taskId}/submit`, data),

  updateTaskStatus: (taskId: string, status: string) =>
    api.patch(`/tasks/${taskId}/status`, { status }),

  // Mentor APIs
  getMentorTasks: (mentorId: string, params?: { 
    status?: string; 
    enrollmentId?: string; 
    menteeId?: string;
    pendingReview?: boolean;
  }) =>
    api.get(`/tasks/mentor/${mentorId}`, { params }),

  getMentorTaskStats: (mentorId: string) =>
    api.get(`/tasks/mentor/${mentorId}/stats`),

  createCustomTask: (data: {
    menteeId: string;
    enrollmentId: string;
    title: string;
    description: string;
    type?: string;
    difficulty?: string;
    dueDate?: string;
    pointsBase?: number;
    deliverable?: string;
    acceptanceCriteria?: string[];
  }) =>
    api.post('/tasks/custom', data),

  reviewTask: (taskId: string, data: {
    rating: number;
    feedback: string;
    status: 'completed' | 'revision_needed';
    pointsAwarded?: number;
  }) =>
    api.post(`/tasks/${taskId}/review`, data),

  cancelTask: (taskId: string, reason?: string) =>
    api.post(`/tasks/${taskId}/cancel`, { reason }),

  deleteCustomTask: (taskId: string) =>
    api.delete(`/tasks/${taskId}`),

  // Roadmap APIs
  getRoadmapTasks: (programId: string, levelId: string) =>
    api.get(`/tasks/roadmap/program/${programId}/level/${levelId}`),

  // Admin APIs
  autoAssignWeekTasks: (enrollmentId: string, weekNumber: number) =>
    api.post('/tasks/auto-assign', { enrollmentId, weekNumber })
};

export default taskApi;
