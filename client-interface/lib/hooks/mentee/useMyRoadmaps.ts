'use client';

import { menteeRoadmapApi, type MenteeRoadmap } from '@/lib/services/roadmap-api';
import { qk, useApiQuery, STALE } from '@/lib/query';
import { useClan } from '@/lib/context/ClanContext';

export interface UseMyRoadmapsReturn {
  roadmaps: MenteeRoadmap[];
  loading: boolean;
  refetch: () => Promise<void>;
}

const EMPTY: MenteeRoadmap[] = [];

/** The logged-in mentee's roadmap progress (step X/N). */
export function useMyRoadmaps(): UseMyRoadmapsReturn {
  const { menteeActiveClanId } = useClan();
  const { data, loading, refetch } = useApiQuery<MenteeRoadmap[]>({
    queryKey: qk.me.roadmaps(menteeActiveClanId),
    queryFn: async () => (await menteeRoadmapApi.mine())?.data?.roadmaps ?? [],
    staleTime: STALE.long,
  });

  return { roadmaps: data ?? EMPTY, loading, refetch };
}
