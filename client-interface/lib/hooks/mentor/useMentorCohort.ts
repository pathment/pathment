import { useCallback, useEffect, useMemo, useState } from 'react';
import { mentorApi } from '@/lib/services/mentor-api';
import { useClan, ALL_CLANS } from '@/lib/context/ClanContext';

export type CohortMomentum = 'up' | 'flat' | 'down';
export type CohortRisk = 'low' | 'watch' | 'high';
export type EnrollmentStatus = 'active' | 'matched' | 'pending_completion' | 'level_completed' | 'program_completed' | 'dropped' | 'rejected' | string | null;

export interface CohortMentee {
  id: string;
  name: string;
  avatar: string;
  email: string;
  profilePictureUrl: string | null;
  program: string;
  level: string;
  week: number;
  totalWeeks: number;
  absoluteProgress: number;
  relativeProgress: number;
  onTimeRate: number;
  pendingApprovals: number;
  openBlockers: number;
  momentum: CohortMomentum;
  risk: CohortRisk;
  riskReason: string | null;
  /** Concrete rule-based "why" chips, e.g. "No activity in 6 days". */
  signals?: string[];
  avgRating: number;
  lastActive: string;
  /** Total tasks ever assigned. 0 = this mentee has never been given any work. */
  taskCount: number;
  /** Tasks actually completed — real output, used to effort-weight the leaderboard. */
  tasksCompleted: number;
  sentiment: string;
  clan?: { id: string; name: string } | null;
  // Completion status fields (Issue #340)
  enrollmentStatus?: EnrollmentStatus;
  isCompleted?: boolean;
  currentLevel?: number | null;
  programName?: string | null;
  programDurationWeeks?: number | null;
  completedAt?: string | null;
  tasksTotal?: number;
  tasksCompleted?: number;
  openBlockersCount?: number;
}

export interface CohortTotals {
  mentees: number;
  pendingApprovals: number;
  openBlockers: number;
  atRisk: number;
  onTimeRate: number;
}

export interface UseMentorCohortReturn {
  cohort: CohortMentee[];
  totals: CohortTotals | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useMentorCohort(): UseMentorCohortReturn {
  const [allCohort, setAllCohort] = useState<CohortMentee[]>([]);
  const [rawTotals, setRawTotals] = useState<CohortTotals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { activeClanId } = useClan();

  const fetchCohort = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await mentorApi.getCohort();
      setAllCohort(res?.data?.cohort ?? []);
      setRawTotals(res?.data?.totals ?? null);
    } catch (err) {
      setError('Failed to load your cohort');
      setAllCohort([]);
      setRawTotals(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCohort();
  }, [fetchCohort]);

  // Scope to the active clan (multi-clan mentors). 'all' = the merged view.
  const cohort = useMemo(
    () => (activeClanId === ALL_CLANS ? allCohort : allCohort.filter((m) => m.clan?.id === activeClanId)),
    [allCohort, activeClanId]
  );

  // Recompute the summary totals for the scoped set so headline numbers match
  // what's on screen; the unscoped view keeps the server's totals as-is.
  const totals = useMemo<CohortTotals | null>(() => {
    if (activeClanId === ALL_CLANS) return rawTotals;
    if (!cohort.length && !allCohort.length) return rawTotals;
    return {
      mentees: cohort.length,
      pendingApprovals: cohort.reduce((n, m) => n + (m.pendingApprovals || 0), 0),
      openBlockers: cohort.reduce((n, m) => n + (m.openBlockers || 0), 0),
      atRisk: cohort.filter((m) => m.risk !== 'low').length,
      onTimeRate: cohort.length ? Math.round(cohort.reduce((n, m) => n + (m.onTimeRate || 0), 0) / cohort.length) : 0,
    };
  }, [cohort, allCohort, activeClanId, rawTotals]);

  return { cohort, totals, loading, error, refetch: fetchCohort };
}
