'use client';

import { useCallback, useEffect, useState } from 'react';
import { governanceApi, type OrgGovernance } from '@/lib/services/governance-api';

const DEFAULT: OrgGovernance = { cohortReviewDeleteLocked: false };

export function useOrgGovernance() {
  const [governance, setGovernance] = useState<OrgGovernance>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchGovernance = useCallback(async () => {
    try {
      setLoading(true);
      const res = await governanceApi.get();
      setGovernance(res?.data?.governance ?? DEFAULT);
    } catch {
      setGovernance(DEFAULT);
    } finally {
      setLoading(false);
    }
  }, []);

  const save = useCallback(async (patch: Partial<OrgGovernance>) => {
    setSaving(true);
    try {
      const res = await governanceApi.update(patch);
      const next = res?.data?.governance ?? { ...governance, ...patch };
      setGovernance(next);
      return next;
    } finally {
      setSaving(false);
    }
  }, [governance]);

  useEffect(() => { fetchGovernance(); }, [fetchGovernance]);

  return { governance, loading, saving, refetch: fetchGovernance, save };
}
