import { apiClient } from './api-client';
import type { IntakeFieldType } from '@/lib/config/intakeFields';

/**
 * The public, unauthenticated intake surface: program catalog, cohort apply
 * form (by slug), and an applicant's own status/assessment (by magic-link token).
 * These endpoints work with or without a logged-in user.
 */

export interface PublicProgram {
  id: string;
  name: string;
  description?: string;
  type: string;
  tags?: string[];
  totalDurationWeeks?: number;
  estimatedHoursPerWeek?: number;
  targetAudience?: string;
  learningOutcomes?: string[];
  prerequisites?: string[];
  acceptingApplications?: boolean;
  openCohorts?: { id: string; name: string; slug: string; startDate?: string; endDate?: string; applyClosesAt?: string }[];
}

export interface IntakeFormField {
  key: string;
  label: string;
  type: IntakeFieldType;
  required?: boolean;
  options?: string[];
  profileKey?: string;
}

export interface ApplyInfo {
  open: boolean;
  reasons: string[];
  cohort: { id: string; name: string; description?: string; slug: string; startDate?: string; endDate?: string; applyClosesAt?: string };
  program: { id: string; name: string; description?: string; type: string } | null;
  formSchema: IntakeFormField[];
  /** Applicant-selectable levels (empty = no level question). */
  levels: { key: string; label: string }[];
  /** Which exact assessment depends on level + a random draw, so only `required` is exposed. */
  assessment: { required: boolean } | null;
  /** The cohort's workspace, so an unscoped link can move onto /w/<workspace>/…. */
  workspace?: string;
}

export interface PublicAssessmentQuestion {
  id: string;
  type: 'mcq' | 'multi_select' | 'short_text' | 'long_text' | 'file_upload' | 'external_link';
  prompt: string;
  required: boolean;
  options: { id: string; label: string }[];
  config: Record<string, unknown>;
}

export interface AssessmentAnswer {
  optionIds?: string[];
  text?: string;
  fileUrl?: string;
  fileName?: string;
  link?: string;
}

export const publicApi = {
  listPrograms: () =>
    apiClient.get<any>('/public/programs').then((r) => (r.data?.programs || []) as PublicProgram[]),

  getProgram: (id: string) =>
    apiClient.get<any>(`/public/programs/${id}`).then((r) => r.data?.program as PublicProgram),

  getCohort: (slug: string) =>
    apiClient.get<any>(`/public/cohorts/${encodeURIComponent(slug)}`).then((r) => r.data as ApplyInfo),

  apply: (slug: string, data: Record<string, unknown>) =>
    apiClient.post<any>(`/public/cohorts/${encodeURIComponent(slug)}/apply`, data).then((r) => r.data as {
      accessToken: string;
      statusUrl: string;
      requiresAssessment: boolean;
      application: { id: string; status: string; email: string };
    }),

  /** "Already applied? Continue" — re-issue the magic link by email (privacy-safe;
   *  the response is generic whether or not an application exists). */
  resume: (slug: string, email: string) =>
    apiClient.post<any>(`/public/cohorts/${encodeURIComponent(slug)}/resume`, { email }).then((r) => r.data as { ok: boolean; message: string }),

  getStatus: (token: string) =>
    apiClient.get<any>(`/public/applications/${encodeURIComponent(token)}`).then((r) => r.data),

  submitAssessment: (token: string, answers: Record<string, AssessmentAnswer>) =>
    apiClient.post<any>(`/public/applications/${encodeURIComponent(token)}/assessment`, { answers }).then((r) => r.data),

  // Applicant self-serve, before the deadline: edit submitted info, or withdraw.
  updateInfo: (token: string, data: Record<string, unknown>) =>
    apiClient.patch<any>(`/public/applications/${encodeURIComponent(token)}`, data).then((r) => r.data as { ok: boolean }),

  withdraw: (token: string) =>
    apiClient.post<any>(`/public/applications/${encodeURIComponent(token)}/withdraw`, {}).then((r) => r.data as { ok: boolean }),

  uploadFile: (token: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    // No explicit Content-Type — the interceptor + browser set multipart with
    // the required boundary.
    return apiClient
      .post<any>(`/public/applications/${encodeURIComponent(token)}/upload`, fd)
      .then((r) => r.data as { url: string; fileName: string; fileSizeBytes: number });
  },

  /** Public clan joining page (opaque token). Works with optional auth. */
  getClanJoin: (token: string) =>
    apiClient.get<any>(`/public/clans/join/${encodeURIComponent(token)}`).then((r) => r.data as PublicClanJoinInfo),

  /** Authenticated join request via public clan token. */
  submitClanJoinRequest: (token: string, message?: string) =>
    apiClient.post<any>(
      `/public/clans/join/${encodeURIComponent(token)}/request`,
      message ? { message } : {}
    ).then((r) => r.data as { request: { id: string; status: string } }),
};

export type ClanJoinViewerStatus =
  | 'anonymous'
  | 'eligible'
  | 'already_member'
  | 'approved'
  | 'pending'
  | 'member_elsewhere'
  | 'mentor_of_clan';

export interface PublicClanJoinInfo {
  token: string;
  clan: {
    name: string;
    description?: string | null;
    maxMentees?: number | null;
    menteeCount?: number;
    seatsRemaining?: number | null;
  };
  program: { name: string } | null;
  joining: {
    requiresApproval: boolean;
    message: string;
    open?: boolean;
    windowStatus?: 'active' | 'upcoming' | 'expired' | null;
    startsAt?: string | null;
    endsAt?: string | null;
    timezone?: string | null;
  };
  viewerStatus: ClanJoinViewerStatus;
}
