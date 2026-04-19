/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { programManagementApi } from '@/lib/services/program-api';
import { toast } from 'sonner';

export interface UseMenteeProgramsReturn {
  programs: any[];
  filteredPrograms: any[];
  loading: boolean;
  searchQuery: string;
  statusFilter: string;
  setSearchQuery: (v: string) => void;
  setStatusFilter: (v: string) => void;
  fetchPrograms: () => Promise<void>;
}

export function useMenteePrograms(): UseMenteeProgramsReturn {
  const [programs, setPrograms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const fetchPrograms = useCallback(async () => {
    try {
      setLoading(true);
      const response = await programManagementApi.programs.getAll({ status: 'published' });
      // programsApi.getAll returns response (already response.data from apiClient)
      // server body: { data: Program[] }
      const list = Array.isArray(response?.data)
        ? response.data
        : Array.isArray(response)
        ? response
        : [];
      setPrograms(list.filter((program) => program?.status !== 'draft'));
    } catch (err: any) {
      console.error('Failed to fetch programs:', err);
      toast.error('Failed to load programs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrograms();
  }, [fetchPrograms]);

  const filteredPrograms = useMemo(() => {
    return programs.filter((program) => {
      const matchesSearch =
        program.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        program.description?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || program.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [programs, searchQuery, statusFilter]);

  return {
    programs,
    filteredPrograms,
    loading,
    searchQuery,
    statusFilter,
    setSearchQuery,
    setStatusFilter,
    fetchPrograms,
  };
}
