// Mentor cohort (Cockpit) — the mentor's mentees enriched with computed
// fairness/progress signals. Served by GET /mentor/cohort.

export type CohortMomentum = 'up' | 'flat' | 'down';
export type CohortRisk = 'low' | 'watch' | 'high';

export interface CohortMentee {
  id: string;
  name: string;
  avatar: string;
  email: string;
  profilePictureUrl: string | null;
  program: string;
  level: string;
  week: number;
  totalWeeks: number;
  absoluteProgress: number;
  relativeProgress: number;
  onTimeRate: number;
  pendingApprovals: number;
  openBlockers: number;
  momentum: CohortMomentum;
  risk: CohortRisk;
  riskReason: string | null;
  /** Concrete rule-based "why" chips, e.g. "No activity in 6 days". */
  signals?: string[];
  avgRating: number;
  lastActive: string;
  sentiment: string;
  clan?: { id: string; name: string } | null;
}

export interface CohortTotals {
  mentees: number;
  pendingApprovals: number;
  openBlockers: number;
  atRisk: number;
  onTimeRate: number;
}
