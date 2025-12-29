// Enrollment & Matching Types
export interface Enrollment {
  id: string;
  menteeId: string;
  programId: string;
  programLevelId: string;
  status: EnrollmentStatus;
  matchedMentorId?: string;
  enrolledAt: string;
  matchedAt?: string;
  startedAt?: string;
  completedAt?: string;
}

export type EnrollmentStatus = 
  | 'pending_match'
  | 'matched'
  | 'active'
  | 'completed'
  | 'withdrawn';

export interface MentorMatchSuggestion {
  mentorId: string;
  mentorName: string;
  mentorExpertise: string[];
  compatibilityScore: number; // 0-100
  availabilityStatus: 'available' | 'limited' | 'full';
  currentMenteeCount: number;
  maxMenteeCapacity: number;
  matchReasoning: string;
}

export interface CreateMatchData {
  enrollmentId: string;
  mentorId: string;
  menteeId: string;
  programLevelId: string;
}

export interface EnrollmentData {
  programId: string;
  programLevelId: string;
}
