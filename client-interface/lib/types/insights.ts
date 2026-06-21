// Mentee insights / profile — the AI-enriched profile a mentor sees, served by
// mentorApi.getMenteeProfile. Extends the cohort mentee with deeper signals.
import type { CohortMentee } from './cohort';

export interface ProfileBlocker {
  id: string;
  title: string;
  category: string;
  severity: 'low' | 'medium' | 'high';
  status: 'open' | 'resolved';
  daysOpen: number;
  taskTitle: string | null;
}

export interface ProfileDelay {
  id: string;
  reason: string;
  kind: string;
  days: number;
  accepted: boolean;
  category: 'external' | 'scope' | 'avoidance';
  aiRationale: string | null;
  occurredAt: string;
}

export interface Personality {
  consistency: number | null;
  communication: number | null;
  resilience: number | null;
  independence: number | null;
  /** Free-text "how they think/work" read, captured in 1:1s. */
  read?: string | null;
}

export interface ProfileInsight {
  id: string;
  kind: 'personality' | 'analytical' | 'issue' | 'strength' | 'general';
  note: string;
  source: '1:1' | 'text' | 'observation' | null;
  at: string;
  by: string | null;
}

export interface MeetingNote {
  id: string;
  date: string;
  kind: string;
  summary: string;
  sentiment: 'positive' | 'neutral' | 'low';
  issues: string[];
  nextSteps: string[];
  by: string | null;
}

export interface ProfileCollaborator {
  id: string;
  name: string;
  role: string;
  email: string | null;
  status: 'invited' | 'active';
}

export interface MenteeProfile extends CohortMentee {
  aiSummary: string;
  aiSignals: string[];
  blockers: ProfileBlocker[];
  delays: ProfileDelay[];
  personality: Personality | null;
  insights: ProfileInsight[];
  notes: MeetingNote[];
  collaborators: ProfileCollaborator[];
  dailyLogs: { dateKey: string; tasksDone: number; note: string | null; loggedAt: string }[];
  tasksByStatus: Record<string, Array<{
    id: string;
    title: string;
    type: string | null;
    status: string;
    dueDate: string | null;
    isLate: boolean;
    finalRating: number | null;
  }>>;
}
