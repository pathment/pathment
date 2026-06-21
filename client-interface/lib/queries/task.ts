import { queryOptions } from '@tanstack/react-query';
import { taskApi } from '@/lib/services/task-api';
import type { MenteeTask } from '@/lib/types/task';

/** Query factory for a mentee's assigned tasks (taskApi.getMenteeTasks). */
export const taskQueries = {
  all: () => ['task'] as const,
  byMentee: (menteeId: string) =>
    queryOptions({
      queryKey: [...taskQueries.all(), 'mentee', menteeId] as const,
      queryFn: async (): Promise<MenteeTask[]> => {
        const res: { data?: { tasks?: MenteeTask[] } } = await taskApi.getMenteeTasks(menteeId);
        return res?.data?.tasks ?? [];
      },
      enabled: !!menteeId,
      throwOnError: false,
    }),
};
