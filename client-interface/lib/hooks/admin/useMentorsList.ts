'use client';

import { useState, useEffect, useCallback } from 'react';
import { mentorApi } from '@/lib/services/enrollment-api';
import { usePagination } from '@/lib/hooks/shared/usePagination';
import { useDebounce } from '@/lib/hooks/shared/useDebounce';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { toast } from 'sonner';

export interface MentorListItem {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  status: string;
  createdAt: string;
  mentorProfile?: {
    title?: string;
    organization?: string;
    specialization?: string[];
    maxMentees?: number;
    currentMenteeCount?: number;
    isAcceptingMentees?: boolean;
    avgFeedbackRating?: number;
    totalMenteesGuided?: number;
    yearsOfExperience?: number;
  };
}

export type AcceptingFilter = 'all' | 'accepting' | 'not_accepting';

interface UseMentorsListReturn {
  mentors: MentorListItem[];
  isLoading: boolean;
  error: string | null;
  pagination: ReturnType<typeof usePagination>;
  search: string;
  setSearch: (v: string) => void;
  acceptingFilter: AcceptingFilter;
  setAcceptingFilter: (v: AcceptingFilter) => void;
  refetch: () => Promise<void>;
}

export function useMentorsList(): UseMentorsListReturn {
  const pagination = usePagination({ initialPage: 1, initialLimit: 20 });
  const [search, setSearchInput] = useState('');
  const [acceptingFilter, setAcceptingFilter] = useState<AcceptingFilter>('all');
  const debouncedSearch = useDebounce(search, 400);

  const [mentors, setMentors] = useState<MentorListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMentors = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await mentorApi.getAll({
        ...(debouncedSearch.trim() && { search: debouncedSearch.trim() }),
        page: pagination.page,
        limit: pagination.limit,
        ...(acceptingFilter !== 'all' && {
          accepting: acceptingFilter === 'accepting' ? 'true' : 'false',
        }),
      });

      const list: MentorListItem[] = response?.data?.mentors ?? [];
      const meta = response?.pagination;

      setMentors(list);
      if (meta?.totalItems !== undefined) {
        pagination.setTotal(meta.totalItems);
      }
    } catch (err: unknown) {
      const msg = extractApiErrorMessage(err, 'Failed to load mentors');
      setError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.page, pagination.limit, debouncedSearch, acceptingFilter]);

  useEffect(() => {
    fetchMentors();
  }, [fetchMentors]);

  // Reset to page 1 on filter/search change
  useEffect(() => {
    pagination.reset();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, acceptingFilter]);

  return {
    mentors,
    isLoading,
    error,
    pagination,
    search,
    setSearch: setSearchInput,
    acceptingFilter,
    setAcceptingFilter,
    refetch: fetchMentors,
  };
}
