'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import { certificatesApi, CertificateElement } from '@/lib/services/certificates-api';
import { getSocket } from '@/lib/services/socket-client';
import { BACKGROUND_PRESETS, BACKGROUND_PRESETS_MAP, TierCriteria } from '../certificate-constants';

// ==================== 1. USE AI EVALUATION PROGRESS ====================

export interface UseAIEvaluationProgressOptions {
  templateId?: string | null;
  onSingleProgress?: (result: any) => void;
  onBatchComplete?: (results: any[]) => void;
}

export function useAIEvaluationProgress(options: UseAIEvaluationProgressOptions = {}) {
  const { templateId, onSingleProgress, onBatchComplete } = options;

  const [aiResults, setAiResults] = useState<any[]>([]);
  const [aiRanAt, setAiRanAt] = useState<string | null>(null);
  const [runningAI, setRunningAI] = useState(false);
  const [aiProgressCount, setAiProgressCount] = useState(0);
  const [aiTotalCount, setAiTotalCount] = useState(0);
  const [aiEvaluationRunId, setAiEvaluationRunId] = useState<string | null>(null);

  useEffect(() => {
    if (!aiEvaluationRunId || !templateId) return;

    const socket = getSocket();
    let pollInterval: NodeJS.Timeout | null = null;

    const handleProgress = (data: { runId: string; menteeId: string; result: any; completed: number; total: number }) => {
      if (data.runId !== aiEvaluationRunId) return;
      setAiProgressCount(data.completed);
      setAiTotalCount(data.total);

      setAiResults(prev => {
        const index = prev.findIndex(r => r.mentee_id === data.result.mentee_id);
        if (index > -1) {
          const updated = [...prev];
          updated[index] = data.result;
          return updated;
        } else {
          return [...prev, data.result];
        }
      });

      if (onSingleProgress) {
        onSingleProgress(data.result);
      }
    };

    const handleComplete = (data: { runId: string; results: any[]; ranAt: string }) => {
      if (data.runId !== aiEvaluationRunId) return;
      setAiResults(data.results || []);
      setAiRanAt(data.ranAt);
      setRunningAI(false);
      setAiEvaluationRunId(null);

      if (onBatchComplete) {
        onBatchComplete(data.results || []);
      }

      toast.success(`AI evaluation completed successfully for ${(data.results || []).length} mentees!`);
    };

    if (socket) {
      socket.on('ai-eval:progress', handleProgress);
      socket.on('ai-eval:complete', handleComplete);
    }

    pollInterval = setInterval(async () => {
      try {
        const res: any = await certificatesApi.getAIEvaluationStatus(templateId, aiEvaluationRunId);
        if (res.success) {
          const payload = res.data?.data ? res.data : res;
          const completed = payload.completed ?? res.completed ?? 0;
          const total = payload.total ?? res.total ?? 0;
          const isDone = payload.isDone ?? res.isDone ?? false;
          const resultsList = payload.data ?? res.data ?? [];

          setAiProgressCount(completed);
          setAiTotalCount(total);

          if (Array.isArray(resultsList) && resultsList.length > 0) {
            setAiResults(resultsList);
            if (onBatchComplete) {
              onBatchComplete(resultsList);
            }
          }

          if (isDone) {
            setAiRanAt(payload.ranAt || res.ranAt || new Date().toISOString());
            setRunningAI(false);
            setAiEvaluationRunId(null);
            if (pollInterval) clearInterval(pollInterval);
            toast.success(`AI evaluation completed successfully!`);
          }
        }
      } catch (err) {
        console.error('AI status poll error:', err);
      }
    }, 4000);

    return () => {
      if (socket) {
        socket.off('ai-eval:progress', handleProgress);
        socket.off('ai-eval:complete', handleComplete);
      }
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [aiEvaluationRunId, templateId, onSingleProgress, onBatchComplete]);

  const runAIEvaluation = useCallback(async (targetTemplateId?: string) => {
    const idToUse = targetTemplateId || templateId;
    if (!idToUse) return;

    try {
      setRunningAI(true);
      setAiProgressCount(0);
      setAiTotalCount(0);
      setAiResults([]);

      const res: any = await certificatesApi.runAIEvaluation(idToUse);
      const runId = res.runId || res.data?.runId;
      const total = res.total ?? res.data?.total ?? 0;

      if (res.success && runId) {
        setAiEvaluationRunId(runId);
        setAiTotalCount(total);
        toast.info(`AI evaluation started for ${total} mentees...`);
      }
    } catch (err: any) {
      toast.error(err.message || 'AI evaluation failed. Check AI connection in Settings.');
      setRunningAI(false);
    }
  }, [templateId]);

  useEffect(() => {
    if (!templateId) return;

    let isMounted = true;
    async function checkInitialStatus() {
      try {
        const statusRes: any = await certificatesApi.getAIEvaluationStatus(templateId!);
        if (statusRes.success && isMounted) {
          const payload = statusRes.data?.data ? statusRes.data : statusRes;
          const activeRunId = payload.runId || statusRes.runId;
          const isDone = payload.isDone ?? statusRes.isDone ?? true;
          const completed = payload.completed ?? statusRes.completed ?? 0;
          const total = payload.total ?? statusRes.total ?? 0;

          if (!isDone && activeRunId) {
            setAiEvaluationRunId(activeRunId);
            setRunningAI(true);
            setAiProgressCount(completed);
            setAiTotalCount(total);
          }
        }
      } catch (e) {
      }
    }

    checkInitialStatus();
    return () => { isMounted = false; };
  }, [templateId]);

  const aiEvalMap = useMemo(() => {
    const map: Record<string, any> = {};
    (aiResults || []).forEach(r => {
      if (r.mentee_id) map[r.mentee_id] = r;
    });
    return map;
  }, [aiResults]);

  return {
    aiResults,
    setAiResults,
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
  };
}

// ==================== 2. USE CERTIFICATE CANVAS ====================

interface UseCertificateCanvasOptions {
  elements: CertificateElement[];
  setElements: React.Dispatch<React.SetStateAction<CertificateElement[]>>;
}

export function useCertificateCanvas({ elements, setElements }: UseCertificateCanvasOptions) {
  const [name, setName] = useState('');
  const [selectedProgramId, setSelectedProgramId] = useState('');
  const [bgImageUrl, setBgImageUrl] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [logoConfig, setLogoConfig] = useState<any>(undefined);
  const [activePresetId, setActivePresetId] = useState<string>('preset-classic-navy');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!bgImageUrl) {
      const defaultPreset = BACKGROUND_PRESETS[0];
      if (defaultPreset) {
        setBgImageUrl(defaultPreset.imageUrl);
        setActivePresetId(defaultPreset.id);
      }
    }
  }, [bgImageUrl]);

  const selectedElement = elements.find(el => el.id === selectedId) || null;

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!activeDragId || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    let xPercent = Math.round((x / rect.width) * 100);
    let yPercent = Math.round((y / rect.height) * 100);

    xPercent = Math.max(0, Math.min(100, xPercent));
    yPercent = Math.max(0, Math.min(100, yPercent));

    setElements(prev => prev.map(el =>
      el.id === activeDragId ? { ...el, xPercent, yPercent } : el
    ));
  };

  const handleMouseUp = () => {
    setActiveDragId(null);
  };

  const applyPresetBackground = (presetId: string) => {
    const preset = BACKGROUND_PRESETS_MAP[presetId];
    if (!preset) return;

    try {
      setBgImageUrl(preset.imageUrl);
      setActivePresetId(presetId);
      toast.success(`Applied ${preset.name} background preset!`);
    } catch (err) {
      toast.error('Failed to apply preset background');
    }
  };

  const addVariableElement = (key: string, label: string) => {
    if (elements.some(el => el.dynamicKey === key)) {
      const match = elements.find(el => el.dynamicKey === key);
      if (match) setSelectedId(match.id);
      toast.info(`${label} variable is already added to workspace`);
      return;
    }

    const id = `text-${Date.now()}`;
    const newEl: CertificateElement = {
      id,
      type: 'dynamic',
      dynamicKey: key as any,
      text: `{{${key}}}`,
      xPercent: 50,
      yPercent: 40 + elements.length * 5,
      fontSizePercent: 3.0,
      color: '#1e293b',
      fontWeight: 'bold',
      alignment: 'center',
      fontStyle: 'Montserrat, sans-serif'
    };

    setElements(prev => [...prev, newEl]);
    setSelectedId(id);
    toast.success(`Added ${label} variable to template canvas!`);
  };

  const addStaticTextElement = () => {
    const id = `text-${Date.now()}`;
    const newEl: CertificateElement = {
      id,
      type: 'static',
      text: 'Double click to edit text',
      xPercent: 50,
      yPercent: 50,
      fontSizePercent: 2.5,
      color: '#1e293b',
      fontWeight: 'normal',
      alignment: 'center',
      fontStyle: 'Montserrat, sans-serif'
    };
    setElements(prev => [...prev, newEl]);
    setSelectedId(id);
  };

  const addBadgeElement = () => {
    if (elements.some(el => el.type === 'badge')) {
      toast.warning('A dynamic badge element is already added to canvas layout.');
      return;
    }
    const id = `badge-${Date.now()}`;
    const newEl: CertificateElement = {
      id,
      type: 'badge',
      text: 'Badge Layer',
      xPercent: 50,
      yPercent: 75,
      widthPercent: 12,
      fontSizePercent: 1,
      color: '#000000',
      fontWeight: 'normal',
      alignment: 'center',
      fontStyle: 'Montserrat, sans-serif'
    };
    setElements(prev => [...prev, newEl]);
    setSelectedId(id);
  };

  const addPathmentLogoElement = () => {
    const id = `img-pathment-${Date.now()}`;
    const origin = (process.env.CLIENT_URL || 'http://localhost:3000').split(',')[0].replace(/\/$/, '');
    const newEl: CertificateElement = {
      id,
      type: 'image',
      text: 'Pathment Logo',
      xPercent: 50,
      yPercent: 30,
      widthPercent: 12,
      imageUrl: `${origin}/icon-192.png`,
      fontSizePercent: 1,
      color: '#000000',
      fontWeight: 'normal',
      alignment: 'center'
    };
    setElements(prev => [...prev, newEl]);
    setSelectedId(id);
    toast.success('Pathment Logo added to canvas!');
  };

  const deleteElement = (id: string) => {
    setElements(prev => prev.filter(el => el.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const updateSelectedElement = (key: keyof CertificateElement, val: any) => {
    if (!selectedId) return;
    setElements(prev => prev.map(el =>
      el.id === selectedId ? { ...el, [key]: val } : el
    ));
  };

  return {
    name, setName,
    selectedProgramId, setSelectedProgramId,
    bgImageUrl, setBgImageUrl,
    logoUrl, setLogoUrl,
    logoConfig, setLogoConfig,
    activePresetId, setActivePresetId,
    selectedId, setSelectedId,
    selectedElement,
    activeDragId, setActiveDragId,
    uploadingLogo, setUploadingLogo,
    canvasRef,
    handleMouseMove, handleMouseUp,
    applyPresetBackground,
    addVariableElement,
    addStaticTextElement,
    addBadgeElement,
    addPathmentLogoElement,
    deleteElement,
    updateSelectedElement
  };
}

// ==================== 3. USE CERTIFICATE QUALIFICATIONS ====================

interface UseCertificateQualificationsOptions {
  templateId: string | null;
  selectedProgramId: string;
  criteria: TierCriteria[];
  refreshKey: number;
  setRefreshKey: React.Dispatch<React.SetStateAction<number>>;
}

export function useCertificateQualifications({
  templateId,
  selectedProgramId,
  criteria,
  refreshKey,
  setRefreshKey
}: UseCertificateQualificationsOptions) {
  const [qualifiedData, setQualifiedData] = useState<Record<string, any[]>>({});
  const [loadingQualifications, setLoadingQualifications] = useState(false);
  const [criteriaTasks, setCriteriaTasks] = useState<Array<{ id: string; title: string }>>([]);
  const [selectedMenteeIds, setSelectedMenteeIds] = useState<Set<string>>(new Set());
  const [adminTiers, setAdminTiers] = useState<Record<string, string>>({});
  const [issuing, setIssuing] = useState(false);
  const [sendingToMentors, setSendingToMentors] = useState(false);

  const [duplicateWarningModal, setDuplicateWarningModal] = useState<{
    isOpen: boolean;
    duplicates: Array<{ id: string; name: string; email: string; tier: string }>;
    allSelectedRecipients: Array<{ menteeId: string; tier: string }>;
  }>({
    isOpen: false,
    duplicates: [],
    allSelectedRecipients: []
  });

  useEffect(() => {
    if (!templateId || !selectedProgramId) return;

    const fetchQualifications = async () => {
      try {
        setLoadingQualifications(true);
        const res = await certificatesApi.getQualification(templateId, { programId: selectedProgramId });
        if (res.success && res.data) {
          setQualifiedData(res.data);
          if (res.criteriaTasks) {
            setCriteriaTasks(res.criteriaTasks);
          } else {
            setCriteriaTasks([]);
          }

          const activeList: any[] = [];
          const seenIds = new Set<string>();

          criteria.forEach(c => {
            const list = res.data[c.id] || [];
            list.forEach((m: any) => {
              if (!seenIds.has(m.id)) {
                seenIds.add(m.id);
                activeList.push(m);
              }
            });
          });

          Object.keys(res.data).forEach(key => {
            if (key === 'mentors' || key === 'paused') return;
            const list = res.data[key] || [];
            list.forEach((m: any) => {
              if (!seenIds.has(m.id)) {
                seenIds.add(m.id);
                activeList.push(m);
              }
            });
          });

          const mentorsList = res.data.mentors ?? [];

          const initialTiers: Record<string, string> = {};
          const autoSelected = new Set<string>();

          activeList.forEach(m => {
            const defTier = m.assignedTier || '';
            initialTiers[m.id] = defTier;

            const matchPercent = m.tierMatches?.[defTier] ?? 0;
            if (defTier && matchPercent >= 75) {
              autoSelected.add(m.id);
            }
          });

          const mentorDefaultTier = criteria[criteria.length - 1]?.id || 'participation';
          mentorsList.forEach(m => {
            initialTiers[m.id] = mentorDefaultTier;
            autoSelected.add(m.id);
          });

          setAdminTiers(initialTiers);
          setSelectedMenteeIds(autoSelected);
        }
      } catch (err) {
        console.error('Failed to calculate qualification counts:', err);
      } finally {
        setLoadingQualifications(false);
      }
    };

    fetchQualifications();
  }, [templateId, selectedProgramId, refreshKey]);

  const executeIssuance = async (recipientsList: Array<{ menteeId: string; tier: string }>) => {
    try {
      setIssuing(true);
      const res = await certificatesApi.issueCertificates({
        templateId: templateId!,
        recipients: recipientsList
      });
      if (res.success) {
        toast.success(`Successfully enqueued ${recipientsList.length} certificate(s) for rendering!`);
        setSelectedMenteeIds(new Set());
        setRefreshKey(prev => prev + 1);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to issue certificates');
    } finally {
      setIssuing(false);
    }
  };

  const handleIssue = async () => {
    if (selectedMenteeIds.size === 0) {
      toast.error('Please select at least one mentee to issue certificates');
      return;
    }

    const defaultTier = criteria[criteria.length - 1]?.id ?? 'participation';
    const recipients = Array.from(selectedMenteeIds).map(id => ({
      menteeId: id,
      tier: adminTiers[id] ?? defaultTier
    }));

    const allMentees: any[] = [];
    const seenIds = new Set<string>();
    Object.keys(qualifiedData).forEach(key => {
      if (key === 'mentors' || key === 'paused') return;
      (qualifiedData[key] ?? []).forEach((m: any) => {
        if (!seenIds.has(m.id)) { seenIds.add(m.id); allMentees.push(m); }
      });
    });
    const allMentors: any[] = qualifiedData.mentors ?? [];
    const allActiveRecipients = [...allMentees, ...allMentors];

    const duplicates: Array<{ id: string; name: string; email: string; tier: string }> = [];
    recipients.forEach(r => {
      const menteeObj = allActiveRecipients.find(m => m.id === r.menteeId);
      if (menteeObj && Array.isArray(menteeObj.issuedTiers) && menteeObj.issuedTiers.includes(r.tier)) {
        duplicates.push({
          id: menteeObj.id,
          name: `${menteeObj.firstName ?? ''} ${menteeObj.lastName ?? ''}`.trim() || menteeObj.email,
          email: menteeObj.email,
          tier: r.tier
        });
      }
    });

    if (duplicates.length > 0) {
      setDuplicateWarningModal({
        isOpen: true,
        duplicates,
        allSelectedRecipients: recipients
      });
    } else {
      await executeIssuance(recipients);
    }
  };

  const handleSendToMentors = async () => {
    if (!templateId || !selectedProgramId) return;
    try {
      setSendingToMentors(true);
      const res = await certificatesApi.sendToMentors(templateId, selectedProgramId);
      if (res.success) toast.success(res.message);
    } catch (err: any) {
      toast.error(err.message || 'Failed to send to mentors');
    } finally {
      setSendingToMentors(false);
    }
  };

  return {
    qualifiedData,
    setQualifiedData,
    loadingQualifications,
    criteriaTasks,
    selectedMenteeIds,
    setSelectedMenteeIds,
    adminTiers,
    setAdminTiers,
    issuing,
    sendingToMentors,
    handleIssue,
    executeIssuance,
    handleSendToMentors,
    duplicateWarningModal,
    setDuplicateWarningModal
  };
}

// ==================== 4. USE RECIPIENT SELECTION ====================

export interface UseRecipientSelectionOptions {
  criteria: TierCriteria[];
  qualifiedData: Record<string, any[]>;
  aiResults?: Record<string, any>;
}

export function useRecipientSelection({ criteria, qualifiedData, aiResults }: UseRecipientSelectionOptions) {
  const [recipientSearch, setRecipientSearch] = useState('');
  const [badgeFilter, setBadgeFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'none' | 'score_desc' | 'score_asc'>('none');
  const [recipientType, setRecipientType] = useState<'all' | 'mentees' | 'mentors' | 'paused'>('all');
  const [selectedMenteeIds, setSelectedMenteeIds] = useState<Set<string>>(new Set());
  const [assignedTiers, setAssignedTiers] = useState<Record<string, string>>({});

  const recipientMenteesList = useMemo(() => {
    const seen = new Set<string>();
    const list: any[] = [];
    criteria.forEach(c => {
      (qualifiedData[c.id] ?? []).forEach((m: any) => {
        if (!seen.has(m.id)) { seen.add(m.id); list.push({ ...m, role: 'mentee', isPaused: false }); }
      });
    });
    Object.keys(qualifiedData).forEach(key => {
      if (key === 'mentors' || key === 'paused') return;
      (qualifiedData[key] ?? []).forEach((m: any) => {
        if (!seen.has(m.id)) { seen.add(m.id); list.push({ ...m, role: 'mentee', isPaused: false }); }
      });
    });
    return list;
  }, [criteria, qualifiedData]);

  const recipientPausedList = useMemo(() => {
    return (qualifiedData.paused ?? []).map((m: any) => ({ ...m, role: 'mentee', isPaused: true }));
  }, [qualifiedData]);

  const recipientMentorsList = useMemo(
    () => (qualifiedData.mentors ?? []).map((m: any) => ({ ...m, role: 'mentor', isPaused: false })),
    [qualifiedData]
  );

  const activeList = useMemo(() => {
    if (recipientType === 'all') return [...recipientMenteesList, ...recipientMentorsList];
    if (recipientType === 'mentees') return recipientMenteesList;
    if (recipientType === 'mentors') return recipientMentorsList;
    return recipientPausedList;
  }, [recipientType, recipientMenteesList, recipientMentorsList, recipientPausedList]);

  const getEffectiveTier = useCallback((mOrId: any): string => {
    const defaultTier = criteria[criteria.length - 1]?.id ?? 'participation';
    const id = typeof mOrId === 'string' ? mOrId : mOrId?.id;
    if (!id) return defaultTier;

    if (assignedTiers[id]) return assignedTiers[id];
    if (aiResults?.[id]?.certificate_tier) return aiResults[id].certificate_tier;

    const m = typeof mOrId === 'object' ? mOrId : activeList.find((x: any) => x.id === id);
    if (m?.assignedTier) return m.assignedTier;

    return defaultTier;
  }, [assignedTiers, aiResults, activeList, criteria]);

  const filtered = useMemo(() => {
    let result = [...activeList];

    const q = recipientSearch.toLowerCase().trim();
    if (q) {
      result = result.filter((m: any) =>
        `${m.firstName || ''} ${m.lastName || ''} ${m.email || ''}`.toLowerCase().includes(q)
      );
    }

    if (badgeFilter !== 'all') {
      result = result.filter((m: any) => {
        const tier = getEffectiveTier(m);
        return tier === badgeFilter;
      });
    }

    const getScore = (m: any): number => {
      const aiRes = aiResults?.[m.id];
      if (aiRes) {
        if (aiRes.overall_percentage != null) return Number(aiRes.overall_percentage);
        if (aiRes.match_score != null) return Number(aiRes.match_score);
      }
      if (m.overall_percentage != null) return Number(m.overall_percentage);
      if (m.normalized_score != null) return Number(m.normalized_score);
      if (m.normalizedScore != null) return Number(m.normalizedScore);
      if (m.match_score != null) return Number(m.match_score);
      if (m.score != null) return Number(m.score);
      return 0;
    };

    if (sortBy === 'score_desc') {
      result.sort((a: any, b: any) => getScore(b) - getScore(a));
    } else if (sortBy === 'score_asc') {
      result.sort((a: any, b: any) => getScore(a) - getScore(b));
    }

    return result;
  }, [activeList, recipientSearch, badgeFilter, sortBy, getEffectiveTier, aiResults]);

  const allFilteredIds = useMemo(() => filtered.map((m: any) => m.id), [filtered]);

  const allSelected = useMemo(
    () => allFilteredIds.length > 0 && allFilteredIds.every(id => selectedMenteeIds.has(id)),
    [allFilteredIds, selectedMenteeIds]
  );

  const selectedSummary = useMemo(() => {
    const summary: Record<string, number> = {};
    criteria.forEach(c => { summary[c.id] = 0; });
    selectedMenteeIds.forEach(id => {
      const tier = getEffectiveTier(id);
      if (summary[tier] !== undefined) {
        summary[tier] = (summary[tier] ?? 0) + 1;
      } else {
        summary[tier] = 1;
      }
    });
    return summary;
  }, [criteria, selectedMenteeIds, getEffectiveTier]);

  const toggleAll = useCallback(() => {
    setSelectedMenteeIds(prev => {
      const next = new Set(prev);
      const selectableIds = filtered.filter((m: any) => !m.isPaused).map((m: any) => m.id);
      const allSelectableSelected = selectableIds.length > 0 && selectableIds.every(id => next.has(id));
      if (allSelectableSelected) {
        selectableIds.forEach(id => next.delete(id));
      } else {
        selectableIds.forEach(id => next.add(id));
      }
      return next;
    });
  }, [filtered]);

  const toggleOne = useCallback((id: string) => {
    setSelectedMenteeIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleTierChange = useCallback((menteeId: string, value: string) => {
    setAssignedTiers(prev => ({ ...prev, [menteeId]: value }));
  }, []);

  const bulkSetBadge = useCallback((badge: string, getTierNameFn?: (b: string) => string) => {
    const updatedTiers = { ...assignedTiers };
    const nextSelected = new Set(selectedMenteeIds);
    filtered.forEach((m: any) => {
      updatedTiers[m.id] = badge;
      if (m.isPaused) {
        nextSelected.delete(m.id);
        return;
      }
      const match = m.tierMatches?.[badge] ?? 0;
      if (match >= 90) nextSelected.add(m.id);
      else nextSelected.delete(m.id);
    });
    setAssignedTiers(updatedTiers);
    setSelectedMenteeIds(nextSelected);
    const tierName = getTierNameFn ? getTierNameFn(badge) : badge;
    toast.info(`Set all filtered recipients to ${tierName}`);
  }, [assignedTiers, selectedMenteeIds, filtered]);

  const resetToAIRecommendations = useCallback((aiResults: any[]) => {
    if (!aiResults || aiResults.length === 0) return;
    const updatedTiers = { ...assignedTiers };
    const nextSelected = new Set(selectedMenteeIds);
    const aiMap: Record<string, string> = {};

    aiResults.forEach(r => {
      if (r.mentee_id && r.certificate_tier) {
        aiMap[r.mentee_id] = r.certificate_tier;
      }
    });

    filtered.forEach((m: any) => {
      if (m.isPaused) {
        nextSelected.delete(m.id);
        return;
      }
      const aiTier = aiMap[m.id];
      if (aiTier) {
        updatedTiers[m.id] = aiTier;
        const match = m.tierMatches?.[aiTier] ?? 0;
        if (match >= 90) nextSelected.add(m.id);
        else nextSelected.delete(m.id);
      }
    });

    setAssignedTiers(updatedTiers);
    setSelectedMenteeIds(nextSelected);
    toast.success('Reset all filtered recipients to AI recommendations.');
  }, [assignedTiers, selectedMenteeIds, filtered]);

  return {
    recipientSearch,
    setRecipientSearch,
    badgeFilter,
    setBadgeFilter,
    sortBy,
    setSortBy,
    recipientType,
    setRecipientType,
    selectedMenteeIds,
    setSelectedMenteeIds,
    assignedTiers,
    setAssignedTiers,
    recipientMenteesList,
    recipientMentorsList,
    recipientPausedList,
    activeList,
    filtered,
    allFilteredIds,
    allSelected,
    selectedSummary,
    getEffectiveTier,
    toggleAll,
    toggleOne,
    handleTierChange,
    bulkSetBadge,
    resetToAIRecommendations,
  };
}

// ==================== 5. USE TIER MODAL ====================

interface UseTierModalOptions {
  criteria: TierCriteria[];
  setCriteria: React.Dispatch<React.SetStateAction<TierCriteria[]>>;
}

export function useTierModal({ criteria, setCriteria }: UseTierModalOptions) {
  const [isTierModalOpen, setIsTierModalOpen] = useState(false);
  const [editingTier, setEditingTier] = useState<TierCriteria | null>(null);

  const [tierModalName, setTierModalName] = useState('');
  const [tierModalBadgeUrl, setTierModalBadgeUrl] = useState('');
  const [tierModalKeywords, setTierModalKeywords] = useState<string[]>([]);
  const [tierModalKeywordInput, setTierModalKeywordInput] = useState('');
  const [tierModalMinScore, setTierModalMinScore] = useState(75);
  const [tierModalMaxBlockers, setTierModalMaxBlockers] = useState(0);
  const [tierModalMinCompletion, setTierModalMinCompletion] = useState(80);
  const [tierModalMinOnTime, setTierModalMinOnTime] = useState(80);
  const [tierModalMinRating, setTierModalMinRating] = useState(4.0);
  const [tierModalMinAttendance, setTierModalMinAttendance] = useState(70);
  const [tierModalCustomRule, setTierModalCustomRule] = useState('');
  const [uploadingTierBadge, setUploadingTierBadge] = useState(false);

  const [enableKeywords, setEnableKeywords] = useState(true);
  const [enableMinScore, setEnableMinScore] = useState(true);
  const [enableMaxBlockers, setEnableMaxBlockers] = useState(true);
  const [enableMinCompletion, setEnableMinCompletion] = useState(true);
  const [enableMinOnTime, setEnableMinOnTime] = useState(true);
  const [enableMinRating, setEnableMinRating] = useState(true);
  const [enableMinAttendance, setEnableMinAttendance] = useState(false);
  const [enableCustomRule, setEnableCustomRule] = useState(true);

  const openTierModal = (tier?: TierCriteria) => {
    if (tier) {
      setEditingTier(tier);
      setTierModalName(tier.name);
      setTierModalBadgeUrl(tier.badgeUrl || '');

      setEnableKeywords(Array.isArray(tier.keywords) && tier.keywords.length > 0);
      setEnableMinScore(tier.minScorePercent != null);
      setEnableMaxBlockers(tier.maxOpenBlockers != null);
      setEnableMinCompletion(tier.minCompletionRate != null);
      setEnableMinOnTime(tier.minOnTimeRate != null);
      setEnableMinRating(tier.minAvgRating != null);
      setEnableMinAttendance(tier.minAttendanceRate != null);
      setEnableCustomRule(Boolean(tier.customRule && tier.customRule.trim()));

      setTierModalKeywords(tier.keywords || []);
      setTierModalMinScore(tier.minScorePercent ?? 75);
      setTierModalMaxBlockers(tier.maxOpenBlockers ?? 0);
      setTierModalMinCompletion(tier.minCompletionRate ?? 80);
      setTierModalMinOnTime(tier.minOnTimeRate ?? 80);
      setTierModalMinRating(tier.minAvgRating ?? 4.0);
      setTierModalMinAttendance(tier.minAttendanceRate ?? 70);
      setTierModalCustomRule(tier.customRule ?? '');
    } else {
      setEditingTier(null);
      setTierModalName('');
      setTierModalBadgeUrl('');

      setEnableKeywords(true);
      setEnableMinScore(true);
      setEnableMaxBlockers(true);
      setEnableMinCompletion(true);
      setEnableMinOnTime(true);
      setEnableMinRating(true);
      setEnableMinAttendance(false);
      setEnableCustomRule(true);

      setTierModalKeywords([]);
      setTierModalMinScore(75);
      setTierModalMaxBlockers(0);
      setTierModalMinCompletion(80);
      setTierModalMinOnTime(80);
      setTierModalMinRating(4.0);
      setTierModalMinAttendance(70);
      setTierModalCustomRule('');
    }
    setTierModalKeywordInput('');
    setIsTierModalOpen(true);
  };

  const handleTierBadgeUpload = async (files: File[]) => {
    if (files.length === 0) return;
    try {
      setUploadingTierBadge(true);
      const res = await certificatesApi.uploadAsset(files[0]);
      if (res.success && res.url) {
        setTierModalBadgeUrl(res.url);
        toast.success('Badge icon uploaded successfully!');
      }
    } catch (err) {
      toast.error('Failed to upload badge icon');
    } finally {
      setUploadingTierBadge(false);
    }
  };

  const saveTierModal = () => {
    if (!tierModalName.trim()) {
      toast.error('Tier name is required');
      return;
    }

    const kws = [...tierModalKeywords];
    const pending = tierModalKeywordInput.trim();
    if (pending && !kws.includes(pending)) kws.push(pending);

    const newFields = {
      name:              tierModalName.trim(),
      badgeUrl:          tierModalBadgeUrl,
      keywords:          enableKeywords ? kws : null,
      minScorePercent:   enableMinScore ? tierModalMinScore : null,
      maxOpenBlockers:   enableMaxBlockers ? tierModalMaxBlockers : null,
      minCompletionRate: enableMinCompletion ? tierModalMinCompletion : null,
      minOnTimeRate:     enableMinOnTime ? tierModalMinOnTime : null,
      minAvgRating:      enableMinRating ? tierModalMinRating : null,
      minAttendanceRate: enableMinAttendance ? tierModalMinAttendance : null,
      customRule:        enableCustomRule ? tierModalCustomRule.trim() : null,
    };

    setCriteria(prev => {
      if (editingTier) {
        return prev.map(t => t.id === editingTier.id
          ? { ...t, ...newFields }
          : t
        );
      } else {
        const newTier: TierCriteria = {
          id: `tier-${Date.now()}`,
          ...newFields,
        };
        return [...prev, newTier];
      }
    });

    setIsTierModalOpen(false);
    toast.success(editingTier ? 'Certificate type updated' : 'Certificate type added');
  };

  const deleteTier = (tierId: string) => {
    if (criteria.length <= 1) {
      toast.error('Template must have at least one certificate type');
      return;
    }
    setCriteria(prev => prev.filter(t => t.id !== tierId));
    toast.success('Certificate type deleted');
  };

  return {
    isTierModalOpen,
    setIsTierModalOpen,
    editingTier,
    openTierModal,
    saveTierModal,
    deleteTier,
    handleTierBadgeUpload,
    uploadingTierBadge,
    tierModalName, setTierModalName,
    tierModalBadgeUrl, setTierModalBadgeUrl,
    tierModalKeywords, setTierModalKeywords,
    tierModalKeywordInput, setTierModalKeywordInput,
    tierModalMinScore, setTierModalMinScore,
    tierModalMaxBlockers, setTierModalMaxBlockers,
    tierModalMinCompletion, setTierModalMinCompletion,
    tierModalMinOnTime, setTierModalMinOnTime,
    tierModalMinRating, setTierModalMinRating,
    tierModalCustomRule, setTierModalCustomRule,
    enableKeywords, setEnableKeywords,
    enableMinScore, setEnableMinScore,
    enableMaxBlockers, setEnableMaxBlockers,
    enableMinCompletion, setEnableMinCompletion,
    enableMinOnTime, setEnableMinOnTime,
    enableMinRating, setEnableMinRating,
    enableCustomRule, setEnableCustomRule
  };
}
