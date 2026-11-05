import { apiClient } from './api-client';
import { stripHtml } from '@/lib/utils/html';

/** How long a scenario may be, in the characters a reader sees (formatting is free). Matches the server. */
export const SCENARIO_MAX_CHARS = 5000;
export const SCENARIO_TITLE_MAX = 200;
/** A scenario's length as the limit counts it: its words, not its HTML. */
export const scenarioLength = (html?: string | null) => stripHtml(html).length;

export type DiscussionState = 'open' | 'upcoming' | 'ended';
export type MemberActivity = 'more_active' | 'less_active' | 'read_only' | 'not_joined';

export interface DiscussionSchedule {
  repeat: 'none' | 'weekly';
  startsAt?: string | null;
  endsAt?: string | null;
  dayOfWeek?: number;
  timeLocal?: string;
  durationMinutes?: number;
  timezone?: string;
  startsOn?: string;
  endsOn?: string | null;
}

export interface DiscussionWindowFields {
  state: DiscussionState;
  opensAt: string | null;
  closesAt: string | null;
}

// ── the live meeting ─────────────────────────────────────────────────────

export type MeetingState = 'scheduled' | 'live' | 'ended' | 'missed';

/** A group's meeting, as the server reads it. All times are ISO instants (UTC). */
export interface DiscussionMeeting {
  state: MeetingState;
  startsAt: string;
  endsAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  /** Two minutes before the start: the Join banner and the room open then. */
  joinOpensAt: string;
  joinable: boolean;
}

/** The five things a mentor rates, 0-100 each. Higher is better on all of them. */
export const DISCUSSION_CRITERIA = [
  { key: 'communication', label: 'Communication', hint: 'How clearly and effectively they get their point across.' },
  { key: 'relevance', label: 'Relevance', hint: 'How relevant and on-topic their contributions are.' },
  { key: 'openness', label: 'Openness', hint: 'How well they take feedback, disagreement and views different from their own.' },
  { key: 'criticalThinking', label: 'Critical thinking', hint: 'How well they reason, weigh options and back up a position.' },
  { key: 'collaboration', label: 'Collaboration', hint: 'How well they listen, build on others and bring quieter people in.' },
] as const;
export type CriterionKey = (typeof DISCUSSION_CRITERIA)[number]['key'];
export type CriteriaScores = Record<CriterionKey, number>;
/** Every slider starts at the middle. */
export const DEFAULT_CRITERIA: CriteriaScores = {
  communication: 50, relevance: 50, openness: 50, criticalThinking: 50, collaboration: 50,
};

export interface MeetingFeedback extends CriteriaScores {
  note: string;
  updatedAt?: string;
  mentorId?: string;
  mentorName?: string;
  /** Saving after the meeting approved the mentee's task with this feedback. */
  taskCompleted?: boolean;
}

export interface MeetingJoin {
  groupId: string;
  domain: string;
  room: string;
  url: string;
  /** Backend-issued, room-scoped Jitsi token: the server decides who moderates. */
  jwt: string;
  displayName: string | null;
  avatarUrl: string | null;
  title: string;
  /** The mentee's talk time so far, so a rejoin keeps counting from it. */
  talkSeconds?: number;
  meeting?: DiscussionMeeting;
}

export interface MeetingRosterRow {
  menteeId: string;
  name: string;
  avatarUrl: string | null;
  present: boolean;
  joinedAt: string | null;
  leftAt: string | null;
  secondsPresent: number;
  talkSeconds: number;
  /** This mentor's own feedback on them. */
  feedback: MeetingFeedback | null;
  /** Their Group Discussion task, so the panel can open its review. */
  task: { id: string; status: string } | null;
}

export interface MeetingHostView {
  enabled: boolean;
  comingSoon?: boolean;
  meeting?: DiscussionMeeting | null;
  join?: MeetingJoin | null;
  roster?: MeetingRosterRow[];
}

/** The 1-5 star rating: 70% mentor feedback, 30% activity against the group. */
export interface DiscussionRating {
  stars: number | null;
  score: number | null;
  basis: 'both' | 'feedback' | 'activity' | null;
  feedback: { score: number | null; criteria: CriteriaScores | null; raters: number };
  activity: { score: number | null; parts: Partial<Record<'messages' | 'talk' | 'voice' | 'files', number>> };
}

export interface MemberMeetingStats {
  joined: boolean;
  joinedAt: string | null;
  secondsPresent: number;
  talkSeconds: number;
}

export interface MeetingSummaryMember {
  menteeId: string;
  name: string;
  profilePictureUrl: string | null;
  activity: MemberActivity;
  messageCount: number;
  voiceCount: number;
  imageCount: number;
  videoCount: number;
  fileCount: number;
  meeting: MemberMeetingStats;
  rating: DiscussionRating;
  myFeedback: MeetingFeedback | null;
  raters: number;
  /** Their Group Discussion task, so the summary can open its review. */
  task: { id: string; status: string } | null;
}

export interface MeetingSummary {
  group: { id: string; name: string; scenarioTitle: string | null };
  meeting: DiscussionMeeting | null;
  groupMax: { messages: number; talk: number; voice: number; files: number };
  members: MeetingSummaryMember[];
}

/** A mentee's own result in a group: never anybody else's. */
export interface MyDiscussionResult {
  meeting: DiscussionMeeting | null;
  groupMax: MeetingSummary['groupMax'];
  member: Omit<MeetingSummaryMember, 'rating' | 'myFeedback' | 'raters'> | null;
  rating: DiscussionRating | null;
  feedback: MeetingFeedback[];
  /** The call is still running; feedback shows once it ends. */
  feedbackHiddenUntilEnd?: boolean;
}

export interface UpcomingMeeting {
  groupId: string;
  groupName: string;
  scenarioTitle: string | null;
  role: 'mentor' | 'mentee';
  meeting: DiscussionMeeting;
}

export interface DiscussionGroupSummary extends DiscussionWindowFields {
  id: string;
  scenarioId: string;
  clanId: string;
  conversationId: string;
  name: string;
  repeat: 'none' | 'weekly';
  dayOfWeek?: number | null;
  timeLocal?: string | null;
  memberCount: number;
  messageCount: number;
  meeting?: DiscussionMeeting | null;
}

export interface DiscussionScenario {
  id: string;
  clanId: string;
  title: string;
  prompt: string | null;
  groups: DiscussionGroupSummary[];
}

export interface DiscussionMember {
  userId: string;
  firstName: string;
  lastName: string;
  profilePictureUrl: string | null;
  messageCount: number;
  fileCount: number;
  lastMessageAt: string | null;
  lastReadAt: string | null;
  activity: MemberActivity;
  task: { id: string; status: string; dueDate: string | null } | null;
}

export interface DiscussionGroupDetail extends Omit<DiscussionGroupSummary, 'memberCount' | 'messageCount'> {
  scenario: { id: string; title: string; prompt: string | null } | null;
  members: DiscussionMember[];
}

/** How one mentee took part in a group, for the mentor reviewing their task. */
export interface DiscussionParticipation {
  group: DiscussionWindowFields & {
    id: string;
    name: string;
    conversationId: string;
    scenarioTitle: string | null;
  };
  member: {
    messageCount: number;
    textCount: number;
    voiceCount: number;
    imageCount: number;
    videoCount: number;
    fileCount: number;
    reactionsReceived: number;
    firstMessageAt: string | null;
    lastMessageAt: string | null;
    lastReadAt: string | null;
    activity: MemberActivity;
  };
  groupStats: {
    memberCount: number;
    totalMessages: number;
    averageMessages: number;
    maxMessages: number;
    rank: number | null;
  };
  /** When each of their messages was sent, oldest first. */
  messageTimes: string[];
  /** The group's meeting and how this mentee was in it; null with no meeting. */
  meeting?: (DiscussionMeeting & MemberMeetingStats) | null;
  rating?: DiscussionRating | null;
  /** Every mentor's feedback on this mentee. */
  feedback?: MeetingFeedback[];
  /** The busiest member's count of each, which the activity half is measured against. */
  groupMax?: { messages: number; talk: number; voice: number; files: number };
}

/** Who was given the Group Discussion task when mentees were added to a group. */
export interface GroupTaskAssignment {
  assigned: number;
  failed: { menteeId: string; error: string }[];
}

/** The mentee's own Group Discussion task for a group, in the submit drawer's shape. */
export interface MyDiscussionTask {
  id: string;
  status: string;
  title: string;
  type: string;
  isCustomTask: boolean;
  deliverable: string | null;
  acceptanceCriteria: string[];
}

export interface MyDiscussionGroup extends DiscussionWindowFields {
  id: string;
  name: string;
  clanName: string | null;
  conversationId: string;
  repeat: 'none' | 'weekly';
  dayOfWeek?: number | null;
  timeLocal?: string | null;
  scenario: { id: string; title: string; prompt: string | null } | null;
  myMessageCount: number;
  meeting?: DiscussionMeeting | null;
  /** Null when no task is linked to this group for them. */
  myTask?: MyDiscussionTask | null;
}

/** Someone in a group's chat, as any member of it sees them. */
export interface DiscussionParticipant {
  userId: string;
  firstName: string;
  lastName: string;
  profilePictureUrl: string | null;
  role: 'mentor' | 'mentee';
}

const BASE = '/group-discussions';

/** The API's envelope: every response carries its payload under `data`. */
interface Envelope<T> { data: T }

export const groupDiscussionsApi = {
  async list(clanId: string | null): Promise<{ clanId: string; scenarios: DiscussionScenario[] }> {
    const res = await apiClient.get<Envelope<{ clanId: string; scenarios: DiscussionScenario[] }>>(BASE, clanId ? { params: { clanId } } : undefined);
    return res.data;
  },
  async createScenario(data: { clanId: string | null; title: string; prompt?: string }): Promise<DiscussionScenario> {
    const res = await apiClient.post<Envelope<{ scenario: DiscussionScenario }>>(`${BASE}/scenarios`, data);
    return res.data.scenario;
  },
  updateScenario: (id: string, data: { title?: string; prompt?: string }) =>
    apiClient.patch(`${BASE}/scenarios/${id}`, data),
  deleteScenario: (id: string) => apiClient.delete(`${BASE}/scenarios/${id}`),

  async createGroup(data: {
    scenarioId: string;
    name: string;
    menteeIds?: string[];
    schedule?: DiscussionSchedule;
  }): Promise<DiscussionGroupDetail & { tasks?: GroupTaskAssignment }> {
    const res = await apiClient.post<Envelope<{ group: DiscussionGroupDetail & { tasks?: GroupTaskAssignment } }>>(`${BASE}/groups`, data);
    return res.data.group;
  },
  async getGroup(id: string): Promise<DiscussionGroupDetail> {
    const res = await apiClient.get<Envelope<{ group: DiscussionGroupDetail }>>(`${BASE}/groups/${id}`);
    return res.data.group;
  },
  deleteGroup: (id: string) => apiClient.delete(`${BASE}/groups/${id}`),
  async addMembers(id: string, menteeIds: string[]): Promise<DiscussionGroupDetail & { tasks?: GroupTaskAssignment }> {
    const res = await apiClient.post<Envelope<{ group: DiscussionGroupDetail & { tasks?: GroupTaskAssignment } }>>(`${BASE}/groups/${id}/members`, { menteeIds });
    return res.data.group;
  },
  removeMember: (id: string, menteeId: string) =>
    apiClient.delete(`${BASE}/groups/${id}/members/${menteeId}`),

  /** Null when the task is no longer linked to a group. */
  async participation(taskId: string): Promise<DiscussionParticipation | null> {
    const res = await apiClient.get<Envelope<{ participation: DiscussionParticipation | null }>>(`${BASE}/tasks/${taskId}/participation`);
    return res.data.participation ?? null;
  },

  async mine(): Promise<MyDiscussionGroup[]> {
    const res = await apiClient.get<Envelope<{ groups: MyDiscussionGroup[] }>>(`${BASE}/mine`);
    return res.data.groups ?? [];
  },
  async mineOne(id: string): Promise<MyDiscussionGroup> {
    const res = await apiClient.get<Envelope<{ group: MyDiscussionGroup }>>(`${BASE}/mine/${id}`);
    return res.data.group;
  },
  async members(id: string): Promise<DiscussionParticipant[]> {
    const res = await apiClient.get<Envelope<{ members: DiscussionParticipant[] }>>(`${BASE}/mine/${id}/members`);
    return res.data.members ?? [];
  },

  // ── the meeting: mentor ──
  async meetingHost(id: string): Promise<MeetingHostView> {
    const res = await apiClient.get<Envelope<MeetingHostView>>(`${BASE}/groups/${id}/meeting`);
    return res.data;
  },
  async scheduleMeeting(id: string, data: { startsAt: string; endsAt?: string | null }): Promise<MeetingHostView> {
    const res = await apiClient.put<Envelope<MeetingHostView>>(`${BASE}/groups/${id}/meeting`, data);
    return res.data;
  },
  cancelMeeting: (id: string) => apiClient.delete(`${BASE}/groups/${id}/meeting`),
  async startMeeting(id: string): Promise<MeetingJoin> {
    const res = await apiClient.post<Envelope<{ join: MeetingJoin }>>(`${BASE}/groups/${id}/meeting/start`);
    return res.data.join;
  },
  async endMeeting(id: string): Promise<MeetingSummary> {
    const res = await apiClient.post<Envelope<{ summary: MeetingSummary }>>(`${BASE}/groups/${id}/meeting/end`);
    return res.data.summary;
  },
  recordMeetingTalk: (id: string, items: { menteeId: string; seconds: number }[]) =>
    apiClient.post(`${BASE}/groups/${id}/meeting/talk-time`, { items }),
  async meetingSummary(id: string): Promise<MeetingSummary> {
    const res = await apiClient.get<Envelope<{ summary: MeetingSummary }>>(`${BASE}/groups/${id}/meeting/summary`);
    return res.data.summary;
  },
  async saveFeedback(id: string, menteeId: string, data: Partial<CriteriaScores> & { note?: string }): Promise<MeetingFeedback> {
    const res = await apiClient.put<Envelope<{ feedback: MeetingFeedback }>>(`${BASE}/groups/${id}/feedback/${menteeId}`, data);
    return res.data.feedback;
  },

  // ── the meeting: anyone in it ──
  async upcomingMeetings(): Promise<UpcomingMeeting[]> {
    const res = await apiClient.get<Envelope<{ meetings: UpcomingMeeting[] }>>(`${BASE}/meetings/upcoming`);
    return res.data.meetings ?? [];
  },
  async myMeetingJoin(id: string): Promise<MeetingJoin> {
    const res = await apiClient.get<Envelope<{ join: MeetingJoin }>>(`${BASE}/mine/${id}/meeting`);
    return res.data.join;
  },
  async myMeetingPresent(id: string, talkSeconds?: number): Promise<{ present: boolean; state: MeetingState | null; submitted?: number }> {
    const res = await apiClient.post<Envelope<{ present: boolean; state: MeetingState | null; submitted?: number }>>(`${BASE}/mine/${id}/meeting/join`, talkSeconds === undefined ? {} : { talkSeconds });
    return res.data;
  },
  myMeetingLeave: (id: string, seconds: number) => apiClient.post(`${BASE}/mine/${id}/meeting/leave`, { seconds }),
  async myResult(id: string): Promise<MyDiscussionResult> {
    const res = await apiClient.get<Envelope<{ result: MyDiscussionResult }>>(`${BASE}/mine/${id}/result`);
    return res.data.result;
  },
};
