'use client';

import { talksApi, type TalkItem, type TalkCategory } from '@/lib/services/talks-api';
import { qk, useApiQuery, STALE } from '@/lib/query';

export interface UseTalksOptions {
  search?: string;
  categoryId?: string;
}

export interface TalksResponseData {
  talks: TalkItem[];
  pagination: {
    limit: number;
    offset: number;
    totalItems: number;
    hasMore: boolean;
  };
}

const EMPTY_TALKS: TalkItem[] = [];
const EMPTY_CATEGORIES: TalkCategory[] = [];

export function useTalks({ search = '', categoryId = '' }: UseTalksOptions = {}) {
  const { data, loading, error, refetch } = useApiQuery<TalksResponseData>({
    queryKey: qk.mentor.talks(search, categoryId),
    queryFn: async () => (await talksApi.list({ search, categoryId: categoryId || undefined }))?.data ?? {
      talks: [],
      pagination: { limit: 24, offset: 0, totalItems: 0, hasMore: false }
    },
    staleTime: STALE.short,
    errorMessage: 'Failed to load talks',
  });

  const {
    data: categoriesData,
    loading: categoriesLoading,
    refetch: refetchCategories
  } = useApiQuery<TalkCategory[]>({
    queryKey: qk.mentor.talkCategories,
    queryFn: async () => (await talksApi.listCategories())?.data?.categories ?? [],
    staleTime: STALE.medium,
    errorMessage: 'Failed to load categories',
  });

  return {
    talks: data?.talks ?? EMPTY_TALKS,
    pagination: data?.pagination ?? { limit: 24, offset: 0, totalItems: 0, hasMore: false },
    categories: categoriesData ?? EMPTY_CATEGORIES,
    loading,
    categoriesLoading,
    error,
    refetch,
    refetchCategories,
  };
}

export type { TalkItem, TalkCategory } from '@/lib/services/talks-api';
