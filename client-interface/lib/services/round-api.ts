import { apiClient } from './api-client';
import type {
  Blocker, PlacementPreview, RoadmapOption, ScoreColumn, ScoreRow, ScoringPolicy, Shortlist, BatchResult,
} from './pool-api';

/**
 * A selection round that is a clan (`Clan.kind = 'pool'`).
 *
 * The round itself lives under `/api/clans/:id/selection/*`, because a round
 * IS a clan: its roster, its work, its review and its chat are the clan's own
 * endpoints and are not repeated here. Only what is particular to selecting
 * people — the terms, the work set per level, the ranking, the shortlist and
 * placement — has its own calls.
 *
 * Everything from `scores` down answers in exactly the shapes `poolApi` does,
 * which is what lets one Selection screen serve both kinds of round while the
 * live ones move across. `SelectionApi` is that shared contract.
 */

export interface RoundSummary {
  id: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  status: 'active' | 'inactive' | 'archived';
  frozenAt: string | null;
  programId: string;
  program: { id: string; name: string } | null;
  /** The intake that feeds it, if one does. */
  cohort: { id: string; name: string } | null;
  quota: number;
  qualificationDueAt: string | null;
  /** How many levels have work set for them. */
  levelRules: number;
  memberCount: number;
  selectedCount: number;
  createdAt: string;
}

export interface RoundSettings {
  quota: number;
  waitlistSize: number;
  qualificationDueAt: string | null;
  scoringPolicy: { difficultyPoints: Record<string, number> };
  targetClanIds?: string[];
}

/** What one level is set to do: a roadmap, optionally only some of its steps. */
export interface LevelRule {
  level: string;
  roadmapId: string;
  stepIndexes: number[] | null;
}

/** Why a candidate has been given nothing. `null` when they have work. */
export type NoWorkReason = 'no_level' | 'no_rule_for_level' | null;

export interface RoundCandidate {
  memberId: string;
  userId: string | null;
  name: string;
  email: string;
  level: string | null;
  joinedAt: string;
  decision: 'selected' | 'waitlisted' | 'not_selected' | 'withdrawn' | 'disqualified' | null;
  decisionReason: string | null;
  totalScore: number | null;
  rank: number | null;
  placementStatus: 'pending' | 'placed' | 'failed' | null;
  placementError: string | null;
  placedClan: { id: string; name: string } | null;
  work: { assigned: number; awaitingReview: number; scored: number };
  noWorkReason: NoWorkReason;
}

export interface RoundDetail {
  round: {
    id: string;
    name: string;
    description: string | null;
    avatarUrl: string | null;
    status: 'active' | 'inactive' | 'archived';
    frozenAt: string | null;
    programId: string;
    cohort: { id: string; name: string; levels: { key: string; label: string }[] } | null;
    settings: RoundSettings;
    levelRules: LevelRule[];
  };
  candidates: RoundCandidate[];
  /** The levels this round aims work at. */
  levels: string[];
  awaitingReview: number;
  /** Requests for more time nobody has answered yet. */
  extensions: RoundExtension[];
}

/** One piece of a candidate's work in the round. */
export interface RoundWork {
  id: string;
  title: string;
  kind: string;
  difficulty: string | null;
  points: number | null;
  status: string;
  dueDate: string | null;
}

/** A request for more time, as the round's screens read it. */
export interface RoundExtension {
  id: string;
  taskId: string;
  taskTitle?: string;
  dueDate?: string | null;
  days: number | null;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected' | null;
  askedAt: string | null;
  candidate?: { id: string | null; name: string; email: string };
}

/** The round's work, flattened across its levels — one entry per step. */
export interface RoundWorkItem {
  id: string;
  roadmapTaskId: string;
  title: string;
  kind: string;
  points: number;
  required: boolean;
  levels: string[];
}

/**
 * What the Selection screen needs of a round, whichever kind it is.
 * `poolApi` satisfies this for a `CandidatePool`; `roundApi` for a clan round.
 */
export interface SelectionApi {
  scores: (id: string) => Promise<{
    rows: ScoreRow[]; blockers: Blocker[]; warnings: Blocker[];
    possible: number; work: ScoreColumn[]; policy: ScoringPolicy;
  }>;
  shortlists: (id: string) => Promise<Shortlist[]>;
  shortlist: (id: string, shortlistId: string) => Promise<Shortlist>;
  generateShortlist: (id: string) => Promise<{ shortlist: Shortlist; reused: boolean }>;
  confirm: (id: string, shortlistId: string, overrides: { memberId: string; outcome: string; reason: string }[]) => Promise<Shortlist>;
  placementPreview: (id: string) => Promise<PlacementPreview>;
  setTargets: (id: string, targets: { memberId: string; clanId: string | null }[]) => Promise<unknown>;
  place: (id: string, memberIds?: string[]) => Promise<BatchResult>;
}

type Envelope<T> = { data: T };
const at = (id: string) => `/clans/${id}/selection`;

export const roundApi = {
  list: (params?: { programId?: string }) =>
    apiClient.get<Envelope<{ rounds: RoundSummary[] }>>('/pools/rounds', { params }).then((r) => r.data.rounds ?? []),
  create: (body: { programId: string; name: string; description?: string; leadMentorId?: string | null; cohortId?: string | null }) =>
    apiClient.post<Envelope<{ round: { id: string; name: string } }>>('/pools/rounds', body).then((r) => r.data.round),

  get: (id: string) => apiClient.get<Envelope<RoundDetail>>(at(id)).then((r) => r.data),
  roster: (id: string) =>
    apiClient.get<Envelope<{ candidates: RoundCandidate[]; levels: string[]; awaitingReview: number }>>(`${at(id)}/members`).then((r) => r.data),

  /** Point an intake at this round, or pass null to take it off the one it is on. */
  attachIntake: (id: string, cohortId: string | null) =>
    apiClient.put<Envelope<{ attached: { id: string; name: string } | null }>>(`${at(id)}/intake`, { cohortId }).then((r) => r.data),

  settings: (id: string) =>
    apiClient.get<Envelope<{ settings: RoundSettings; levelRules: LevelRule[]; work: RoundWorkItem[] }>>(`${at(id)}/settings`).then((r) => r.data),
  setSettings: (id: string, body: Partial<RoundSettings>) =>
    apiClient.put<Envelope<{ settings: RoundSettings }>>(`${at(id)}/settings`, body).then((r) => r.data.settings),
  /** Replace what every level is set to do. A level with no rule gets no work. */
  setLevelRules: (id: string, rules: { level: string; roadmapId: string; stepIndexes?: number[] | null }[]) =>
    apiClient.put<Envelope<{ levelRules: LevelRule[] }>>(`${at(id)}/level-rules`, { rules }).then((r) => r.data.levelRules),
  setMemberLevel: (id: string, userId: string, level: string | null) =>
    apiClient.put<Envelope<{ level: string | null; assigned: number; reason: string | null }>>(
      `${at(id)}/members/${userId}/level`, { level },
    ).then((r) => r.data),

  // ── One candidate: their work, and the time they ask for ───────────────────
  candidateWork: (id: string, userId: string) =>
    apiClient.get<Envelope<{ work: RoundWork[]; extensions: RoundExtension[] }>>(`${at(id)}/members/${userId}/work`).then((r) => r.data),
  /** Give one candidate a roadmap's work on top of whatever their level gave them. */
  giveWork: (id: string, userId: string, body: { roadmapId: string; stepIndexes?: number[] | null }) =>
    apiClient.post<Envelope<{ assigned: number; reason?: string }>>(`${at(id)}/members/${userId}/work`, body).then((r) => r.data),
  takeWorkBack: (id: string, taskId: string) => apiClient.delete(`${at(id)}/work/${taskId}`),
  openExtensions: (id: string) =>
    apiClient.get<Envelope<{ extensions: RoundExtension[] }>>(`${at(id)}/extensions`).then((r) => r.data.extensions ?? []),
  answerExtension: (id: string, submissionId: string, approved: boolean, newDueDate?: string | null) =>
    apiClient.post(`${at(id)}/extensions/${submissionId}`, { approved, newDueDate: newDueDate || null }),

  // ── The shared selection contract ──────────────────────────────────────────
  scores: (id: string) =>
    apiClient.get<Envelope<{
      rows: ScoreRow[]; blockers: Blocker[]; warnings: Blocker[];
      possible: number; work: ScoreColumn[]; policy: ScoringPolicy;
    }>>(`${at(id)}/scores`).then((r) => r.data),
  shortlists: (id: string) =>
    apiClient.get<Envelope<{ shortlists: Shortlist[] }>>(`${at(id)}/shortlists`).then((r) => r.data.shortlists ?? []),
  shortlist: (id: string, shortlistId: string) =>
    apiClient.get<Envelope<{ shortlist: Shortlist }>>(`${at(id)}/shortlists/${shortlistId}`).then((r) => r.data.shortlist),
  generateShortlist: (id: string) =>
    apiClient.post<Envelope<{ shortlist: Shortlist; reused: boolean }>>(`${at(id)}/shortlists`, {}).then((r) => r.data),
  confirm: (id: string, shortlistId: string, overrides: { memberId: string; outcome: string; reason: string }[]) =>
    apiClient.post<Envelope<{ shortlist: Shortlist }>>(`${at(id)}/shortlists/${shortlistId}/confirm`, { overrides }).then((r) => r.data.shortlist),
  setDecision: (id: string, memberId: string, decision: string, reason: string) =>
    apiClient.post(`${at(id)}/members/${memberId}/decision`, { decision, reason }),

  placementPreview: (id: string) => apiClient.get<Envelope<PlacementPreview>>(`${at(id)}/placement/preview`).then((r) => r.data),
  setTargets: (id: string, targets: { memberId: string; clanId: string | null }[]) =>
    apiClient.put(`${at(id)}/placement/targets`, { targets }),
  place: (id: string, memberIds?: string[]) =>
    apiClient.post<Envelope<BatchResult>>(`${at(id)}/placement/run`, memberIds ? { memberIds } : {}).then((r) => r.data),
};

export type { RoadmapOption };
