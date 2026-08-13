import { apiClient } from './api-client';

/**
 * The performance score, computed on the server.
 *
 * Two pages used to work a score out in the browser from cohort rows, each with
 * its own weighting, so the same mentee had a different number depending on
 * which page you opened and a third number in the app. Scoring belongs on the
 * server for a reason beyond tidiness: two of the dimensions are relative to
 * peers, and a browser holding one page of a cohort cannot compute those.
 */

export interface ScorePart {
  key: string;
  label: string;
  score: number;
  share: number;
  contributed: number;
}

export interface ScoreEvidence {
  absoluteProgress: number;
  relativeProgress: number;
  expectedProgress: number | null;
  tasksCompleted: number;
  onTimeRate: number;
  avgRating: number | null;
  mentorAvgRating: number | null;
  effortHours: number;
  attendance: { present: number; absent: number; excused: number; unmarked: number } | null;
  activeWeeks: number;
  weeksEnrolled: number;
  risk: string;
}

export interface RankedMentee {
  id: string;
  name: string;
  avatar: string;
  profilePictureUrl: string | null;
  program: string;
  score: number;
  band: string;
  rank: number;
  parts: ScorePart[];
  evidence: ScoreEvidence;
}

export interface UnrankedMentee {
  id: string;
  name: string;
  avatar: string;
  profilePictureUrl: string | null;
  notRankedBecause: string | null;
}

export interface ClanPerformance {
  weights: Record<string, number>;
  disabled: string[];
  disabledBy: Record<string, 'org' | 'clan'>;
  ranked: RankedMentee[];
  notRanked: UnrankedMentee[];
  counted: number;
}

export interface DimensionInfo {
  label: string;
  question: string;
  weight: number;
}

export interface ScoringSettings {
  weights: Record<string, number>;
  disabled: string[];
  disabledBy: Record<string, 'org' | 'clan'>;
  dimensions: Record<string, DimensionInfo>;
  orgDisabled: string[];
}

export const performanceApi = {
  clan: (clanId: string) =>
    apiClient.get<{ data: ClanPerformance }>(`/performance/clan/${clanId}`).then((r) => r.data),

  settings: (clanId?: string) =>
    apiClient
      .get<{ data: ScoringSettings }>('/performance/settings', clanId ? { params: { clanId } } : undefined)
      .then((r) => r.data),

  /** A mentor switching a dimension off for their own clan. */
  setClanDisabled: (clanId: string, disabled: string[]) =>
    apiClient.put(`/performance/clan/${clanId}/settings`, { disabled }),

  /** Admin only: what the whole organisation means by doing well. */
  setOrgScoring: (input: { weights?: Record<string, number>; disabled?: string[] }) =>
    apiClient.put('/performance/settings', input),
};
