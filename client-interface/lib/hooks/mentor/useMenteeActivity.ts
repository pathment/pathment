'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { activityQueries } from '@/lib/queries/activity';
import type { ActivitySummary, DailySession, RecentEvent } from '@/lib/types/activity';

export interface UseMenteeActivityReturn {
  summary: ActivitySummary | null;
  dailySessions: DailySession[];
  recentEvents: RecentEvent[];
  loading: boolean;
  days: number;
  setDays: (d: number) => void;
  refetch: () => void;
}

export function useMenteeActivity(menteeId: string | null): UseMenteeActivityReturn {
  const [days, setDays] = useState(7);
  
  const query = useQuery(activityQueries.menteeSummary({ menteeId: menteeId ?? '', days }));

  return {
    summary: query.data?.summary ?? null,
    dailySessions: query.data?.dailySessions ?? [],
    recentEvents: query.data?.recentEvents ?? [],
    loading: query.isPending,
    days,
    setDays,
    refetch: () => {
      query.refetch();
    },
  };
}
