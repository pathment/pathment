'use client';

import { qk, useApiQuery } from '@/lib/query';
import { useParams } from 'next/navigation';
import { menteeApi } from '@/lib/services/mentee-api';

export interface MenteeProfileData {
  currentEducation?: string;
  currentOccupation?: string;
  learningGoals?: string[];
  interests?: string[];
  priorExperience?: string;
  preferredLearningStyle?: string;
  totalProgramsEnrolled?: number;
  totalProgramsCompleted?: number;
  totalTasksCompleted?: number;
  avgTaskRating?: number;
  currentStreakDays?: number;
  longestStreakDays?: number;
  lastActivityDate?: string;
  totalPoints?: number;
  currentLevel?: number;
  totalBadgesEarned?: number;
}

export interface MenteeSkill {
  id: string;
  name: string;
  category?: string;
  UserSkill?: { proficiencyLevel?: string };
}

export interface MenteePerson {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  profilePictureUrl?: string | null;
}

export interface MenteeEnrollment {
  id: string;
  status: string;
  overallProgressPercentage?: number | string;
  tasksCompleted?: number;
  tasksTotal?: number;
  totalPointsEarned?: number;
  enrolledAt?: string;
  program?: { id: string; name: string; type?: string };
  clan?: { id: string; name: string } | null;
  mentor?: MenteePerson | null;
}

export interface MenteeRecentTask {
  id: string;
  title: string;
  status: string;
  points: number;
  completedAt?: string | null;
  updatedAt?: string | null;
}

export interface MenteeStats {
  overallProgress: number;
  tasksCompleted: number;
  tasksTotal: number;
  points: number;
  lastActive?: string | null;
  currentClanName?: string | null;
}

export interface MenteeDetail {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  profilePictureUrl?: string;
  createdAt: string;
  lastLoginAt?: string;
  menteeProfile?: MenteeProfileData;
  skills?: MenteeSkill[];
}

/** How this mentee was admitted — read from their intake application, so it
 *  stays accurate and never becomes a stale label on the person. */
export interface MenteeAdmission {
  cohortId: string;
  cohortName: string | null;
  levelKey: string | null;
  levelLabel: string | null;
  recommendedLevelLabel: string | null;
  assessmentScore: number | null;
  admittedAt: string | null;
}

interface UseMenteeProfileReturn {
  mentee: MenteeDetail | null;
  assignedMentor: MenteePerson | null;
  admission: MenteeAdmission | null;
  coMentors: MenteePerson[];
  currentClan: { id: string; name: string; programId?: string } | null;
  enrollments: MenteeEnrollment[];
  recentTasks: MenteeRecentTask[];
  stats: MenteeStats | null;
  isLoading: boolean;
  error: string | null;
  /** HTTP status when the load failed — lets the page tell 403 from 404. */
  errorStatus: number | null;
  refetch: () => Promise<void>;
}

type MenteeProfileBundle = Omit<UseMenteeProfileReturn, 'isLoading' | 'error' | 'errorStatus' | 'refetch'>;

const EMPTY: MenteeProfileBundle = {
  mentee: null,
  admission: null,
  assignedMentor: null,
  coMentors: [],
  currentClan: null,
  enrollments: [],
  recentTasks: [],
  stats: null,
};

/** The mentee in the route (`/admin/mentees/[id]`), or `menteeId` when shown elsewhere (a drawer). */
export function useMenteeProfile(menteeId?: string | null): UseMenteeProfileReturn {
  const params = useParams<{ id: string }>();
  const id = menteeId ?? params?.id;

  const { data, loading, error, errorStatus, refetch } = useApiQuery<MenteeProfileBundle>({
    queryKey: qk.admin.menteeProfileDetail(id ?? ''),
    queryFn: async () => {
      const response = (await menteeApi.getById(id)) as { data?: Partial<MenteeProfileBundle> };
      const d = response?.data;
      return {
        mentee: d?.mentee ?? null,
        admission: d?.admission ?? null,
        assignedMentor: d?.assignedMentor ?? null,
        coMentors: d?.coMentors ?? [],
        currentClan: d?.currentClan ?? null,
        enrollments: d?.enrollments ?? [],
        recentTasks: d?.recentTasks ?? [],
        stats: d?.stats ?? null,
      };
    },
    enabled: !!id,
    errorMessage: 'Failed to load mentee profile',
  });

  return { ...(data ?? EMPTY), isLoading: loading, error, errorStatus, refetch };
}
