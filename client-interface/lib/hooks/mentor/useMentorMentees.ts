/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { matchingApi } from '@/lib/services/enrollment-api';
import { useAuth } from '@/lib/context/AuthContext';
import { toast } from 'sonner';

export interface UseMentorMenteesReturn {
  matches: any[];
  filteredMatches: any[];
  programs: string[];
  loading: boolean;
  searchTerm: string;
  filterProgram: string;
  setSearchTerm: (v: string) => void;
  setFilterProgram: (v: string) => void;
  fetchMyMatches: () => Promise<void>;
}

export function useMentorMentees(): UseMentorMenteesReturn {
  const { user } = useAuth();
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterProgram, setFilterProgram] = useState('all');

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

  const programs = useMemo(
    () => [...new Set(matches.map((m) => m.enrollment?.program?.name))].filter(Boolean) as string[],
    [matches]
  );

  const filteredMatches = useMemo(() => {
    return matches.filter((match) => {
      const mentee = match.mentee;
      const program = match.enrollment?.program?.name || '';
      const matchesSearch =
        searchTerm === '' ||
        mentee?.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        mentee?.lastName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        program.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesProgram = filterProgram === 'all' || program === filterProgram;
      return matchesSearch && matchesProgram;
    });
  }, [matches, searchTerm, filterProgram]);

  return {
    matches,
    filteredMatches,
    programs,
    loading,
    searchTerm,
    filterProgram,
    setSearchTerm,
    setFilterProgram,
    fetchMyMatches,
  };
}
