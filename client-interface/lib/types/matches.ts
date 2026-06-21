// Mentor↔mentee match (and the enrollment-fallback) consumed by the mentee
// detail page. Served by GET /matches (matchingApi.getMatches).

export type MatchStatus = 'pending' | 'active' | 'completed' | 'cancelled';

/** Intake-profile fields on a mentee user (subset the detail page reads). */
export interface MenteeIntakeProfile {
  learningGoals?: string[];
  interests?: string[];
  priorExperience?: string | null;
}

export interface MatchUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  menteeProfile?: MenteeIntakeProfile | null;
}

/** Enrollment as nested in a match — includes the extra fields the page reads. */
export interface MatchEnrollment {
  id: string;
  status: string;
  currentWeek: number | null;
  // DECIMAL(5,2) → serialized as a string; the page parseFloat()s it.
  overallProgressPercentage: string | null;
  completionRequestedByRole: string | null;
  program?: { id: string; name: string } | null;
}

/** An enrollment row that carries its mentee (the clan-placed fallback path). */
export type EnrollmentWithMentee = MatchEnrollment & { mentee: MatchUser };

export interface MentorMenteeMatch {
  id: string;
  mentorId: string;
  menteeId: string;
  enrollmentId: string;
  status: MatchStatus;
  matchedAt: string | null;
  mentor?: MatchUser | null;
  mentee: MatchUser;
  enrollment: MatchEnrollment | null;
}

/** What the mentee-detail query actually exposes (page reads only these two). */
export interface MenteeDetailMatch {
  mentee: MatchUser;
  enrollment: MatchEnrollment | null;
}

/** Result of approve completion — union of the service's return shapes. */
export interface CompletionResult {
  autoPromoted?: boolean;
  nextLevelName?: string;
  hasNextLevel?: boolean;
  programCompleted?: boolean;
}
