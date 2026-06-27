import { useCallback, useEffect, useState } from 'react';
import { cohortApi } from '@/lib/services/intake-api';

export type CohortStatus = 'planning' | 'open' | 'closed' | 'running' | 'completed';

export interface Cohort {
  id: string;
  programId: string;
  name: string;
  description?: string | null;
  status: CohortStatus;
  capacity?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  // Intake configuration (present on the cohort detail fetch).
  levels?: { key: string; label: string }[];
  timezone?: string | null;
  maxApplications?: number | null;
  applyOpensAt?: string | null;
  applyClosesAt?: string | null;
  publicEnabled?: boolean;
  publicSlug?: string | null;
  assessmentId?: string | null;
  assessmentRequired?: boolean;
  intakeFormSchema?: unknown[];
  program?: { id: string; name: string } | null;
  applicationCount?: number;
  applicationsByStatus?: Record<string, number>;
}

export interface UseCohortsReturn {
  cohorts: Cohort[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useCohorts(programId?: string): UseCohortsReturn {
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCohorts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await cohortApi.list(programId ? { programId } : undefined);
      setCohorts(res?.data?.cohorts ?? []);
    } catch {
      setError('Failed to load cohorts');
      setCohorts([]);
    } finally {
      setLoading(false);
    }
  }, [programId]);

  useEffect(() => {
    fetchCohorts();
  }, [fetchCohorts]);

  return { cohorts, loading, error, refetch: fetchCohorts };
}
