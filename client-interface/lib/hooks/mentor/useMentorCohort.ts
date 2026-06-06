import { useCallback, useEffect, useState } from 'react';
import { mentorApi } from '@/lib/services/mentor-api';

export type CohortMomentum = 'up' | 'flat' | 'down';
export type CohortRisk = 'low' | 'watch' | 'high';

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
  sentiment: string;
  clan?: { id: string; name: string } | null;
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
  const [cohort, setCohort] = useState<CohortMentee[]>([]);
  const [totals, setTotals] = useState<CohortTotals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCohort = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await mentorApi.getCohort();
      setCohort(res?.data?.cohort ?? []);
      setTotals(res?.data?.totals ?? null);
    } catch (err) {
      setError('Failed to load your cohort');
      setCohort([]);
      setTotals(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCohort();
  }, [fetchCohort]);

  return { cohort, totals, loading, error, refetch: fetchCohort };
}
