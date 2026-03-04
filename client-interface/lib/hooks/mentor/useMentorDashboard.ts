/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { matchingApi } from '@/lib/services/enrollment-api';
import { useAuth } from '@/lib/context/AuthContext';
import { toast } from 'sonner';

export interface UseMentorDashboardReturn {
  matches: any[];
  activeMentees: any[];
  programsCount: number;
  loading: boolean;
  fetchMyMatches: () => Promise<void>;
}

export function useMentorDashboard(): UseMentorDashboardReturn {
  const { user } = useAuth();
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMyMatches = useCallback(async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      const response = await matchingApi.getMatches({ mentorId: user.id, status: 'active' });
      const matchesList = response?.data?.matches || response?.matches || [];
      setMatches(matchesList);
    } catch (error: any) {
      console.error('Failed to fetch matches:', error);
      toast.error('Failed to load your mentees');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) {
      fetchMyMatches();
    }
  }, [user?.id, fetchMyMatches]);

  const activeMentees = useMemo(
    () => matches.filter((m) => m.status === 'active'),
    [matches]
  );

  const programsCount = useMemo(
    () => [...new Set(matches.map((m) => m.enrollment?.program?.id))].filter(Boolean).length,
    [matches]
  );

  return { matches, activeMentees, programsCount, loading, fetchMyMatches };
}
