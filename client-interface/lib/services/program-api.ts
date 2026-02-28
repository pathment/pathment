// API Service for Program, Level, and Roadmap Management

import { apiClient } from './api-client';
import type { Program, ProgramLevel, Roadmap, RoadmapWeek, RoadmapTask } from '../types';

export interface ProgramFilters {
  search?: string;
  status?: string;
  type?: string;
  tags?: string | string[];
  sortBy?: 'createdAt' | 'name' | 'startDate';
  sortOrder?: 'ASC' | 'DESC';
  page?: number;
  limit?: number;
}

export interface ProgramListResponse {
  success: boolean;
  message: string;
  statusCode: number;
  data: Program[];
  pagination: {
    page: number;
    limit: number;
    totalPages: number;
    totalItems: number;
    total?: number; // server may return total instead of totalItems
  };
}

// Program API
export const programsApi = {
  // Create program
  create: async (data: any) => {
    const response = await apiClient.post<any>('/programs', data);
    return response.data;
  },

  // Get all programs
  getAll: async (filters?: ProgramFilters): Promise<ProgramListResponse> => {
    const response = await apiClient.get<ProgramListResponse>('/programs', { params: filters });
    return response;
  },

  // Get program by ID
  getById: async (id: string) => {
    const response = await apiClient.get<any>(`/programs/${id}`);
    return response.data;
  },

  // Update program
  update: async (id: string, data: any) => {
    const response = await apiClient.put<any>(`/programs/${id}`, data);
    return response.data;
  },

  // Delete program
  delete: async (id: string) => {
    const response = await apiClient.delete(`/programs/${id}`);
    return response.data;
  },

  // Get program stats
  getStats: async (id: string) => {
    const response = await apiClient.get<any>(`/programs/${id}/stats`);
    return response.data;
  },

  // Clone program
  clone: async (id: string, data: any) => {
    const response = await apiClient.post<any>(`/programs/${id}/clone`, data);
    return response.data;
  },
};

// Level API
export const levelsApi = {
  create: async (programId: string, data: any) => {
    const response = await apiClient.post<any>(`/programs/${programId}/levels`, data);
    return response.data;
  },
  getByProgram: async (programId: string) => {
    const response = await apiClient.get<any>(`/programs/${programId}/levels`);
    return response.data;
  },
  getById: async (id: string) => {
    const response = await apiClient.get<any>(`/levels/${id}`);
    return response.data;
  },
  update: async (id: string, data: any) => {
    const response = await apiClient.put<any>(`/levels/${id}`, data);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await apiClient.delete(`/levels/${id}`);
    return response.data;
  },
  reorder: async (programId: string, levelIds: string[]) => {
    const response = await apiClient.put(`/programs/${programId}/levels/reorder`, { levelIds });
    return response.data;
  },
};

// Roadmap API
export const roadmapsApi = {
  generate: async (programId: string, levelId: string, additionalInstructions?: string) => {
    const response = await apiClient.post<any>(
      `/programs/${programId}/levels/${levelId}/roadmap/generate`,
      { additionalInstructions }
    );
    return response.data;
  },
  create: async (programId: string, levelId: string, data: any) => {
    const response = await apiClient.post<any>(
      `/programs/${programId}/levels/${levelId}/roadmap`,
      data
    );
    return response.data;
  },
  getByLevel: async (programId: string, levelId: string) => {
    const response = await apiClient.get<any>(`/programs/${programId}/levels/${levelId}/roadmap`);
    return response.data;
  },
  getById: async (id: string) => {
    const response = await apiClient.get<any>(`/roadmaps/${id}`);
    return response.data;
  },
  update: async (id: string, data: any) => {
    const response = await apiClient.put<any>(`/roadmaps/${id}`, data);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await apiClient.delete(`/roadmaps/${id}`);
    return response.data;
  },
  addWeek: async (roadmapId: string, data: any) => {
    const response = await apiClient.post<any>(`/roadmaps/${roadmapId}/weeks`, data);
    return response.data;
  },
  updateWeek: async (weekId: string, data: any) => {
    const response = await apiClient.put<any>(`/weeks/${weekId}`, data);
    return response.data;
  },
  deleteWeek: async (weekId: string) => {
    const response = await apiClient.delete(`/weeks/${weekId}`);
    return response.data;
  },

  // Task operations
  addTask: async (weekId: string, data: any) => {
    const response = await apiClient.post<any>(`/weeks/${weekId}/tasks`, data);
    return response.data;
  },

  updateTask: async (taskId: string, data: any) => {
    const response = await apiClient.put<any>(`/roadmap-tasks/${taskId}`, data);
    return response.data;
  },

  deleteTask: async (taskId: string) => {
    const response = await apiClient.delete(`/roadmap-tasks/${taskId}`);
    return response.data;
  },
};

// Combined API export
export const programManagementApi = {
  programs: programsApi,
  levels: levelsApi,
  roadmaps: roadmapsApi,
};

export default programManagementApi;
