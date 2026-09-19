'use client';

import { menteeApi } from '@/lib/services/mentee-api';
import { qk, useApiQuery } from '@/lib/query';
import type { MenteeProfile } from '@/lib/hooks/mentor';
import { useClan } from '@/lib/context/ClanContext';

export interface UseMyProgressReturn {
  progress: MenteeProfile | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useMyProgress(): UseMyProgressReturn {
  const { menteeActiveClanId } = useClan();
  const { data, loading, error, refetch } = useApiQuery<MenteeProfile | null>({
    queryKey: qk.me.progress(menteeActiveClanId),
    queryFn: async () => (await menteeApi.getMyProgress())?.data?.profile ?? null,
    errorMessage: 'Failed to load your progress',
  });

  return { progress: data ?? null, loading, error, refetch };
}
