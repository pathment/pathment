import { useCallback, useEffect, useState } from 'react';
import { mentorApi } from '@/lib/services/mentor-api';

export interface RoadmapStep {
  id: string;
  title: string;
  description?: string;
  type: string;
  taskOrder: number;
  acceptanceCriteria?: string[];
  effort?: string | null;
  dueOffsetDays?: number | null;
  difficulty?: string | null;
  deliverable?: string | null;
  pointsBase?: number | null;
  resources?: { id?: string; title: string; url: string; resourceType?: string | null }[];
}

export interface LinearRoadmap {
  id: string;
  name: string;
  description?: string;
  source: 'org' | 'local';
  published: boolean;
  importedFrom?: string | null;
  skillTags: string[];
  programId: string;
  steps: RoadmapStep[];
  /** Local roadmaps only: false when it belongs to a clan teammate (shared,
   *  assignable but not editable by the viewer). Undefined for org roadmaps. */
  isOwner?: boolean;
}

export interface UseMentorRoadmapsReturn {
  local: LinearRoadmap[];
  org: LinearRoadmap[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useMentorRoadmaps(): UseMentorRoadmapsReturn {
  const [local, setLocal] = useState<LinearRoadmap[]>([]);
  const [org, setOrg] = useState<LinearRoadmap[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRoadmaps = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await mentorApi.listRoadmaps();
      setLocal(res?.data?.local ?? []);
      setOrg(res?.data?.org ?? []);
    } catch {
      setError('Failed to load roadmaps');
      setLocal([]);
      setOrg([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRoadmaps();
  }, [fetchRoadmaps]);

  return { local, org, loading, error, refetch: fetchRoadmaps };
}
