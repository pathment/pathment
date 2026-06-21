import { queryOptions } from '@tanstack/react-query';
import { activityApi } from '@/lib/services/activity-api';
import type { ActivitySummary, DailySession, RecentEvent } from '@/lib/types/activity';

export interface MenteeActivityData {
  summary: ActivitySummary | null;
  dailySessions: DailySession[];
  recentEvents: RecentEvent[];
}

export const activityQueries = {
  all: () => ['activity'] as const,
  menteeSummary: ({ menteeId, days }: { menteeId: string; days: number }) =>
    queryOptions({
      queryKey: [...activityQueries.all(), 'mentee', menteeId, { days }] as const,
      queryFn: async (): Promise<MenteeActivityData> => {
        const res = await activityApi.getMenteeSummary(menteeId, days);
        return {
          summary: res?.data?.summary ?? null,
          dailySessions: res?.data?.dailySessions ?? [],
          recentEvents: res?.data?.recentEvents ?? [],
        };
      },
      enabled: !!menteeId,
      refetchInterval: 5 * 60 * 1000,
      refetchOnWindowFocus: true,
      throwOnError: false,
    }),
};
