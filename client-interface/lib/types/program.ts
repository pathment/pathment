// Program Types
import { Roadmap } from './roadmap';
export type { Roadmap };
export interface Program {
  id: string;
  name: string;
  description: string;
  type: ProgramType;
  // legacy field (kept for compatibility)
  duration?: number;
  // actual server field
  totalDurationWeeks?: number;
  estimatedHoursPerWeek?: number;
  startDate: string;
  endDate?: string;
  skillTags?: string[];
  tags?: string[];
  status: ProgramStatus;
  levels?: ProgramLevel[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  // API-computed fields
  completion?: number;
  mentors?: number;
  isTemplate?: boolean;
  maxEnrollments?: number;
  learningOutcomes?: string[];
  prerequisites?: string;
  targetAudience?: string;
  publishedAt?: string | null;
  _count?: {
    enrollments?: number;
    mentors?: number;
  };
  creator?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  enrollments?: { id: string }[];
}

export type ProgramType = 
  | 'mentorship'
  | 'internship'
  | 'training'
  | 'onboarding';

export type ProgramStatus = 
  | 'draft'
  | 'published'
  | 'active'
  | 'completed'
  | 'archived';

export interface ProgramLevel {
  id: string;
  programId: string;
  name: string; // e.g., Foundation, Intermediate, Advanced
  order: number;
  duration: number; // in weeks
  learningOutcomes: string[];
  prerequisites: string[];
  assignedMentors: string[]; // mentor IDs
  roadmap?: Roadmap;
}

export interface CreateProgramData {
  name: string;
  description: string;
  type: ProgramType;
  duration: number;
  startDate: string;
  endDate: string;
  skillTags: string[];
  levels: Omit<ProgramLevel, 'id' | 'programId'>[];
}

export interface UpdateProgramData extends Partial<CreateProgramData> {
  status?: ProgramStatus;
}
