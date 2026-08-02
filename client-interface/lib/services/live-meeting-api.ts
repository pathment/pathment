import { apiClient } from './api-client';

/** Attendee-side access to admin-hosted live meetings (any authenticated role). */
export interface LiveMeeting {
  id: string;
  title: string;
  description: string | null;
  status: 'scheduled' | 'live' | 'ended' | 'cancelled';
  scheduledAt: string;
  durationMinutes: number;
  isHost: boolean;
  clanName: string | null;
}

export interface JoinInfo {
  id: string;
  title: string;
  domain: string;
  room: string;
  url: string;
  displayName: string | null;
  avatarUrl: string | null;
  isHost: boolean;
  status: string;
}

export const liveMeetingApi = {
  /** Admin meetings the current user can join now / soon (for the banner). */
  live: () => apiClient.get<{ data: { meetings: LiveMeeting[] } }>('/meetings/live'),
  /** Room details to join a specific meeting (audience-gated). */
  join: (id: string) => apiClient.get<{ data: { meeting: JoinInfo } }>(`/meetings/admin/${id}/join`),
};
