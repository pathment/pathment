// ─── Event types ─────────────────────────────────────────────────────────────

export type ActivityEventType =
  | 'page_view'
  | 'task_opened'
  | 'task_started'
  | 'submission_started'
  | 'submission_completed'
  | 'extension_requested'
  | 'blocker_logged'
  | 'message_sent'
  | 'program_viewed'
  | 'milestone_reached';

export type ActivityEventCategory =
  | 'navigation'
  | 'task'
  | 'submission'
  | 'messaging'
  | 'general';

// ─── Session / summary shapes ────────────────────────────────────────────────

export interface DailySession {
  date: string;            // YYYY-MM-DD
  activeMinutes: number;
  pageViews: number;
  eventsCount: number;
  sessionStart?: string;
}

export interface ActivitySummary {
  totalActiveMinutes: number;
  activeDays: number;
  avgDailyMinutes: number;
  todayActiveMinutes: number;
  currentStreak: number;
  /** Self-reported hours logged on submitted tasks in the period */
  totalWorkHours?: number;
}

export interface RecentEvent {
  eventType: ActivityEventType;
  eventData: Record<string, unknown>;
  createdAt: string;
}

export interface MyActivityResponse {
  summary: ActivitySummary;
  dailySessions: DailySession[];
  recentEvents: RecentEvent[];
}

// ─── Mentor view of a mentee ─────────────────────────────────────────────────

export interface MenteeActivityResponse {
  mentee: { id: string; firstName: string; lastName: string; email: string };
  summary: ActivitySummary;
  dailySessions: DailySession[];
  recentEvents: RecentEvent[];
}

// ─── Admin overview ───────────────────────────────────────────────────────────

export interface MenteeActivityStat {
  user: { id: string; firstName: string; lastName: string; email: string; profilePictureUrl?: string | null };
  totalActiveMinutes: number;
  activeDays: number;
  avgDailyMinutes: number;
  lastActiveDate: string | null;
  todayActiveMinutes: number;
  sessions: { date: string; activeMinutes: number }[];
}

export interface AdminActivityOverview {
  platform: {
    activeToday: number;
    activeThisWeek: number;
    avgDailyMinutesPerMentee: number;
    periodDays: number;
  };
  menteeStats: MenteeActivityStat[];
}
