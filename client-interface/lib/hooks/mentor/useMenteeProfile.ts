'use client';

import { mentorApi } from '@/lib/services/mentor-api';
import { qk, useApiQuery } from '@/lib/query';
import type { CohortMentee } from './useMentorCohort';

export interface ProfileBlocker {
  id: string;
  title: string;
  category: string;
  severity: 'low' | 'medium' | 'high';
  status: 'open' | 'resolved';
  daysOpen: number;
  taskTitle: string | null;
}

export interface ProfileDelay {
  id: string;
  reason: string;
  kind: string;
  days: number;
  accepted: boolean;
  category: 'external' | 'scope' | 'avoidance';
  aiRationale: string | null;
  occurredAt: string;
}

export interface Personality {
  consistency: number | null;
  communication: number | null;
  resilience: number | null;
  independence: number | null;
  /** Free-text "how they think/work" read, captured in 1:1s. */
  read?: string | null;
}

export interface ProfileInsight {
  id: string;
  kind: 'personality' | 'analytical' | 'issue' | 'strength' | 'general';
  note: string;
  source: '1:1' | 'text' | 'observation' | null;
  at: string;
  by: string | null;
}

export interface MeetingNote {
  id: string;
  date: string;
  kind: string;
  summary: string;
  sentiment: 'positive' | 'neutral' | 'low';
  issues: string[];
  nextSteps: string[];
  by: string | null;
}

export interface ProfileCollaborator {
  id: string;
  name: string;
  role: string;
  email: string | null;
  status: 'invited' | 'active';
}

export interface MenteeProfile extends CohortMentee {
  phone?: string | null;
  currentOccupation?: string | null;
  aiSummary: string;
  aiSignals: string[];
  blockers: ProfileBlocker[];
  delays: ProfileDelay[];
  personality: Personality | null;
  insights: ProfileInsight[];
  notes: MeetingNote[];
  collaborators: ProfileCollaborator[];
  dailyLogs: { dateKey: string; tasksDone: number; note: string | null; loggedAt: string }[];
  /**
   * Showing up, counted from the daily log. The one progress signal that
   * exists in a standing clan, where there is no enrollment and therefore no
   * week number, programme length or overall percentage.
   */
  consistency?: {
    currentStreakDays: number;
    longestStreakDays: number;
    loggedLast7: number;
    lastLoggedOn: string | null;
    inFlight: number;
    taskCount: number;
    completedCount: number;
  };
  tasksByStatus: Record<string, Array<{
    id: string;
    title: string;
    type: string | null;
    status: string;
    dueDate: string | null;
    isLate: boolean;
    finalRating: number | null;
  }>>;
  /** Sections that failed to load — each key maps to a short error message. */
  sectionErrors?: Record<string, string>;
}

export interface UseMenteeProfileReturn {
  profile: MenteeProfile | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useMenteeProfile(menteeId: string): UseMenteeProfileReturn {
  const { data, loading, error, refetch } = useApiQuery<MenteeProfile | null>({
    queryKey: qk.mentee.profile(menteeId),
    queryFn: async () => {
      const res = await mentorApi.getMenteeProfile(menteeId);
      return res?.data?.profile ?? null;
    },
    enabled: !!menteeId,
    errorMessage: 'Failed to load mentee insights',
  });

  return { profile: data ?? null, loading, error, refetch };
}
