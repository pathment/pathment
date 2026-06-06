import { apiClient } from './api-client';

/** 1:1 scheduling: availability (mentor) + meetings (both) + booking (mentee). */
export const meetingsApi = {
  // Mentor availability
  publishSlot: (data: { date: string; time: string; durationMins?: number; timezone?: string }) =>
    apiClient.post('/meetings/availability', data),
  listMyAvailability: () => apiClient.get('/meetings/availability/mine'),
  deleteSlot: (id: string) => apiClient.delete(`/meetings/availability/${id}`),

  // Mentee booking
  listOpenForMentor: (mentorId: string) => apiClient.get('/meetings/availability', { params: { mentorId } }),
  getBookable: () => apiClient.get('/meetings/bookable'),
  book: (slotId: string, agenda?: string) => apiClient.post('/meetings/book', { slotId, agenda }),

  // Meetings (both)
  listMeetings: () => apiClient.get('/meetings'),
  updateStatus: (id: string, status: 'scheduled' | 'done' | 'cancelled', reason?: string) =>
    apiClient.patch(`/meetings/${id}/status`, { status, reason }),
};
