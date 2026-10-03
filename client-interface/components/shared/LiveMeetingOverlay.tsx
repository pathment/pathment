'use client';

import { useEffect, useState } from 'react';
import { Loader2, X, AlertTriangle, Video, VideoOff } from 'lucide-react';
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
  const [cameraPref, setCameraPref] = useState<'on' | 'off' | null>(null);

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
        ) : !info.isHost && !cameraPref ? (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-background/80 backdrop-blur-md p-4">
            <div className="bg-card rounded-3xl shadow-2xl max-w-sm w-full p-8 text-center border border-border animate-in fade-in zoom-in-95 duration-200 relative">
              <button
                onClick={onClose}
                className="absolute top-4 right-4 p-2 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                title="Cancel and return"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-5 border border-primary/20 shadow-sm mt-2">
                <Video className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-xl font-bold text-card-foreground mb-2">Ready to join?</h2>
              <p className="text-sm text-muted-foreground mb-8 px-2">Choose how you'd like to enter the live clan review.</p>
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => setCameraPref('on')}
                  className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-medium transition-all shadow-md"
                >
                  <Video className="w-4 h-4" />
                  Join with Camera On
                </button>
                <button
                  onClick={() => setCameraPref('off')}
                  className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl bg-secondary hover:bg-secondary/80 text-secondary-foreground font-medium transition-colors border border-border"
                >
                  <VideoOff className="w-4 h-4" />
                  Join with Camera Off
                </button>
              </div>
            </div>
          </div>
        ) : (
          <JitsiRoom
            domain={info.domain}
            room={info.room}
            displayName={info.displayName}
            avatarUrl={info.avatarUrl}
            role={info.isHost ? 'host' : 'guest'}
            startWithVideoMuted={cameraPref === 'off'}
            onReadyToClose={onClose}
            onError={(m) => setError(m)}
          />
        )}
      </div>
    </div>
  );
}

export default LiveMeetingOverlay;
