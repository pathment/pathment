import { useCallback, useEffect, useState } from 'react';
import { performanceApi, type ClanPerformance } from '@/lib/services/performance-api';

/**
 * The clan's scores, as the server computed them.
 *
 * Deliberately not computed here. Two of the dimensions are relative to the
 * peer group, and a browser holding one page of a cohort cannot work those out.
 * Doing it in the browser is also how three different scores for the same
 * person came to exist across two pages and the mobile app.
 */
export function useClanPerformance(clanId: string | null) {
  const [performance, setPerformance] = useState<ClanPerformance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPerformance = useCallback(async () => {
    if (!clanId) {
      setPerformance(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setPerformance(await performanceApi.clan(clanId));
    } catch (e: unknown) {
      const message = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(message || 'Could not load the clan scores');
    } finally {
      setLoading(false);
    }
  }, [clanId]);

  useEffect(() => {
    fetchPerformance();
  }, [fetchPerformance]);

  const setDisabled = useCallback(
    async (disabled: string[]) => {
      if (!clanId) return;
      await performanceApi.setClanDisabled(clanId, disabled);
      await fetchPerformance();
    },
    [clanId, fetchPerformance]
  );

  return { performance, loading, error, refetch: fetchPerformance, setDisabled };
}
