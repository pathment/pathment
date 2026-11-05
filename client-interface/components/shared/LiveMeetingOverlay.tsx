'use client';

import { useEffect, useState } from 'react';
import { Loader2, X, AlertTriangle, Video, VideoOff } from 'lucide-react';
import { JitsiRoom } from '@/components/shared/JitsiRoom';
import { liveMeetingApi, type JoinInfo } from '@/lib/services/live-meeting-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { useScrollLock } from '@/lib/hooks/useScrollLock';

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
  useScrollLock();

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
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-background/80 backdrop-blur-md p-4 animate-in fade-in duration-150">
            <div className="bg-card text-card-foreground rounded-2xl shadow-2xl max-w-lg w-full p-6 sm:p-7 border border-border relative animate-in zoom-in-95 duration-150">
              {/* Close button */}
              <button
                onClick={onClose}
                className="absolute top-5 right-5 p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
                title="Cancel and return"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>

              {/* Eyebrow & Title */}
              <div className="text-left pr-8">
                <span className="text-[11px] font-bold tracking-wider text-primary uppercase">
                  JOIN REVIEW
                </span>
                <h2 className="text-xl font-bold text-foreground mt-1 tracking-tight">
                  How would you like to join?
                </h2>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1.5 leading-relaxed">
                  Live review in <strong className="font-semibold text-foreground">{(info?.title || '').replace(/^(Live\s+)?Review\s*[·-]\s*/i, '').trim() || info?.title || 'the clan review'}</strong>. You can turn your camera on or off anytime during the call.
                </p>
              </div>

              {/* Two Choice Cards */}
              <div className="grid grid-cols-2 gap-3.5 my-6">
                <button
                  type="button"
                  onClick={() => setCameraPref('on')}
                  className="flex flex-col items-center justify-center py-7 px-4 rounded-xl border border-border/80 bg-background hover:bg-primary/5 hover:border-primary/50 transition-all group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary shadow-xs cursor-pointer"
                >
                  <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                    <Video className="w-5 h-5" />
                  </div>
                  <span className="text-sm font-semibold text-foreground">Camera on</span>
                </button>

                <button
                  type="button"
                  onClick={() => setCameraPref('off')}
                  className="flex flex-col items-center justify-center py-7 px-4 rounded-xl border border-border/80 bg-background hover:bg-muted/40 hover:border-foreground/30 transition-all group focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shadow-xs cursor-pointer"
                >
                  <div className="w-12 h-12 rounded-full bg-muted text-muted-foreground flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                    <VideoOff className="w-5 h-5" />
                  </div>
                  <span className="text-sm font-semibold text-foreground">Camera off</span>
                </button>
              </div>

              {/* Footer Reassurance */}
              <p className="text-[11.5px] text-muted-foreground text-center leading-relaxed px-2">
                If your browser blocks camera access, you can still join and enable it later from the toolbar.
              </p>
            </div>
          </div>
        ) : (
          <JitsiRoom
            domain={info.domain}
            room={info.room}
            jwt={info.jwt}
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
