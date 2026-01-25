import {apiClient} from './api-client';
import { apiConfig } from '@/lib/config/api';

export const levelMentorApi = {
  // Get all mentor assignments for a program
  getProgramMentorAssignments: async (programId: string) => {
    return apiClient.get(apiConfig.endpoints.programMentorAssignments(programId));
  },

  // Get mentors assigned to a specific level
  getLevelMentors: async (programId: string, levelId: string) => {
    return apiClient.get(apiConfig.endpoints.getLevelMentorAssignments(programId, levelId));
  },

  // Assign a mentor to a level
  assignMentorToLevel: async (programId: string, levelId: string, mentorId: string) => {
    return apiClient.post(apiConfig.endpoints.assignMentorToLevel(programId, levelId), {
      mentorId
    });
  },

  // Remove a mentor from a level
  removeMentorFromLevel: async (programId: string, levelId: string, mentorId: string) => {
    return apiClient.delete(apiConfig.endpoints.removeMentorFromLevel(programId, levelId, mentorId));
  }
};
