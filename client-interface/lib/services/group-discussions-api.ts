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
};
