'use client';

import { useEffect, useState } from 'react';
import { Loader2, X, AlertTriangle } from 'lucide-react';
import { JitsiRoom } from '@/components/shared/JitsiRoom';
import { liveMeetingApi, type JoinInfo } from '@/lib/services/live-meeting-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';

/**
 * LiveMeetingOverlay — full-screen join surface for an admin-hosted meeting.
 * Fetches the audience-gated room details, then embeds the shared JitsiRoom.
 * Reused by the dashboard banner and the admin meetings page.
 */
export function LiveMeetingOverlay({ meetingId, onClose }: { meetingId: string; onClose: () => void }) {
  const [info, setInfo] = useState<JoinInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    liveMeetingApi.join(meetingId)
      .then((r) => { if (alive) setInfo(r.data?.meeting ?? null); })
      .catch((e) => { if (alive) setError(extractApiErrorMessage(e, 'Could not join this meeting')); });
    return () => { alive = false; };
  }, [meetingId]);

  // Lock body scroll while the call is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900 flex flex-col">
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-950 text-white shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
          <span className="text-sm font-medium truncate">{info?.title || 'Live meeting'}</span>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 inline-flex items-center gap-1 text-sm">
          <X className="w-4 h-4" />Leave
        </button>
      </div>
      <div className="flex-1 min-h-0 relative">
        {error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-300 px-6 text-center">
            <AlertTriangle className="w-8 h-8 text-amber-400" />
            <p>{error}</p>
            <button onClick={onClose} className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm">Close</button>
          </div>
        ) : !info ? (
          <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-white/70" /></div>
        ) : (
          <JitsiRoom
            domain={info.domain}
            room={info.room}
            displayName={info.displayName}
            avatarUrl={info.avatarUrl}
            role={info.isHost ? 'host' : 'guest'}
            onReadyToClose={onClose}
            onError={(m) => setError(m)}
          />
        )}
      </div>
    </div>
  );
}

export default LiveMeetingOverlay;
