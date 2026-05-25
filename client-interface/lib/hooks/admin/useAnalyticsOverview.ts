'use client';

import { useState, useEffect, useCallback } from 'react';
import { adminApi } from '@/lib/services/admin-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { toast } from 'sonner';

export interface AnalyticsOverview {
  mentors: {
    totalMentors: number;
    activeMatches: number;
    avgRating: string;
    utilization: number;
  };
  mentees: {
    totalMentees: number;
    activeEnrollments: number;
    avgProgress: number;
    engagementScore: number;
  };
  programs: {
    totalPrograms: number;
    publishedPrograms: number;
    completionRate: number;
    draftPrograms: number;
  };
  enrollments: {
    total: number;
    byStatus: Record<string, number>;
  };
  matches: {
    totalMatches: number;
    activeMatches: number;
    pendingMatches: number;
    avgSatisfaction: string;
  };
  lastUpdated: string;
}

interface UseAnalyticsOverviewReturn {
  data: AnalyticsOverview | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useAnalyticsOverview(): UseAnalyticsOverviewReturn {
  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOverview = useCallback(async () => {
    try {
      setLoading(true);
      const response = await adminApi.analytics.getOverview();
      setData(response as AnalyticsOverview);
      setError(null);
    } catch (err: unknown) {
      const message = extractApiErrorMessage(err, 'Failed to load analytics');
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOverview();

    const interval = setInterval(fetchOverview, 60000);

    return () => clearInterval(interval);
  }, [fetchOverview]);

  return { data, loading, error, refetch: fetchOverview };
}
