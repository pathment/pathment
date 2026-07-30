'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Video, X, ExternalLink } from 'lucide-react';
import { menteeApi } from '@/lib/services/mentee-api';
import { JitsiRoom } from '@/components/shared/JitsiRoom';
import { getSocket } from '@/lib/services/socket-client';

interface ActiveReview {
  sessionId: string;
  domain: string; room: string; url: string;
  displayName: string | null; clanName: string; externalUrl: string | null;
}

/**
 * Live cohort-review bar for mentees. Polls for an active review in their clan;
 * when one is live, a banner offers to join. Joining opens the embedded video
 * (identity pre-set) and self-reports presence — the mentee's own client tells
 * the server "I'm here," so attendance is trustworthy without name-matching.
 */
export function ReviewJoinBar() {
  const [active, setActive] = useState<ActiveReview | null>(null);
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const joinedAtRef = useRef<number | null>(null);
  const leavingRef = useRef(false);

  const poll = useCallback(async () => {
    try {
      const res = await menteeApi.getActiveReview() as { data?: { meeting: ActiveReview | null } };
      setActive(res?.data?.meeting ?? null);
    } catch { /* transient — keep the last state */ }
  }, []);

  useEffect(() => {
    poll();
    const t = setInterval(poll, 12_000);
    // Real-time: the server emits `review:started` to the clan's mentees the
    // moment the mentor opens the room — re-poll immediately so the banner shows
    // without waiting for the interval. The interval stays as a fallback.
    const socket = getSocket();
    const onStarted = () => { setDismissed(null); poll(); };
    socket?.on('review:started', onStarted);
    return () => { clearInterval(t); socket?.off('review:started', onStarted); };
  }, [poll]);

  const onJoined = async () => {
    if (!active) return;
    joinedAtRef.current = Date.now();
    leavingRef.current = false;
    try { await menteeApi.joinReview(active.sessionId); } catch { /* best-effort */ }
  };

  // Presence heartbeat: while in the call, keep re-reporting so the server always
  // has a fresh "in this call" signal. This is what makes the mentor's "Track
  // attendance" toggle reliably mark whoever is CURRENTLY in the room — even a
  // mentee who stayed connected across a mentor restart (whose Jitsi client never
  // re-fires "joined"). Also re-marks present if tracking is flipped on mid-call.
  useEffect(() => {
    if (!open || !active) return;
    const hb = setInterval(() => { menteeApi.joinReview(active.sessionId).catch(() => {}); }, 15_000);
    return () => clearInterval(hb);
  }, [open, active]);
  // Leaving can be triggered twice (closing the panel AND Jitsi's own
  // videoConferenceLeft) — report it once so presence isn't double-counted.
  const onLeft = async () => {
    if (!active || leavingRef.current) { setOpen(false); return; }
    leavingRef.current = true;
    const secs = joinedAtRef.current ? Math.round((Date.now() - joinedAtRef.current) / 1000) : 0;
    joinedAtRef.current = null;
    setOpen(false);
    try { await menteeApi.leaveReview(active.sessionId, secs); } catch { /* best-effort */ }
  };

  if (!active) return null;
  const isDismissed = dismissed === active.sessionId;

  return (
    <>
      {!open && !isDismissed && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand-600" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-900">Live review in {active.clanName}</p>
            <p className="text-xs text-slate-500">Your mentor started the cohort review — hop in.</p>
          </div>
          <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-700">
            <Video className="h-4 w-4" /> Join review
          </button>
          <button onClick={() => setDismissed(active.sessionId)} aria-label="Dismiss" className="p-1.5 text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3" onClick={() => onLeft()}>
          <div className="flex h-[80vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200">
              <p className="text-sm font-medium text-slate-900">Cohort review · {active.clanName}</p>
              <div className="flex items-center gap-2">
                {active.externalUrl && (
                  <a href={active.externalUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-brand-700">
                    <ExternalLink className="h-3.5 w-3.5" /> Trouble? Open backup link
                  </a>
                )}
                <button onClick={() => onLeft()} className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100">Leave</button>
              </div>
            </div>
            <div className="flex-1">
              <JitsiRoom
                domain={active.domain}
                room={active.room}
                displayName={active.displayName}
                onJoined={onJoined}
                onLeft={onLeft}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
