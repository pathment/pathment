import { TaskType, TaskDifficulty } from './roadmap';

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
