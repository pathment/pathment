import { useCallback, useEffect, useState } from 'react';
import { clanApi } from '@/lib/services/clan-api';

export type ClanStatus = 'red' | 'amber' | 'green';

export interface ClanHealthLead {
  id: string;
  name: string | null;
  avatar: string;
}

export interface ClanHealthCard {
  id: string;
  name: string;
  status: ClanStatus;
  statusLabel: string;
  statusReason: string;
  memberCount: number;
  mentorCount: number;
  avgCompletion: number;
  avgOnTime: number;
  atRisk: number;
  openBlockers: number;
  pendingApprovals: number;
  leadMentor: ClanHealthLead | null;
}

export interface ProgramHealth {
  id: string;
  name: string;
  status: string | null;
  clanCount: number;
  memberCount: number;
  atRisk: number;
  avgCompletion: number;
  clans: ClanHealthCard[];
}

export interface AtRiskMentee {
  id: string;
  name: string;
  avatar: string;
  avatarUrl?: string | null;
  program: string;
  risk: 'high' | 'watch' | 'low';
  riskReason: string;
  absoluteProgress: number;
  onTimeRate: number;
}

export interface ClanHealthKpis {
  activeMentees: number;
  avgCompletion: number;
  avgOnTime: number;
  atRisk: number;
  clans: number;
  programs: number;
}

export interface UseClanHealthReturn {
  kpis: ClanHealthKpis | null;
  programs: ProgramHealth[];
  atRiskMentees: AtRiskMentee[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useClanHealth(): UseClanHealthReturn {
  const [kpis, setKpis] = useState<ClanHealthKpis | null>(null);
  const [programs, setPrograms] = useState<ProgramHealth[]>([]);
  const [atRiskMentees, setAtRiskMentees] = useState<AtRiskMentee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await clanApi.health();
      const data = res?.data ?? {};
      setKpis(data.kpis ?? null);
      setPrograms(data.programs ?? []);
      setAtRiskMentees(data.atRiskMentees ?? []);
    } catch {
      setError('Failed to load clan health');
      setKpis(null);
      setPrograms([]);
      setAtRiskMentees([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  return { kpis, programs, atRiskMentees, loading, error, refetch: fetchHealth };
}
