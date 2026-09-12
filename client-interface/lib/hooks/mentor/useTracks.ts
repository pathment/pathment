'use client';

import { useCallback } from 'react';
import { tracksApi, type Track } from '@/lib/services/tracks-api';
import { qk, useApiQuery, useInvalidate } from '@/lib/query';

export interface UseTracksReturn {
  tracks: Track[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  create: (name: string) => Promise<void>;
  rename: (id: string, name: string) => Promise<void>;
  archive: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  addTask: (id: string, title: string) => Promise<void>;
}

const EMPTY: Track[] = [];

export function useTracks(menteeId: string | null): UseTracksReturn {
  const { data, loading, error, refetch } = useApiQuery<Track[]>({
    queryKey: qk.mentor.tracks(menteeId ?? ''),
    queryFn: async () => (await tracksApi.listForMentee(menteeId!))?.data?.tracks ?? [],
    enabled: !!menteeId,
    errorMessage: 'Failed to load tracks',
  });

  const invalidate = useInvalidate();

  const after = useCallback(async (call: Promise<unknown>) => {
    await call;
    await invalidate(qk.mentor.tracks(menteeId ?? ''));
  }, [invalidate, menteeId]);

  return {
    tracks: data ?? EMPTY,
    loading,
    error,
    refetch,
    create: useCallback((name: string) => after(tracksApi.create(menteeId!, { name })), [after, menteeId]),
    rename: useCallback((id: string, name: string) => after(tracksApi.rename(id, name)), [after]),
    archive: useCallback((id: string) => after(tracksApi.setArchived(id, true)), [after]),
    remove: useCallback((id: string) => after(tracksApi.remove(id)), [after]),
    addTask: useCallback((id: string, title: string) => after(tracksApi.addTask(id, { title })), [after]),
  };
}
