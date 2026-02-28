'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { programsApi } from '@/lib/services/program-api';
import { usePagination } from '@/lib/hooks/shared/usePagination';
import { useDebounce } from '@/lib/hooks/shared/useDebounce';
import type { Program } from '@/lib/types';

export type ProgramStatus = 'all' | 'draft' | 'published' | 'completed' | 'archived';
export type ProgramSortBy = 'createdAt' | 'name' | 'startDate';
export type SortOrder = 'ASC' | 'DESC';

export interface UseProgramListReturn {
  programs: Program[];
  isLoading: boolean;
  error: string | null;
  isEmpty: boolean;
  pagination: ReturnType<typeof usePagination>;
  // filters
  search: string;
  status: ProgramStatus;
  type: string;
  sortBy: ProgramSortBy;
  sortOrder: SortOrder;
  hasActiveFilters: boolean;
  // actions
  setSearch: (v: string) => void;
  setStatus: (v: ProgramStatus) => void;
  setType: (v: string) => void;
  setSortBy: (v: ProgramSortBy) => void;
  setSortOrder: (v: SortOrder) => void;
  resetFilters: () => void;
  refetch: () => void;
  handleDelete: (id: string, name: string) => Promise<void>;
}

export function useProgramList(): UseProgramListReturn {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearchRaw] = useState('');
  const [status, setStatusRaw] = useState<ProgramStatus>('all');
  const [type, setTypeRaw] = useState('all');
  const [sortBy, setSortByRaw] = useState<ProgramSortBy>('createdAt');
  const [sortOrder, setSortOrderRaw] = useState<SortOrder>('DESC');

  const debouncedSearch = useDebounce(search, 400);
  const pagination = usePagination({ initialLimit: 10 });

  // Reset to page 1 when any filter changes
  const setSearch = useCallback((v: string) => { setSearchRaw(v); pagination.reset(); }, [pagination]);
  const setStatus = useCallback((v: ProgramStatus) => { setStatusRaw(v); pagination.reset(); }, [pagination]);
  const setType   = useCallback((v: string) => { setTypeRaw(v); pagination.reset(); }, [pagination]);
  const setSortBy = useCallback((v: ProgramSortBy) => { setSortByRaw(v); pagination.reset(); }, [pagination]);
  const setSortOrder = useCallback((v: SortOrder) => { setSortOrderRaw(v); pagination.reset(); }, [pagination]);

  const resetFilters = useCallback(() => {
    setSearchRaw('');
    setStatusRaw('all');
    setTypeRaw('all');
    setSortByRaw('createdAt');
    setSortOrderRaw('DESC');
    pagination.reset();
  }, [pagination]);

  const fetchPrograms = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await programsApi.getAll({
        ...(debouncedSearch.trim()          && { search: debouncedSearch.trim().slice(0, 100) }),
        ...(status !== 'all'               && { status }),
        ...(type !== 'all'                 && { type }),
        sortBy,
        sortOrder,
        page:  pagination.page,
        limit: pagination.limit,
      });

      setPrograms(Array.isArray(response?.data) ? response.data : []);
      const total = response?.pagination?.totalItems ?? response?.pagination?.total ?? (response?.pagination?.totalPages ? response.pagination.totalPages * pagination.limit : 0);
      pagination.setTotal(total);
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Failed to load programs';
      setError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearch, status, type, sortBy, sortOrder, pagination.page, pagination.limit]);

  useEffect(() => {
    fetchPrograms();
  }, [fetchPrograms]);

  const handleDelete = useCallback(async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) return;
    try {
      const { programsApi: api } = await import('@/lib/services/program-api');
      await api.delete(id);
      toast.success('Program deleted successfully');
      fetchPrograms();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to delete program');
    }
  }, [fetchPrograms]);

  const hasActiveFilters =
    search.trim() !== '' || status !== 'all' || type !== 'all' ||
    sortBy !== 'createdAt' || sortOrder !== 'DESC';

  return {
    programs,
    isLoading,
    error,
    isEmpty: !isLoading && !error && programs.length === 0,
    pagination,
    search,
    status,
    type,
    sortBy,
    sortOrder,
    hasActiveFilters,
    setSearch,
    setStatus,
    setType,
    setSortBy,
    setSortOrder,
    resetFilters,
    refetch: fetchPrograms,
    handleDelete,
  };
}
