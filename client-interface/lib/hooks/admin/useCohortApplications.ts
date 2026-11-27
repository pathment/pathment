'use client';

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { qk, useApiQuery } from '@/lib/query';
import { cohortApi, applicationApi } from '@/lib/services/intake-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import type { Cohort } from './useCohorts';

export type ApplicationStatus =
  | 'pending' | 'assessment_sent' | 'under_review' | 'accepted' | 'rejected' | 'waitlisted' | 'withdrawn'
  /** Taken out of the intake by an admin (who and why are on the application). */
  | 'removed';

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
  /** Max points of the applicant's submission + AI's holistic score (list view). */
  maxScore?: number | null;
  aiOverall?: number | null;
  /** Where they are in the assessment pipeline (server-computed). */
  stage?: string;
  assessmentInvitedAt?: string | null;
  assessmentInviteCount?: number;
  /** Evidence-based placement: the level the rules landed on + the proof. */
  recommendedLevel?: string | null;
  /**
   * Where the level they hold came from, and whether a human has settled it.
   * The paper goes out on the review's answer so nobody is blocked; it is
   * confirmation that lets the level drive placement and level-based work.
   */
  levelSource?: 'self' | 'ai' | 'admin' | null;
  levelConfirmedAt?: string | null;
  /** An admin moved the level after the paper was already sat. */
  levelChangedAfterAssessment?: boolean;
  levelEvidence?: {
    /** True when NO criterion could be judged — the criteria don't match what
     *  this cohort actually asks, so the placement is a fallback not a finding. */
    evidenceThin?: boolean;
    judgedCount?: number;
    criteriaCount?: number;
    criteria: Record<string, { verdict: boolean | null; quote: string; note: string }>;
    reason: string;
    coherence?: string;
    selfSelected?: string | null;
    matchesSelfSelected?: boolean;
  } | null;
  reviewerNotes?: string | null;
  decisionReason?: string | null;
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

interface ApplicationsData { applications: Application[]; passThreshold: number | null }

const NO_APPLICATIONS: ApplicationsData = { applications: [], passThreshold: null };

export function useCohortApplications(cohortId: string) {
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | 'all'>('all');

  const cohortQuery = useApiQuery<Cohort | null>({
    queryKey: qk.admin.cohort(cohortId),
    queryFn: async () => (await cohortApi.get(cohortId))?.data?.cohort ?? null,
    enabled: !!cohortId,
  });

  const appsQuery = useApiQuery<ApplicationsData>({
    queryKey: qk.admin.applications(cohortId),
    queryFn: async () => {
      // Fetch the WHOLE cohort once; the page filters client-side so every tab
      // can show a real count and switching filters is instant (no round-trip).
      const res = await applicationApi.list(cohortId);
      return {
        applications: res?.data?.applications ?? [],
        passThreshold: res?.data?.passThreshold ?? null,
      };
    },
    enabled: !!cohortId,
    errorMessage: 'Failed to load applications',
  });

  const { applications, passThreshold } = appsQuery.data ?? NO_APPLICATIONS;
  const cohort = cohortQuery.data ?? null;
  const loading = appsQuery.loading;

  const refetch = useCallback(async () => {
    await Promise.all([cohortQuery.refetch(), appsQuery.refetch()]);
  }, [cohortQuery, appsQuery]);

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

  const updateApplication = useCallback(async (id: string, data: { status?: string; assessmentScore?: number; reviewerNotes?: string; decisionReason?: string }) => {
    try {
      await applicationApi.update(id, data);
      await refetch();
    } catch (err) {
      toast.error(extractApiErrorMessage(err, 'Failed to update application'));
    }
  }, [refetch]);

  const acceptApplication = useCallback(async (id: string, clanId?: string) => {
    try {
      // An applicant who already has a Pathment account is accepted like anyone
      // else; they are emailed "you're in, sign in and join" rather than an
      // invitation to create an account. Say which one went out.
      const res = await applicationApi.accept(id, clanId) as { data?: { existingAccount?: boolean } };
      toast.success(res?.data?.existingAccount
        ? 'Accepted - they already have an account, so they were emailed to sign in and join'
        : 'Accepted - invite issued to the applicant');
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
    passThreshold,
    refetch,
    importRows,
    updateApplication,
    acceptApplication,
    rejectApplication,
  };
}
