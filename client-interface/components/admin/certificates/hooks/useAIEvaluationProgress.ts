'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import { certificatesApi, AIEvaluationResult } from '@/lib/services/certificates-api';
import { getSocket } from '@/lib/services/socket-client';
import { useApiQuery } from '@/lib/query';
import { useQueryClient } from '@tanstack/react-query';
import { qk } from '@/lib/query/keys';
import { STALE } from '@/lib/query/client';

export interface UseAIEvaluationProgressOptions {
  templateId?: string | null;
  onSingleProgress?: (result: any) => void;
  onBatchComplete?: (results: any[]) => void;
}

const EMPTY_ARRAY: AIEvaluationResult[] = [];

export function useAIEvaluationProgress(options: UseAIEvaluationProgressOptions = {}) {
  const { templateId, onSingleProgress, onBatchComplete } = options;

  const [aiEvaluationRunId, setAiEvaluationRunId] = useState<string | null>(null);
  const [aiRanAt, setAiRanAt] = useState<string | null>(null);
  const [runningAI, setRunningAI] = useState(false);
  const [aiProgressCount, setAiProgressCount] = useState(0);
  const [aiTotalCount, setAiTotalCount] = useState(0);

  const queryClient = useQueryClient();

  const { data: statusRes, refetch: refetchStatus } = useApiQuery({
    queryKey: qk.certificates.aiStatus(templateId ?? '', aiEvaluationRunId),
    queryFn: async () => certificatesApi.getAIEvaluationStatus(templateId!, aiEvaluationRunId ?? undefined),
    enabled: !!templateId,
    staleTime: STALE.short,
    refetchInterval: (data) => {
      if (!data) return false;
      return data.data?.isDone ? false : 4_000;
    },
  });

  const aiResults = useMemo<AIEvaluationResult[]>(() => {
    if (!statusRes?.data?.data) return EMPTY_ARRAY;
    return Array.isArray(statusRes.data.data) ? statusRes.data.data : EMPTY_ARRAY;
  }, [statusRes]);

  useEffect(() => {
    if (!statusRes?.success || !statusRes.data) return;

    const statusData = statusRes.data;
    const isDone = statusData.isDone ?? true;
    const activeRunId = statusData.runId;
    const completed = statusData.completed ?? 0;
    const total = statusData.total ?? 0;

    setAiProgressCount(completed);
    setAiTotalCount(total);

    if (!isDone && activeRunId) {
      setAiEvaluationRunId(activeRunId);
      setRunningAI(true);
    } else if (isDone && runningAI) {
      setAiRanAt(statusData.ranAt || new Date().toISOString());
      setRunningAI(false);
      setAiEvaluationRunId(null);
      const resultsList = Array.isArray(statusData.data) ? statusData.data : [];
      if (resultsList.length > 0) {
        if (onBatchComplete) onBatchComplete(resultsList);
        toast.success('AI evaluation completed successfully!');
      }
    }
  }, [statusRes, runningAI, onBatchComplete]);

  useEffect(() => {
    if (!aiEvaluationRunId || !templateId) return;

    const socket = getSocket();

    const handleProgress = (data: { runId: string; menteeId: string; result: any; completed: number; total: number }) => {
      if (data.runId !== aiEvaluationRunId) return;
      setAiProgressCount(data.completed);
      setAiTotalCount(data.total);

      if (onSingleProgress) {
        onSingleProgress(data.result);
      }

      queryClient.invalidateQueries({ queryKey: qk.certificates.aiStatus(templateId, aiEvaluationRunId) });
    };

    const handleComplete = (data: { runId: string; results: any[]; ranAt: string }) => {
      if (data.runId !== aiEvaluationRunId) return;
      setAiRanAt(data.ranAt);
      setRunningAI(false);
      setAiEvaluationRunId(null);

      if (onBatchComplete) {
        onBatchComplete(data.results || []);
      }

      toast.success(`AI evaluation completed successfully for ${(data.results || []).length} mentees!`);
      queryClient.invalidateQueries({ queryKey: qk.certificates.aiStatus(templateId) });
    };

    if (socket) {
      socket.on('ai-eval:progress', handleProgress);
      socket.on('ai-eval:complete', handleComplete);
    }

    return () => {
      if (socket) {
        socket.off('ai-eval:progress', handleProgress);
        socket.off('ai-eval:complete', handleComplete);
      }
    };
  }, [aiEvaluationRunId, templateId, onSingleProgress, onBatchComplete, queryClient]);

  const runAIEvaluation = useCallback(
    async (targetTemplateId?: string) => {
      const idToUse = targetTemplateId || templateId;
      if (!idToUse) return;

      try {
        setRunningAI(true);
        setAiProgressCount(0);
        setAiTotalCount(0);

        const res: any = await certificatesApi.runAIEvaluation(idToUse);
        const runId = res.runId || res.data?.runId;
        const total = res.total ?? res.data?.total ?? 0;

        if (res.success && runId) {
          setAiEvaluationRunId(runId);
          setAiTotalCount(total);
          toast.info(`AI evaluation started for ${total} mentees...`);
          queryClient.invalidateQueries({ queryKey: qk.certificates.aiStatus(idToUse, runId) });
        }
      } catch (err: any) {
        toast.error(err.message || 'AI evaluation failed. Check AI connection in Settings.');
        setRunningAI(false);
      }
    },
    [templateId, queryClient]
  );

  const aiEvalMap = useMemo(() => {
    const map: Record<string, AIEvaluationResult> = {};
    const safeResults = Array.isArray(aiResults) ? aiResults : EMPTY_ARRAY;
    safeResults.forEach((r) => {
      if (r && r.mentee_id) map[r.mentee_id] = r;
    });
    return map;
  }, [aiResults]);

  return {
    aiResults,
    aiRanAt,
    setAiRanAt,
    runningAI,
    setRunningAI,
    aiProgressCount,
    setAiProgressCount,
    aiTotalCount,
    setAiTotalCount,
    aiEvaluationRunId,
    setAiEvaluationRunId,
    aiEvalMap,
    runAIEvaluation,
    refetchStatus,
  };
}
