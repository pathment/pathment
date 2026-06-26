'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { mentorApi } from '@/lib/services/enrollment-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { toast } from 'sonner';

export interface MentorProfileData {
  title?: string;
  organization?: string;
  yearsOfExperience?: number;
  specialization?: string[];
  linkedinUrl?: string;
  githubUrl?: string;
  portfolioUrl?: string;
  maxMentees?: number;
  currentMenteeCount?: number;
  avgResponseTimeHours?: number;
  totalMenteesGuided?: number;
  successRate?: number;
  avgFeedbackRating?: number;
  totalTasksReviewed?: number;
  isAcceptingMentees?: boolean;
  preferredMenteeLevel?: string[];
}

export interface MentorSkill {
  id: string;
  name: string;
  category?: string;
  UserSkill?: { proficiencyLevel?: string };
}

export interface MentorActiveMatch {
  id: string;
  mentee?: { id: string; firstName: string; lastName: string; email: string; profilePictureUrl?: string | null };
  enrollment?: {
    id: string;
    status: string;
    overallProgressPercentage?: number;
    program?: { id: string; name: string };
  };
}

export interface MentorDetail {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  profilePictureUrl?: string;
  createdAt: string;
  mentorProfile?: MentorProfileData;
  skills?: MentorSkill[];
}

interface UseMentorProfileReturn {
  mentor: MentorDetail | null;
  activeMatches: MentorActiveMatch[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useMentorProfile(): UseMentorProfileReturn {
  const { id } = useParams<{ id: string }>();
  const [mentor, setMentor] = useState<MentorDetail | null>(null);
  const [activeMatches, setActiveMatches] = useState<MentorActiveMatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMentor = useCallback(async () => {
    if (!id) return;
    try {
      setIsLoading(true);
      setError(null);
      const response = (await mentorApi.getById(id)) as {
        data?: { mentor?: MentorDetail; activeMatches?: MentorActiveMatch[] };
        mentor?: MentorDetail;
        activeMatches?: MentorActiveMatch[];
      };
      setMentor(response?.data?.mentor ?? response?.mentor ?? null);
      setActiveMatches(response?.data?.activeMatches ?? response?.activeMatches ?? []);
    } catch (err: unknown) {
      const msg = extractApiErrorMessage(err, 'Failed to load mentor profile');
      setError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchMentor();
  }, [fetchMentor]);

  return { mentor, activeMatches, isLoading, error, refetch: fetchMentor };
}
