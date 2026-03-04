/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { programManagementApi } from '@/lib/services/program-api';
import { matchingApi } from '@/lib/services/enrollment-api';
import { useAuth } from '@/lib/context/AuthContext';
import { toast } from 'sonner';

export type ProgramDetailTab = 'overview' | 'roadmap' | 'mentees';

export interface UseMentorProgramDetailReturn {
  program: any | null;
  levels: any[];
  roadmap: any | null;
  myMentees: any[];
  loading: boolean;
  loadingRoadmap: boolean;
  activeTab: ProgramDetailTab;
  selectedLevelId: string;
  expandedWeeks: Set<string>;
  setActiveTab: (tab: ProgramDetailTab) => void;
  setSelectedLevelId: (id: string) => void;
  toggleWeek: (weekId: string) => void;
  fetchRoadmap: () => Promise<void>;
}

export function useMentorProgramDetail(programId: string): UseMentorProgramDetailReturn {
  const { user } = useAuth();

  const [program, setProgram] = useState<any>(null);
  const [levels, setLevels] = useState<any[]>([]);
  const [roadmap, setRoadmap] = useState<any>(null);
  const [myMentees, setMyMentees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingRoadmap, setLoadingRoadmap] = useState(false);
  const [activeTab, setActiveTab] = useState<ProgramDetailTab>('overview');
  const [selectedLevelId, setSelectedLevelId] = useState('');
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set());

  const fetchProgram = useCallback(async () => {
    if (!programId) return;
    try {
      setLoading(true);
      const response = await programManagementApi.programs.getById(programId);
      const programData = response?.data?.program || response?.program || response;
      setProgram(programData);
    } catch (error: any) {
      console.error('Failed to fetch program:', error);
      toast.error('Failed to load program');
    } finally {
      setLoading(false);
    }
  }, [programId]);

  const fetchLevels = useCallback(async () => {
    if (!programId) return;
    try {
      const response = await programManagementApi.levels.getByProgram(programId);
      const levelsList = response?.data?.levels || response?.levels || response || [];
      const arr = Array.isArray(levelsList) ? levelsList : [];
      setLevels(arr);
      if (arr.length > 0) setSelectedLevelId(arr[0].id);
    } catch (error: any) {
      console.error('Failed to fetch levels:', error);
    }
  }, [programId]);

  const fetchRoadmap = useCallback(async () => {
    if (!selectedLevelId || !programId) return;
    try {
      setLoadingRoadmap(true);
      const response = await programManagementApi.roadmaps.getByLevel(programId, selectedLevelId);
      const roadmapData = response?.data?.roadmap || response?.roadmap || response;
      setRoadmap(roadmapData);
    } catch (error: any) {
      console.error('Failed to fetch roadmap:', error);
      if (error?.response?.status !== 404) {
        toast.error('Failed to load roadmap');
      } else {
        setRoadmap(null);
      }
    } finally {
      setLoadingRoadmap(false);
    }
  }, [programId, selectedLevelId]);

  const fetchMyMentees = useCallback(async () => {
    if (!user?.id || !programId) return;
    try {
      const response = await matchingApi.getMatches({ mentorId: user.id, status: 'active' });
      const matches = response?.data?.matches || response?.matches || [];
      const inThisProgram = matches.filter(
        (m: any) => m.enrollment?.program?.id === programId || m.enrollment?.programId === programId
      );
      setMyMentees(inThisProgram);
    } catch (error: any) {
      console.error('Failed to fetch mentees:', error);
    }
  }, [user?.id, programId]);

  useEffect(() => {
    if (programId) {
      fetchProgram();
      fetchLevels();
    }
  }, [programId, fetchProgram, fetchLevels]);

  useEffect(() => {
    if (user?.id && programId) {
      fetchMyMentees();
    }
  }, [user?.id, programId, fetchMyMentees]);

  useEffect(() => {
    if (activeTab === 'roadmap' && selectedLevelId) {
      fetchRoadmap();
    }
  }, [activeTab, selectedLevelId, fetchRoadmap]);

  const toggleWeek = useCallback((weekId: string) => {
    setExpandedWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(weekId)) { next.delete(weekId); } else { next.add(weekId); }
      return next;
    });
  }, []);

  return {
    program,
    levels,
    roadmap,
    myMentees,
    loading,
    loadingRoadmap,
    activeTab,
    selectedLevelId,
    expandedWeeks,
    setActiveTab,
    setSelectedLevelId,
    toggleWeek,
    fetchRoadmap,
  };
}
