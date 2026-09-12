'use client';

import { useState, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import { certificatesApi } from '@/lib/services/certificates-api';
import { TierCriteria } from '../certificate-constants';
import { useApiQuery, useInvalidate } from '@/lib/query';
import { qk } from '@/lib/query/keys';
import { STALE } from '@/lib/query/client';

interface UseCertificateQualificationsOptions {
  templateId: string | null;
  selectedProgramId: string;
  criteria: TierCriteria[];
}

const EMPTY_OBJECT: Record<string, any[]> = {};

export function useCertificateQualifications({
  templateId,
  selectedProgramId,
  criteria,
}: UseCertificateQualificationsOptions) {
  const [issuing, setIssuing] = useState(false);
  const [sendingToMentors, setSendingToMentors] = useState(false);
  const [duplicateWarningModal, setDuplicateWarningModal] = useState<{
    isOpen: boolean;
    duplicates: Array<{ id: string; name: string; email: string; tier: string }>;
    allSelectedRecipients: Array<{ menteeId: string; tier: string }>;
  }>({
    isOpen: false,
    duplicates: [],
    allSelectedRecipients: [],
  });

  const invalidate = useInvalidate();

  const {
    data: qualRes,
    loading: loadingQualifications,
    refetch,
  } = useApiQuery({
    queryKey: qk.certificates.qualifications(templateId ?? '', selectedProgramId),
    queryFn: async () => certificatesApi.getQualification(templateId!, { programId: selectedProgramId }),
    enabled: !!templateId && !!selectedProgramId,
    errorMessage: 'Failed to calculate qualification counts',
    staleTime: STALE.medium,
  });

  const qualifiedData = useMemo<Record<string, any[]>>(() => {
    if (!qualRes?.success || !qualRes.data) return EMPTY_OBJECT;
    return qualRes.data;
  }, [qualRes]);

  const criteriaTasks = useMemo<Array<{ id: string; title: string }>>(() => {
    return qualRes?.criteriaTasks ?? [];
  }, [qualRes]);

  const executeIssuance = useCallback(
    async (recipientsList: Array<{ menteeId: string; tier: string }>) => {
      if (!templateId || !selectedProgramId) return;
      try {
        setIssuing(true);
        const res = await certificatesApi.issueCertificates({
          templateId,
          recipients: recipientsList,
        });
        if (res.success) {
          toast.success(`Successfully enqueued ${recipientsList.length} certificate(s) for rendering!`);
          await invalidate(qk.certificates.qualifications(templateId, selectedProgramId));
        }
      } catch (err: any) {
        toast.error(err.message || 'Failed to issue certificates');
      } finally {
        setIssuing(false);
      }
    },
    [templateId, selectedProgramId, invalidate]
  );

  const handleSendToMentors = useCallback(async () => {
    if (!templateId || !selectedProgramId) return;
    try {
      setSendingToMentors(true);
      const res = await certificatesApi.sendToMentors(templateId, selectedProgramId);
      if (res.success) {
        toast.success(res.message);
        await invalidate(qk.certificates.qualifications(templateId, selectedProgramId));
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to send to mentors');
    } finally {
      setSendingToMentors(false);
    }
  }, [templateId, selectedProgramId, invalidate]);

  return {
    qualifiedData,
    loadingQualifications,
    criteriaTasks,
    issuing,
    sendingToMentors,
    executeIssuance,
    handleSendToMentors,
    duplicateWarningModal,
    setDuplicateWarningModal,
    refetchQualifications: refetch,
  };
}
