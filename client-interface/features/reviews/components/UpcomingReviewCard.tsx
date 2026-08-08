'use client';

import { useEffect, useState, useCallback } from 'react';
import { Calendar, User, Users, Sparkles } from 'lucide-react';
import { menteeApi } from '@/lib/services/mentee-api';
import { useCountdown } from '@/lib/hooks/useCountdown';
import { CountdownTicker } from '@/components/shared/CountdownTicker';
import { formatMeeting } from '@/lib/utils/datetime';

interface UpcomingReview {
  scheduleId: string;
  title: string;
  scheduledAt: string;
  clanName: string;
  mentorName: string;
  durationMinutes: number;
}

export function UpcomingReviewCard() {
  const [upcoming, setUpcoming] = useState<UpcomingReview | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUpcoming = useCallback(async () => {
    try {
      const res = (await menteeApi.getUpcomingReview()) as {
        data?: { upcoming: UpcomingReview | null };
      };
      setUpcoming(res?.data?.upcoming ?? null);
    } catch {
      setUpcoming(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUpcoming();
    const interval = setInterval(fetchUpcoming, 30_000);
    return () => clearInterval(interval);
  }, [fetchUpcoming]);

  const timeLeft = useCountdown(upcoming?.scheduledAt);

  if (loading || !upcoming || timeLeft.isExpired) {
    return null;
  }

  const formattedDate = formatMeeting(upcoming.scheduledAt);

  return (
    <div className="bg-card rounded-2xl border border-slate-200 dark:border-slate-800 p-5 mb-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        {/* Left Side: Information */}
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-brand-200 dark:border-brand-500/30 bg-brand-50 dark:bg-brand-500/10 px-3 py-1 text-xs font-medium text-brand-700 dark:text-brand-300">
            <Sparkles className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400 animate-pulse" />
            <span>Upcoming Cohort Review</span>
          </div>

          <h3 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            {upcoming.title}
          </h3>

          <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
              {upcoming.clanName}
            </span>
            <span className="flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
              Mentor: {upcoming.mentorName}
            </span>
            <span className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
              {formattedDate}
            </span>
          </div>
        </div>

        {/* Right Side: Reusable Live Countdown Ticker */}
        <div className="self-start md:self-auto">
          <CountdownTicker timeLeft={timeLeft} />
        </div>
      </div>
    </div>
  );
}
