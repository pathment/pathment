'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { useAuth } from '@/lib/context/AuthContext';
import { qk, useApiQuery, useInvalidate } from '@/lib/query';
import { publicApi, type PublicClanJoinInfo } from '@/lib/services/public-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { workspacePath } from '@/lib/services/workspace-scope';

export interface UsePublicClanJoinPageReturn {
  info: PublicClanJoinInfo | null;
  loading: boolean;
  unavailable: boolean;
  submitting: boolean;
  submitted: boolean;
  message: string;
  setMessage: (value: string) => void;
  loginHref: string;
  registerHref: string;
  /** After approval: dashboard if logged in, otherwise login then dashboard. */
  continueHref: string;
  submitRequest: () => Promise<void>;
}

/** Public `/clan/join/:token` page: load preview + submit join request. */
export function usePublicClanJoinPage(token: string): UsePublicClanJoinPageReturn {
  const { user, isLoading: authLoading } = useAuth();
  const invalidate = useInvalidate();
  const [submitting, setSubmitting] = useState(false);
  const [submittedLocal, setSubmittedLocal] = useState(false);
  const [message, setMessage] = useState('');

  const joinPath = `/clan/join/${encodeURIComponent(token)}`;
  const loginHref = workspacePath(`/login?next=${encodeURIComponent(joinPath)}`);
  const registerHref = workspacePath(`/register?clanJoin=${encodeURIComponent(token)}`);
  const continueHref = user
    ? workspacePath('/mentee/dashboard')
    : workspacePath(`/login?next=${encodeURIComponent('/mentee/dashboard')}`);

  const viewer = user?.id ?? 'anon';
  const { data: info = null, loading, error } = useApiQuery<PublicClanJoinInfo | null>({
    queryKey: qk.public.clanJoin(token, viewer),
    queryFn: () => publicApi.getClanJoin(token),
    enabled: !!token && !authLoading,
    errorMessage: 'Clan joining page is unavailable',
  });

  useEffect(() => {
    setSubmittedLocal(false);
    setMessage('');
  }, [token]);

  const submitRequest = useCallback(async () => {
    if (!token) return;
    setSubmitting(true);
    try {
      const trimmed = message.trim();
      await publicApi.submitClanJoinRequest(token, trimmed || undefined);
      setSubmittedLocal(true);
      setMessage('');
      toast.success('Your join request was sent to the Clan Lead Mentor.');
      await invalidate(qk.public.clanJoin(token, viewer));
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not submit join request'));
    } finally {
      setSubmitting(false);
    }
  }, [token, message, invalidate, viewer]);

  return {
    info,
    loading: loading || authLoading,
    unavailable: !!error,
    submitting,
    submitted: submittedLocal || info?.viewerStatus === 'pending',
    message,
    setMessage,
    loginHref,
    registerHref,
    continueHref,
    submitRequest,
  };
}
