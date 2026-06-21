import { useCallback, useEffect, useState } from 'react';
import { menteeApi } from '@/lib/services/mentee-api';
import type { MenteeProfile } from '@/lib/types/insights';

export interface UseMyProgressReturn {
  progress: MenteeProfile | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useMyProgress(): UseMyProgressReturn {
  const [progress, setProgress] = useState<MenteeProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProgress = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await menteeApi.getMyProgress();
      setProgress(res?.data?.profile ?? null);
    } catch {
      setError('Failed to load your progress');
      setProgress(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProgress();
  }, [fetchProgress]);

  return { progress, loading, error, refetch: fetchProgress };
}
