import { useCallback, useEffect, useState } from 'react';
import { meetingsApi } from '@/lib/services/meetings-api';

export interface AvailabilitySlot {
  id: string;
  day: string;
  date?: string | null;
  time: string;
  durationMins: number;
  taken: boolean;
  bookedBy?: { id: string; firstName: string; lastName: string } | null;
  startsAt?: string | null;
  timezone?: string | null;
}

export interface Meeting {
  id: string;
  kind: string;
  day: string;
  time: string;
  durationMins: number;
  agenda: string | null;
  status: 'scheduled' | 'done' | 'cancelled';
  mentor?: { id: string; firstName: string; lastName: string };
  mentee?: { id: string; firstName: string; lastName: string };
  startsAt?: string | null;
  timezone?: string | null;
}

export interface UseMentorScheduleReturn {
  availability: AvailabilitySlot[];
  meetings: Meeting[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useMentorSchedule(): UseMentorScheduleReturn {
  const [availability, setAvailability] = useState<AvailabilitySlot[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [availRes, meetRes] = await Promise.all([
        meetingsApi.listMyAvailability(),
        meetingsApi.listMeetings(),
      ]);
      setAvailability(availRes?.data?.slots ?? []);
      setMeetings(meetRes?.data?.meetings ?? []);
    } catch {
      setError('Failed to load your schedule');
      setAvailability([]);
      setMeetings([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return { availability, meetings, loading, error, refetch: fetchAll };
}
