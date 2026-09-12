'use client';

import { useState, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import { TierCriteria } from '../certificate-constants';

export interface UseRecipientSelectionOptions {
  criteria: TierCriteria[];
  qualifiedData: Record<string, any[]>;
  aiResults?: Record<string, any>;
}

const EMPTY_ARRAY: any[] = [];
const EMPTY_OBJECT: Record<string, any> = {};

export function useRecipientSelection({
  criteria = EMPTY_ARRAY,
  qualifiedData = EMPTY_OBJECT,
  aiResults = EMPTY_OBJECT,
}: UseRecipientSelectionOptions) {
  const [recipientSearch, setRecipientSearch] = useState('');
  const [badgeFilter, setBadgeFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'none' | 'score_desc' | 'score_asc'>('none');
  const [recipientType, setRecipientType] = useState<'all' | 'mentees' | 'mentors' | 'paused'>('all');
  const [selectedMenteeIds, setSelectedMenteeIds] = useState<Set<string>>(new Set());
  const [assignedTiers, setAssignedTiers] = useState<Record<string, string>>({});

  const recipientMenteesList = useMemo(() => {
    const seen = new Set<string>();
    const list: any[] = [];
    criteria.forEach((c) => {
      (qualifiedData[c.id] ?? []).forEach((m: any) => {
        if (!seen.has(m.id)) {
          seen.add(m.id);
          list.push({ ...m, role: 'mentee', isPaused: false });
        }
      });
    });
    Object.keys(qualifiedData).forEach((key) => {
      if (key === 'mentors' || key === 'paused') return;
      (qualifiedData[key] ?? []).forEach((m: any) => {
        if (!seen.has(m.id)) {
          seen.add(m.id);
          list.push({ ...m, role: 'mentee', isPaused: false });
        }
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

  const getEffectiveTier = useCallback(
    (mOrId: any): string => {
      const defaultTier = criteria[criteria.length - 1]?.id ?? 'participation';
      const id = typeof mOrId === 'string' ? mOrId : mOrId?.id;
      if (!id) return defaultTier;

      if (assignedTiers[id]) return assignedTiers[id];
      if (aiResults?.[id]?.certificate_tier) return aiResults[id].certificate_tier;

      const m = typeof mOrId === 'object' ? mOrId : activeList.find((x: any) => x.id === id);
      if (m?.assignedTier) return m.assignedTier;

      return defaultTier;
    },
    [assignedTiers, aiResults, activeList, criteria]
  );

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
    () => allFilteredIds.length > 0 && allFilteredIds.every((id) => selectedMenteeIds.has(id)),
    [allFilteredIds, selectedMenteeIds]
  );

  const selectedSummary = useMemo(() => {
    const summary: Record<string, number> = {};
    criteria.forEach((c) => {
      summary[c.id] = 0;
    });
    selectedMenteeIds.forEach((id) => {
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
    setSelectedMenteeIds((prev) => {
      const next = new Set(prev);
      const selectableIds = filtered.filter((m: any) => !m.isPaused).map((m: any) => m.id);
      const allSelectableSelected = selectableIds.length > 0 && selectableIds.every((id) => next.has(id));
      if (allSelectableSelected) {
        selectableIds.forEach((id) => next.delete(id));
      } else {
        selectableIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }, [filtered]);

  const toggleOne = useCallback((id: string) => {
    setSelectedMenteeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleTierChange = useCallback((menteeId: string, value: string) => {
    setAssignedTiers((prev) => ({ ...prev, [menteeId]: value }));
  }, []);

  const bulkSetBadge = useCallback(
    (badge: string, getTierNameFn?: (b: string) => string) => {
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
    },
    [assignedTiers, selectedMenteeIds, filtered]
  );

  const resetToAIRecommendations = useCallback(
    (aiResultsList: any[]) => {
      if (!aiResultsList || aiResultsList.length === 0) return;
      const updatedTiers = { ...assignedTiers };
      const nextSelected = new Set(selectedMenteeIds);
      const aiMap: Record<string, string> = {};

      aiResultsList.forEach((r) => {
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
    },
    [assignedTiers, selectedMenteeIds, filtered]
  );

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
    filtered,
    filteredRecipients: filtered,
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
