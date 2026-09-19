import { apiClient } from './api-client';

export interface RoadmapResourceInput { label?: string; title?: string; url: string; resourceType?: string }
export interface RoadmapStepInput {
  id?: string;
  title: string;
  type?: string;
  brief?: string;
  description?: string;
  criteria?: string[];
  effort?: string;
  dueOffsetDays?: number;
  difficulty?: string;
  deliverable?: string;
  pointsBase?: number;
  resources?: RoadmapResourceInput[];
  openSourceOrgIds?: string[];
}

/** Admin org-roadmap authoring (the shared library mentors import + assign). */
export const orgRoadmapApi = {
  list: () => apiClient.get('/roadmaps/org'),
  create: (data: { name: string; programId: string; description?: string; skillTags?: string[]; steps: RoadmapStepInput[]; published?: boolean }) =>
    apiClient.post('/roadmaps/org', data, { timeout: 90000 }),
  update: (id: string, data: { name?: string; description?: string; skillTags?: string[]; published?: boolean }) =>
    apiClient.patch(`/roadmaps/org/${id}`, data),
  addStep: (id: string, step: RoadmapStepInput) => apiClient.post(`/roadmaps/org/${id}/steps`, step),
  replaceSteps: (id: string, steps: RoadmapStepInput[]) => apiClient.put(`/roadmaps/org/${id}/steps`, { steps }, { timeout: 90000 }),
  removeStep: (id: string, stepId: string) => apiClient.delete(`/roadmaps/org/${id}/steps/${stepId}`),
  remove: (id: string) => apiClient.delete(`/roadmaps/org/${id}`),
};

/** AI-draft roadmap steps from the brief (name/description/tags/duration). */
export interface RoadmapAiInput {
  name?: string;
  description?: string;
  type?: string;
  /** 'tasks' (default) = a flat ordered list; 'weeks' = paced across N weeks. */
  mode?: 'tasks' | 'weeks';
  durationWeeks?: number;
  /** How many steps to generate (1–40). */
  count?: number;
  skillTags?: string[];
  /** Free-text author guidance: what to include, links, tone, etc. */
  additionalInstructions?: string;
}
export const roadmapAiApi = {
  // AI generation can take a while on big models (esp. 70B via OpenRouter), so
  // override the default 30s client timeout — otherwise a slow-but-fine response
  // is killed client-side with "timeout of 30000ms exceeded".
  generate: (data: RoadmapAiInput) =>
    apiClient.post<{ data: { steps: RoadmapStepInput[] } }>('/roadmaps/generate', data, { timeout: 120000 }),
};

/** Mentee's own roadmap progress (step X/N). */
export const menteeRoadmapApi = {
  mine: () => apiClient.get('/roadmaps/me'),
};

export interface MenteeStepResource {
  id?: string;
  title: string;
  url: string;
  resourceType?: string;
  description?: string;
}

export interface MenteeAssignedTask {
  id: string;
  status: 'not_started' | 'assigned' | 'in_progress' | 'submitted' | 'revision_needed' | 'completed' | 'cancelled';
  dueDate?: string | null;
  completedAt?: string | null;
  pointsAwarded?: number;
}

export interface MenteeRoadmapStep {
  id: string;
  title: string;
  description?: string;
  type: string;
  difficulty?: 'easy' | 'medium' | 'hard' | 'expert';
  effort?: 'xs' | 's' | 'm' | 'l' | 'xl';
  deliverable?: string;
  acceptanceCriteria?: string[];
  estimatedHours?: number;
  pointsBase?: number;
  dueOffsetDays?: number;
  resources?: MenteeStepResource[];
  done: boolean;
  current: boolean;
  status?: 'completed' | 'current' | 'upcoming';
  assignedTask?: MenteeAssignedTask | null;
  completedDate?: string;
}

export interface MenteeRoadmap {
  roadmapId: string;
  name: string;
  description: string | null;
  skillTags: string[];
  currentStep: number;
  totalSteps: number;
  completed: boolean;
  percent: number;
  currentStepTitle: string | null;
  nextMilestoneDueDate?: string | null;
  mentorCheckInDate?: string | null;
  earnedRoadmapPoints?: number;
  totalRoadmapPoints?: number;
  steps: MenteeRoadmapStep[];
}

