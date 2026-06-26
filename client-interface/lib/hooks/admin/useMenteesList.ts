'use client';

import { useState, useEffect, useCallback } from 'react';
import { menteeApi } from '@/lib/services/mentee-api';
import { usePagination } from '@/lib/hooks/shared/usePagination';
import { useDebounce } from '@/lib/hooks/shared/useDebounce';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { toast } from 'sonner';

export interface MenteeListItem {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  status: string;
  createdAt: string;
  profilePictureUrl?: string | null;
  /** The mentee's current clan placement (for the "move clan" action). */
  currentClan?: { id: string; name: string; programId: string } | null;
  menteeProfile?: {
    currentEducation?: string;
    currentOccupation?: string;
    totalProgramsEnrolled?: number;
    totalProgramsCompleted?: number;
    totalTasksCompleted?: number;
    totalPoints?: number;
    currentLevel?: number;
    currentStreakDays?: number;
    lastActivityDate?: string;
    totalBadgesEarned?: number;
  };
}

interface UseMenteesListReturn {
  mentees: MenteeListItem[];
  isLoading: boolean;
  error: string | null;
  pagination: ReturnType<typeof usePagination>;
  search: string;
  setSearch: (v: string) => void;
  refetch: () => Promise<void>;
}

export function useMenteesList(): UseMenteesListReturn {
  const pagination = usePagination({ initialPage: 1, initialLimit: 20 });
  const [search, setSearchInput] = useState('');
  const debouncedSearch = useDebounce(search, 400);

  const [mentees, setMentees] = useState<MenteeListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMentees = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await menteeApi.getAll({
        ...(debouncedSearch.trim() && { search: debouncedSearch.trim() }),
        page: pagination.page,
        limit: pagination.limit,
      });

      const list: MenteeListItem[] = response?.data?.mentees ?? [];
      const meta = response?.pagination;

      setMentees(list);
      if (meta?.totalItems !== undefined) {
        pagination.setTotal(meta.totalItems);
      }
    } catch (err: unknown) {
      const msg = extractApiErrorMessage(err, 'Failed to load mentees');
      setError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.page, pagination.limit, debouncedSearch]);

  useEffect(() => {
    fetchMentees();
  }, [fetchMentees]);

  // Reset to page 1 on search change
  useEffect(() => {
    pagination.reset();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  return {
    mentees,
    isLoading,
    error,
    pagination,
    search,
    setSearch: setSearchInput,
    refetch: fetchMentees,
  };
}
