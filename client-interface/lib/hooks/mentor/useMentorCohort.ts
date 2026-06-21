import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useClan, ALL_CLANS } from '@/lib/context/ClanContext';
import { cohortQueries } from '@/lib/queries/cohort';
import type { CohortMentee, CohortTotals } from '@/lib/types/cohort';

export interface UseMentorCohortReturn {
  cohort: CohortMentee[];
  totals: CohortTotals | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useMentorCohort(): UseMentorCohortReturn {
  const { activeClanId } = useClan();
  const query = useQuery(cohortQueries.mine());

  // useMemo so the `?? []` default doesn't produce a new array ref each render
  // (which would churn the dependent useMemos below).
  const allCohort = useMemo(() => query.data?.cohort ?? [], [query.data?.cohort]);
  const rawTotals = query.data?.totals ?? null;

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

  return {
    cohort,
    totals,
    loading: query.isPending,
    error: query.isError ? 'Failed to load your cohort' : null,
    refetch: async () => {
      await query.refetch();
    },
  };
}
