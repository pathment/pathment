'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { menteeApi } from '@/lib/services/mentee-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { toast } from 'sonner';

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

interface UseMenteeProfileReturn {
  mentee: MenteeDetail | null;
  assignedMentor: MenteePerson | null;
  coMentors: MenteePerson[];
  currentClan: { id: string; name: string; programId?: string } | null;
  enrollments: MenteeEnrollment[];
  recentTasks: MenteeRecentTask[];
  stats: MenteeStats | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useMenteeProfile(): UseMenteeProfileReturn {
  const { id } = useParams<{ id: string }>();
  const [mentee, setMentee] = useState<MenteeDetail | null>(null);
  const [assignedMentor, setAssignedMentor] = useState<MenteePerson | null>(null);
  const [coMentors, setCoMentors] = useState<MenteePerson[]>([]);
  const [currentClan, setCurrentClan] = useState<UseMenteeProfileReturn['currentClan']>(null);
  const [enrollments, setEnrollments] = useState<MenteeEnrollment[]>([]);
  const [recentTasks, setRecentTasks] = useState<MenteeRecentTask[]>([]);
  const [stats, setStats] = useState<MenteeStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMentee = useCallback(async () => {
    if (!id) return;
    try {
      setIsLoading(true);
      setError(null);
      const response = (await menteeApi.getById(id)) as {
        data?: {
          mentee?: MenteeDetail;
          assignedMentor?: MenteePerson | null;
          coMentors?: MenteePerson[];
          currentClan?: UseMenteeProfileReturn['currentClan'];
          enrollments?: MenteeEnrollment[];
          recentTasks?: MenteeRecentTask[];
          stats?: MenteeStats;
        };
      };
      const d = response?.data;
      setMentee(d?.mentee ?? null);
      setAssignedMentor(d?.assignedMentor ?? null);
      setCoMentors(d?.coMentors ?? []);
      setCurrentClan(d?.currentClan ?? null);
      setEnrollments(d?.enrollments ?? []);
      setRecentTasks(d?.recentTasks ?? []);
      setStats(d?.stats ?? null);
    } catch (err: unknown) {
      const msg = extractApiErrorMessage(err, 'Failed to load mentee profile');
      setError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchMentee();
  }, [fetchMentee]);

  return {
    mentee,
    assignedMentor,
    coMentors,
    currentClan,
    enrollments,
    recentTasks,
    stats,
    isLoading,
    error,
    refetch: fetchMentee,
  };
}
