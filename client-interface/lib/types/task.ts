import { TaskType, TaskDifficulty } from './roadmap';

// A mentee's assigned task as returned by taskApi.getMenteeTasks (AssignedTask
// with its roadmapTask join) — the subset the mentee detail page consumes.
export interface MenteeTask {
  id: string;
  title: string | null;
  status: string;
  dueDate?: string | null;
  isLate?: boolean;
  finalRating?: number | null;
  points?: number | null;
  pointsBase?: number | null;
  isCustomTask?: boolean;
  roadmapName?: string | null;
  roadmapTask?: {
    title?: string | null;
    pointsBase?: number | null;
    roadmap?: { id: string; name: string } | null;
  } | null;
}

// Flattened row rendered in the mentee detail "Work history" list. Compatible
// with both MenteeProfile.tasksByStatus items and the raw-task fallback mapping.
export interface WorkHistoryItem {
  id: string;
  title: string;
  status?: string;
  source?: string;
  points?: number | null;
  isLate?: boolean;
  finalRating?: number | null;
  type?: string | null;
  dueDate?: string | null;
}

// Task Instance Types (Assigned to Mentees)
export interface Task {
  id: string;
  mentorId: string;
  menteeId: string;
  programId: string;
  roadmapTaskId?: string; // If from roadmap
  title: string;
  description: string;
  type: TaskType;
  difficulty: TaskDifficulty;
  status: TaskStatus;
  deadline: string;
  estimatedHours: number;
  deliverableRequirements: string[];
  createdAt: string;
  updatedAt: string;
  submissions: TaskSubmission[];
}

export type TaskStatus = 
  | 'assigned'
  | 'in_progress'
  | 'submitted'
  | 'revision_needed'
  | 'completed';

export interface TaskSubmission {
  id: string;
  taskId: string;
  menteeId: string;
  description: string;
  externalLinks: ExternalLink[];
  submittedAt: string;
  isLate: boolean;
  feedback?: TaskFeedback;
  version: number; // For tracking resubmissions
}

export interface ExternalLink {
  title: string;
  url: string;
  type: 'github' | 'demo' | 'documentation' | 'other';
}

export interface TaskFeedback {
  id: string;
  submissionId: string;
  mentorId: string;
  content: string; // Markdown formatted
  rating: 1 | 2 | 3 | 4 | 5;
  approved: boolean;
  requiredImprovements?: string[];
  providedAt: string;
}

export interface CreateTaskData {
  menteeId: string;
  title: string;
  description: string;
  type: TaskType;
  difficulty: TaskDifficulty;
  deadline: string;
  estimatedHours: number;
  deliverableRequirements: string[];
  roadmapTaskId?: string;
}

export interface SubmitTaskData {
  taskId: string;
  description: string;
  externalLinks: ExternalLink[];
  revisionNotes?: string; // For resubmissions
}

export interface ProvideFeedbackData {
  submissionId: string;
  content: string;
  rating: 1 | 2 | 3 | 4 | 5;
  approved: boolean;
  requiredImprovements?: string[];
}
