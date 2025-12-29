// Roadmap Types
export interface Roadmap {
  id: string;
  programLevelId: string;
  weeks: RoadmapWeek[];
  generatedBy: 'ai' | 'manual';
  createdAt: string;
  updatedAt: string;
}

export interface RoadmapWeek {
  weekNumber: number;
  objectives: string[];
  tasks: RoadmapTask[];
  estimatedHours: number;
}

export interface RoadmapTask {
  id: string;
  title: string;
  description: string;
  type: TaskType;
  difficulty: TaskDifficulty;
  estimatedHours: number;
  acceptanceCriteria: string[];
  resources: LearningResource[];
  order: number;
}

export type TaskType = 
  | 'reading'
  | 'coding'
  | 'project'
  | 'quiz'
  | 'video'
  | 'exercise'
  | 'other';

export type TaskDifficulty = 
  | 'beginner'
  | 'intermediate'
  | 'advanced'
  | 'expert';

export interface LearningResource {
  title: string;
  url: string;
  type: 'article' | 'video' | 'documentation' | 'tutorial' | 'other';
}

export interface GenerateRoadmapRequest {
  programLevelId: string;
  programDetails: {
    name: string;
    description: string;
    skillTags: string[];
    duration: number;
    levelName: string;
    learningOutcomes: string[];
  };
}
