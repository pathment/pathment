import { useCallback, useEffect, useState } from 'react';
import { clanApi } from '@/lib/services/clan-api';
import { usePagination } from '@/lib/hooks/shared/usePagination';
import { useDebounce } from '@/lib/hooks/shared/useDebounce';

export interface ClanMembershipRow {
  id: string;
  userId: string;
  role: 'lead_mentor' | 'co_mentor' | 'mentee' | 'core_team';
  status: string;
  user?: { id: string; firstName: string; lastName: string; email: string; role: string };
}

export interface Clan {
  id: string;
  name: string;
  description?: string;
  status: string;
  tags: string[];
  levelLabel?: string | null;
  maxMentees: number;
  programId: string;
  program?: { id: string; name: string };
  leadMentor?: { id: string; firstName: string; lastName: string } | null;
  memberships?: ClanMembershipRow[];
  /** Active-member counts from the paginated list endpoint. */
  menteeCount?: number;
  mentorCount?: number;
}

export interface UseAdminClansReturn {
  clans: Clan[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  pagination: ReturnType<typeof usePagination>;
  search: string;
  setSearch: (v: string) => void;
  programFilter: string;
  setProgramFilter: (v: string) => void;
}

/**
 * Server-side clan list for the admin page: search (name/program/lead-mentor/tag)
 * + program filter + pagination, all enforced (and capped) on the backend so the
 * full table is never shipped to the browser. Grows safely with the org.
 */
export function useAdminClans(): UseAdminClansReturn {
  const pagination = usePagination({ initialPage: 1, initialLimit: 12 });
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 400);
  const [programFilter, setProgramFilter] = useState('');

  const [clans, setClans] = useState<Clan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchClans = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await clanApi.list({
        page: pagination.page,
        limit: pagination.limit,
        ...(debouncedSearch.trim() && { search: debouncedSearch.trim() }),
        ...(programFilter && { programId: programFilter }),
      });
      setClans(res?.data?.clans ?? []);
      const total = res?.data?.total;
      if (typeof total === 'number') pagination.setTotal(total);
    } catch {
      setError('Failed to load clans');
      setClans([]);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.page, pagination.limit, debouncedSearch, programFilter]);

  useEffect(() => { fetchClans(); }, [fetchClans]);

  // Any filter change returns to page 1.
  useEffect(() => {
    pagination.reset();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, programFilter]);

  return { clans, loading, error, refetch: fetchClans, pagination, search, setSearch, programFilter, setProgramFilter };
}
