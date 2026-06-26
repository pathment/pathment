import { apiClient } from './api-client';

/** One recurring weekly-availability rule: a time range on a given weekday. */
export interface AvailabilityRule {
  id?: string;
  weekday: number;      // 0 = Sunday … 6 = Saturday
  startTime: string;    // 'HH:MM' (24h)
  endTime: string;      // 'HH:MM' (24h)
  slotMins: number;
}

/** 1:1 scheduling: availability (mentor) + meetings (both) + booking (mentee). */
export const meetingsApi = {
  // Mentor availability — one-off slots
  publishSlot: (data: { date: string; time: string; durationMins?: number; timezone?: string }) =>
    apiClient.post('/meetings/availability', data),
  listMyAvailability: () => apiClient.get('/meetings/availability/mine'),
  deleteSlot: (id: string) => apiClient.delete(`/meetings/availability/${id}`),

  // Mentor availability — recurring weekly hours (set once, mentees book each week)
  getRules: () => apiClient.get<{ data: { rules: AvailabilityRule[] } }>('/meetings/availability/rules'),
  saveRules: (rules: AvailabilityRule[], timezone?: string) =>
    apiClient.put('/meetings/availability/rules', { rules, timezone }),

  // Mentee booking
  listOpenForMentor: (mentorId: string) => apiClient.get('/meetings/availability', { params: { mentorId } }),
  getBookable: () => apiClient.get('/meetings/bookable'),
  book: (slotId: string, agenda?: string) => apiClient.post('/meetings/book', { slotId, agenda }),

  // Meetings (both)
  listMeetings: () => apiClient.get('/meetings'),
  updateStatus: (id: string, status: 'scheduled' | 'done' | 'cancelled', reason?: string) =>
    apiClient.patch(`/meetings/${id}/status`, { status, reason }),
};
