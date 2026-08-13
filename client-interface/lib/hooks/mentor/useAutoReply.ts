import { useCallback, useEffect, useState } from 'react';
import { autoReplyApi, type AutoReplyStatus } from '@/lib/services/auto-reply-api';

/**
 * What auto reply needs before it can be switched on, and whether it is.
 *
 * The status is never derived in the browser. Whether a mentor is ready depends
 * on their API key, how much material they have ingested and how much of their
 * writing has been studied, and none of that is knowable from the page.
 */
export function useAutoReply() {
  const [status, setStatus] = useState<AutoReplyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setStatus(await autoReplyApi.status());
    } catch (e: unknown) {
      const message = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(message || 'Could not load auto reply');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  /** Returns the server's message when it refuses, so the page can show it. */
  const setEnabled = useCallback(async (enabled: boolean) => {
    const next = await autoReplyApi.setEnabled(enabled);
    setStatus(next);
    return next;
  }, []);

  return { status, loading, error, refetch, setEnabled };
}
