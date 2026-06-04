/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { enrollmentApi } from '@/lib/services/enrollment-api';
import { toast } from 'sonner';
import { useAuth } from '@/lib/context/AuthContext';

// Statuses where the mentee is actively working a program.
const WORKING_STATUSES = ['active', 'matched'];
const IN_PROGRESS_STATUSES = ['active', 'matched', 'pending_completion', 'level_completed'];

export interface UseMenteeDashboardReturn {
  enrollments: any[];
  loading: boolean;
  // derived subsets
  currentProgramEnrollments: any[];
  pendingEnrollments: any[];
  approvedEnrollments: any[];
  pendingCompletionEnrollments: any[];
  levelCompletedEnrollments: any[];
  completedEnrollments: any[];
  WORKING_STATUSES: string[];
  // actions
  fetchEnrollments: () => Promise<void>;
  // anonymous mentor feedback drawer state
  feedbackTarget: { enrollmentId: string; programName: string } | null;
  openFeedback: (enrollmentId: string, programName: string) => void;
  closeFeedback: () => void;
  reviewedEnrollmentIds: Set<string>;
  markReviewed: (enrollmentId: string) => void;
}

export function useMenteeDashboard(): UseMenteeDashboardReturn {
  const { user } = useAuth();
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedbackTarget, setFeedbackTarget] = useState<UseMenteeDashboardReturn['feedbackTarget']>(null);
  const [reviewedEnrollmentIds, setReviewedEnrollmentIds] = useState<Set<string>>(new Set());

  const fetchEnrollments = useCallback(async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      const response = await enrollmentApi.getAll({ menteeId: user.id });
      const list = response?.data?.enrollments || response?.enrollments || [];
      setEnrollments(list);
    } catch (err: any) {
      console.error('Failed to fetch enrollments:', err);
      toast.error('Failed to load your enrollments');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) {
      fetchEnrollments();
    }
  }, [user?.id, fetchEnrollments]);

  const openFeedback = useCallback((enrollmentId: string, programName: string) => {
    setFeedbackTarget({ enrollmentId, programName });
  }, []);

  const closeFeedback = useCallback(() => setFeedbackTarget(null), []);

  const markReviewed = useCallback((enrollmentId: string) => {
    setReviewedEnrollmentIds((prev) => new Set(prev).add(enrollmentId));
  }, []);

  return {
    enrollments,
    loading,
    currentProgramEnrollments: enrollments.filter(e => IN_PROGRESS_STATUSES.includes(e.status)),
    pendingEnrollments:         enrollments.filter(e => e.status === 'pending_approval'),
    approvedEnrollments:        enrollments.filter(e => e.status === 'approved' || e.status === 'pending_match'),
    pendingCompletionEnrollments: enrollments.filter(e => e.status === 'pending_completion'),
    levelCompletedEnrollments:  enrollments.filter(e => e.status === 'level_completed'),
    completedEnrollments:       enrollments.filter(e => e.status === 'program_completed'),
    WORKING_STATUSES,
    fetchEnrollments,
    feedbackTarget,
    openFeedback,
    closeFeedback,
    reviewedEnrollmentIds,
    markReviewed,
  };
}
