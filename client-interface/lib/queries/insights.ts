import { queryOptions } from '@tanstack/react-query';
import { mentorApi } from '@/lib/services/mentor-api';
import type { MenteeProfile } from '@/lib/types/insights';

/** Query factory for a mentee's AI-enriched profile (mentorApi.getMenteeProfile). */
export const insightsQueries = {
  all: () => ['insights'] as const,
  byMentee: (menteeId: string) =>
    queryOptions({
      queryKey: [...insightsQueries.all(), 'mentee', menteeId] as const,
      queryFn: async (): Promise<MenteeProfile | null> => {
        const res: { data?: { profile?: MenteeProfile | null } } =
          await mentorApi.getMenteeProfile(menteeId);
        return res?.data?.profile ?? null;
      },
      enabled: !!menteeId,
      throwOnError: false,
    }),
};
