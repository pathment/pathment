import { queryOptions } from '@tanstack/react-query';
import { mentorApi } from '@/lib/services/mentor-api';
import type { CohortMentee, CohortTotals } from '@/lib/types/cohort';

export interface MentorCohortData {
  cohort: CohortMentee[];
  totals: CohortTotals | null;
}

/**
 * Query factory for the mentor's cohort (GET /mentor/cohort). Cached under
 * ['cohort','mine'] so the ~11 mentor pages that read it share one fetch.
 */
export const cohortQueries = {
  all: () => ['cohort'] as const,
  mine: () =>
    queryOptions({
      queryKey: [...cohortQueries.all(), 'mine'] as const,
      queryFn: async (): Promise<MentorCohortData> => {
        const res = await mentorApi.getCohort();
        return {
          cohort: res?.data?.cohort ?? [],
          totals: res?.data?.totals ?? null,
        };
      },
      // This data drives inline error UIs (the page renders an `error` + retry),
      // not an ErrorBoundary — so override the global throwOnError default and
      // let consumers read `isError` instead of the query throwing.
      throwOnError: false,
    }),
};
