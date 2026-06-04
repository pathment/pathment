import { apiClient } from './api-client';

export interface ReviewDimensions {
  responsiveness?: number;
  helpfulness?: number;
  clarity?: number;
  support?: number;
}

export interface SubmitReviewPayload {
  dimensions: ReviewDimensions;
  reviewText?: string;
  wouldRecommend?: boolean | null;
}

export const programReviewApi = {
  // Mentee: submit / update anonymous feedback for a completed enrollment
  submit: (enrollmentId: string, payload: SubmitReviewPayload) => {
    return apiClient.post(`/program-reviews/enrollment/${enrollmentId}`, payload);
  },

  // Mentee: fetch own review state (canReview / hasReviewed / existing values)
  getMyReview: (enrollmentId: string) => {
    return apiClient.get(`/program-reviews/enrollment/${enrollmentId}/me`);
  },

  // Mentor: own aggregate feedback (gated until a minimum number of responses)
  getMySummary: () => {
    return apiClient.get(`/program-reviews/mentor/me/summary`);
  },

  // Admin: a mentor's raw feedback for moderation
  getMentorFeedbackForAdmin: (mentorId: string, includeReviewer = false) => {
    return apiClient.get(`/program-reviews/mentor/${mentorId}/admin${includeReviewer ? '?includeReviewer=true' : ''}`);
  },
};
