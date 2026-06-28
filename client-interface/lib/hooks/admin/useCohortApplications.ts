import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { cohortApi, applicationApi } from '@/lib/services/intake-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import type { Cohort } from './useCohorts';

export type ApplicationStatus =
  | 'pending' | 'assessment_sent' | 'under_review' | 'accepted' | 'rejected' | 'waitlisted' | 'withdrawn';

export interface Application {
  id: string;
  cohortId: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  programPreference?: string | null;
  source: string;
  status: ApplicationStatus;
  /** The level the applicant selected (null when the cohort has no levels). */
  level?: string | null;
  assignedAssessmentId?: string | null;
  assessmentScore?: number | null;
  reviewerNotes?: string | null;
  decidedAt?: string | null;
  inviteId?: string | null;
  responses?: Record<string, unknown>;
  reviewer?: { id: string; firstName: string; lastName: string } | null;
  user?: { id: string; firstName: string; lastName: string; email: string } | null;
  createdAt: string;
}

export interface ImportReport {
  created: number;
  updated: number;
  skipped: { email: string; reason: string }[];
  /** True when the cohort is now at/over its application cap. */
  capReached?: boolean;
}

export function useCohortApplications(cohortId: string) {
  const [cohort, setCohort] = useState<Cohort | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | 'all'>('all');

  const fetchCohort = useCallback(async () => {
    try {
      const res = await cohortApi.get(cohortId);
      setCohort(res?.data?.cohort ?? null);
    } catch {
      setCohort(null);
    }
  }, [cohortId]);

  const fetchApplications = useCallback(async () => {
    try {
      setLoading(true);
      const res = await applicationApi.list(cohortId, statusFilter === 'all' ? undefined : statusFilter);
      setApplications(res?.data?.applications ?? []);
    } catch {
      toast.error('Failed to load applications');
      setApplications([]);
    } finally {
      setLoading(false);
    }
  }, [cohortId, statusFilter]);

  useEffect(() => { fetchCohort(); }, [fetchCohort]);
  useEffect(() => { fetchApplications(); }, [fetchApplications]);

  const refetch = useCallback(async () => {
    await Promise.all([fetchCohort(), fetchApplications()]);
  }, [fetchCohort, fetchApplications]);

  const importRows = useCallback(async (rows: Record<string, string>[], allowExceed = false): Promise<ImportReport | null> => {
    try {
      const res = await applicationApi.import(cohortId, rows, allowExceed);
      const report: ImportReport = res?.data?.report;
      toast.success(`${report.created} added, ${report.updated} updated, ${report.skipped.length} skipped`);
      await refetch();
      return report;
    } catch (err) {
      toast.error(extractApiErrorMessage(err, 'Import failed'));
      return null;
    }
  }, [cohortId, refetch]);

  const updateApplication = useCallback(async (id: string, data: { status?: string; assessmentScore?: number; reviewerNotes?: string }) => {
    try {
      await applicationApi.update(id, data);
      await refetch();
    } catch (err) {
      toast.error(extractApiErrorMessage(err, 'Failed to update application'));
    }
  }, [refetch]);

  const acceptApplication = useCallback(async (id: string, clanId?: string) => {
    try {
      await applicationApi.accept(id, clanId);
      toast.success('Accepted - invite issued to the applicant');
      await refetch();
    } catch (err) {
      toast.error(extractApiErrorMessage(err, 'Failed to accept application'));
    }
  }, [refetch]);

  const rejectApplication = useCallback(async (id: string, reason?: string) => {
    try {
      await applicationApi.reject(id, reason);
      toast.success('Application rejected');
      await refetch();
    } catch (err) {
      toast.error(extractApiErrorMessage(err, 'Failed to reject application'));
    }
  }, [refetch]);

  return {
    cohort,
    applications,
    loading,
    statusFilter,
    setStatusFilter,
    refetch,
    importRows,
    updateApplication,
    acceptApplication,
    rejectApplication,
  };
}
