'use client';

import { useCallback, useEffect, useState } from 'react';
import { Video, X } from 'lucide-react';
import { liveMeetingApi, type LiveMeeting } from '@/lib/services/live-meeting-api';
import { LiveMeetingOverlay } from '@/components/shared/LiveMeetingOverlay';

const POLL_MS = 45000;

/**
 * LiveMeetingBanner — shows a "join" banner when an admin-hosted meeting the
 * current user is invited to goes live. Mounted once in Navigation, so every
 * authenticated role (admin / mentor / mentee) sees it. Clicking Join opens the
 * shared JitsiRoom overlay. Dismissable per meeting for this tab.
 */
export function LiveMeetingBanner() {
  const [meetings, setMeetings] = useState<LiveMeeting[]>([]);
  const [joining, setJoining] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const poll = useCallback(async () => {
    try {
      const r = await liveMeetingApi.live();
      setMeetings(r.data?.meetings ?? []);
    } catch {
      // Silent — the banner is best-effort; unauthenticated/expired sessions just show nothing.
    }
  }, []);

  useEffect(() => {
    poll();
    const t = setInterval(poll, POLL_MS);
    return () => clearInterval(t);
  }, [poll]);

  // Only surface meetings that are actually LIVE and not dismissed.
  const live = meetings.find((m) => m.status === 'live' && !dismissed.has(m.id));

  if (joining) {
    return <LiveMeetingOverlay meetingId={joining} onClose={() => setJoining(null)} />;
  }
  if (!live) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm w-[calc(100%-2rem)] sm:w-96 rounded-2xl border border-red-200 bg-card shadow-xl dark:shadow-[0_8px_30px_rgba(0,0,0,0.5)] overflow-hidden">
      <div className="flex items-start gap-3 p-4">
        <span className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
          <Video className="w-5 h-5 text-red-600" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-[11px] font-semibold text-red-600 uppercase tracking-wide">Live now</span>
          </div>
          <p className="mt-0.5 font-semibold text-slate-900 truncate">{live.title}</p>
          {live.clanName && <p className="text-xs text-slate-500 truncate">{live.clanName}</p>}
          <div className="mt-2.5 flex items-center gap-2">
            <button
              onClick={() => setJoining(live.id)}
              className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 inline-flex items-center gap-1.5"
            >
              <Video className="w-3.5 h-3.5" />{live.isHost ? 'Join as host' : 'Join'}
            </button>
            <button
              onClick={() => setDismissed((d) => new Set(d).add(live.id))}
              className="px-2.5 py-1.5 rounded-lg text-slate-500 text-sm hover:bg-slate-100"
            >
              Dismiss
            </button>
          </div>
        </div>
        <button onClick={() => setDismissed((d) => new Set(d).add(live.id))} className="p-1 rounded-lg text-slate-400 hover:text-slate-600 shrink-0" aria-label="Dismiss">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default LiveMeetingBanner;
