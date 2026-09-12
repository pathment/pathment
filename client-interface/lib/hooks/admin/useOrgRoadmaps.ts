'use client';

import { useCallback } from 'react';
import { qk, useApiQuery, useInvalidate, STALE } from '@/lib/query';
import { orgRoadmapApi, type RoadmapStepInput } from '@/lib/services/roadmap-api';

export interface OrgRoadmapStep {
  id: string;
  title: string;
  description?: string;
  type: string;
  taskOrder: number;
  effort?: string | null;
  dueOffsetDays?: number | null;
  acceptanceCriteria?: string[];
  difficulty?: string | null;
  deliverable?: string | null;
  pointsBase?: number | null;
  resources?: { id?: string; title: string; url: string; resourceType?: string | null }[];
}

export interface OrgRoadmap {
  id: string;
  name: string;
  description?: string | null;
  source: 'org';
  published: boolean;
  skillTags: string[];
  programId: string;
  steps: OrgRoadmapStep[];
}

export interface UseOrgRoadmapsReturn {
  roadmaps: OrgRoadmap[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  create: (data: { name: string; programId: string; description?: string; skillTags?: string[]; steps: RoadmapStepInput[]; published?: boolean }) => Promise<void>;
  update: (id: string, data: { name?: string; description?: string; skillTags?: string[]; published?: boolean }) => Promise<void>;
  addStep: (id: string, step: RoadmapStepInput) => Promise<void>;
  replaceSteps: (id: string, steps: RoadmapStepInput[]) => Promise<void>;
  removeStep: (id: string, stepId: string) => Promise<void>;
  setPublished: (id: string, published: boolean) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

const EMPTY: OrgRoadmap[] = [];

export function useOrgRoadmaps(): UseOrgRoadmapsReturn {
  const { data, loading, error, refetch } = useApiQuery<OrgRoadmap[]>({
    queryKey: qk.admin.orgRoadmaps,
    queryFn: async () => (await orgRoadmapApi.list())?.data?.roadmaps ?? [],
    staleTime: STALE.long,
    errorMessage: 'Failed to load org roadmaps',
  });

  const invalidate = useInvalidate();

  const after = useCallback(async (call: Promise<unknown>) => {
    await call;
    await invalidate(qk.admin.orgRoadmaps);
  }, [invalidate]);

  return {
    roadmaps: data ?? EMPTY,
    loading,
    error,
    refetch,
    create: useCallback((d: Parameters<typeof orgRoadmapApi.create>[0]) => after(orgRoadmapApi.create(d)), [after]),
    update: useCallback((id: string, d: { name?: string; description?: string; skillTags?: string[]; published?: boolean }) => after(orgRoadmapApi.update(id, d)), [after]),
    addStep: useCallback((id: string, step: RoadmapStepInput) => after(orgRoadmapApi.addStep(id, step)), [after]),
    replaceSteps: useCallback((id: string, steps: RoadmapStepInput[]) => after(orgRoadmapApi.replaceSteps(id, steps)), [after]),
    removeStep: useCallback((id: string, stepId: string) => after(orgRoadmapApi.removeStep(id, stepId)), [after]),
    setPublished: useCallback((id: string, published: boolean) => after(orgRoadmapApi.update(id, { published })), [after]),
    remove: useCallback((id: string) => after(orgRoadmapApi.remove(id)), [after]),
  };
}
