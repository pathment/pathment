import { useQuery } from '@tanstack/react-query';
import { insightsQueries } from '@/lib/queries/insights';
import type { MenteeProfile } from '@/lib/types/insights';

export interface UseMenteeProfileReturn {
  profile: MenteeProfile | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useMenteeProfile(menteeId: string): UseMenteeProfileReturn {
  const query = useQuery(insightsQueries.byMentee(menteeId));
  return {
    profile: query.data ?? null,
    loading: query.isPending,
    error: query.isError ? 'Failed to load mentee insights' : null,
    refetch: async () => {
      await query.refetch();
    },
  };
}
