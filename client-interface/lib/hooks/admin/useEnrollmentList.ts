import { useState, useEffect, useCallback } from 'react';
import { enrollmentApi } from '@/lib/services/enrollment-api';
import { usePagination } from '@/lib/hooks/shared/usePagination';
import { useDebounce } from '@/lib/hooks/shared/useDebounce';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { toast } from 'sonner';

export type EnrollmentStatus =
  | 'pending_approval'
  | 'approved'
  | 'pending_match'
  | 'matched'
  | 'active'
  | 'pending_completion'
  | 'level_completed'
  | 'program_completed'
  | 'rejected'
  | 'dropped';

export interface Enrollment {
  id: string;
  menteeId: string;
  programId: string;
  status: EnrollmentStatus;
  currentWeek: number;
  tasksCompleted: number;
  tasksTotal: number;
  overallProgressPercentage: string;
  enrolledAt: string;
  completionRequestedAt?: string;
  completionRequestedByRole?: string;
  completionRejectionReason?: string;
  mentee: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    profilePictureUrl?: string | null;
  };
  program: {
    id: string;
    name: string;
    type: string;
    status: string;
  };
  clan?: { id: string; name: string } | null;
  matches: Array<{
    id: string;
    status: string;
    mentor: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
      profilePictureUrl?: string | null;
    };
  }>;
}

export function useEnrollmentList() {
  const pagination = usePagination({ initialPage: 1, initialLimit: 10 });

  const [search, setSearchInput] = useState('');
  const [status, setStatus] = useState<EnrollmentStatus | 'all'>('all');

  const debouncedSearch = useDebounce(search, 400);

  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    pendingMatch: 0,
    pendingCompletion: 0,
    completed: 0,
    dropped: 0,
  });

  // Fetch overall stats once on mount (independent of pagination/filters)
  useEffect(() => {
    enrollmentApi.getStats()
      .then((res: any) => {
        const s = res?.data?.stats;
        if (s) setStats(s);
      })
      .catch(() => {/* non-critical, silently ignore */});
  }, []);

  const fetchEnrollments = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await enrollmentApi.getAll({
        page: pagination.page,
        limit: pagination.limit,
        ...(status !== 'all' && { status }),
        ...(debouncedSearch && { search: debouncedSearch }),
      });

      const list: Enrollment[] = response?.data?.enrollments ?? [];
      const meta = response?.data?.pagination;

      setEnrollments(list);
      if (meta?.total !== undefined) {
        pagination.setTotal(meta.total);
      }
    } catch (err: any) {
      const msg = extractApiErrorMessage(err, 'Failed to load enrollments');
      setError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.page, pagination.limit, debouncedSearch, status]);

  // Re-fetch when page / filters change
  useEffect(() => {
    fetchEnrollments();
  }, [fetchEnrollments]);

  // Reset to page 1 whenever a filter changes
  useEffect(() => {
    pagination.reset();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, status]);

  const hasActiveFilters = !!(debouncedSearch || status !== 'all');

  return {
    // Data
    enrollments,
    isLoading,
    error,
    isEmpty: !isLoading && !error && enrollments.length === 0,

    // Pagination
    pagination,

    // Filters
    search,
    status,
    hasActiveFilters,
    setSearch: setSearchInput,
    setStatus,
    resetFilters: () => {
      setSearchInput('');
      setStatus('all');
    },

    // Derived
    stats,

    // Actions
    refetch: fetchEnrollments,
  };
}
