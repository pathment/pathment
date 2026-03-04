/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { matchingApi } from '@/lib/services/enrollment-api';
import { useAuth } from '@/lib/context/AuthContext';
import { toast } from 'sonner';

export interface UseMentorProgramsReturn {
  programs: any[];
  loading: boolean;
  fetchPrograms: () => Promise<void>;
}

export function useMentorPrograms(): UseMentorProgramsReturn {
  const { user } = useAuth();
  const [programs, setPrograms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPrograms = useCallback(async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      const response = await matchingApi.getMatches({ mentorId: user.id, status: 'active' });
      const matches = response?.data?.matches || response?.matches || [];

      const programMap = new Map<string, any>();
      for (const match of matches) {
        const prog = match.enrollment?.program;
        if (!prog) continue;
        if (!programMap.has(prog.id)) {
          programMap.set(prog.id, { ...prog, menteeCount: 0, avgProgress: 0, totalProgress: 0 });
        }
        const entry = programMap.get(prog.id);
        entry.menteeCount += 1;
        entry.totalProgress += parseFloat(match.enrollment?.overallProgressPercentage || 0);
      }

      const programList = Array.from(programMap.values()).map((p) => ({
        ...p,
        avgProgress: p.menteeCount > 0 ? Math.round(p.totalProgress / p.menteeCount) : 0,
      }));

      setPrograms(programList);
    } catch (error: any) {
      console.error('Failed to fetch programs:', error);
      toast.error('Failed to load your programs');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) {
      fetchPrograms();
    }
  }, [user?.id, fetchPrograms]);

  return { programs, loading, fetchPrograms };
}
