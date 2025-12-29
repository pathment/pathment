// Program Types
export interface Program {
  id: string;
  name: string;
  description: string;
  type: ProgramType;
  duration: number; // in weeks
  startDate: string;
  endDate: string;
  skillTags: string[];
  status: ProgramStatus;
  levels: ProgramLevel[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type ProgramType = 
  | 'technical'
  | 'business'
  | 'creative'
  | 'leadership'
  | 'other';

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
