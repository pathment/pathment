'use client';

import { useCallback } from 'react';
import { menteeApi } from '@/lib/services/mentee-api';
import { qk, useApiQuery, STALE } from '@/lib/query';
import { useClan } from '@/lib/context/ClanContext';

export interface DailyLogEntry {
  id: string;
  dateKey: string;
  tasksDone: string[];
  slotsDone: string[];
  note: string | null;
  loggedAt: string;
}

export interface UseDailyLogReturn {
  entries: DailyLogEntry[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  save: (data: { dateKey: string; tasksDone: string[]; slotsDone?: string[]; note?: string }) => Promise<void>;
}

const EMPTY: DailyLogEntry[] = [];

export function useDailyLog(): UseDailyLogReturn {
  const { menteeActiveClanId } = useClan();
  const { data, loading, error, refetch } = useApiQuery<DailyLogEntry[]>({
    queryKey: qk.me.dailyLog(menteeActiveClanId),
    queryFn: async () => (await menteeApi.getDailyLog())?.data?.entries ?? [],
    staleTime: STALE.short,
    errorMessage: 'Failed to load your daily log',
  });

  const save = useCallback(async (payload: { dateKey: string; tasksDone: string[]; slotsDone?: string[]; note?: string }) => {
    await menteeApi.saveDailyLog(payload);
    await refetch();
  }, [refetch]);

  return { entries: data ?? EMPTY, loading, error, refetch, save };
}
