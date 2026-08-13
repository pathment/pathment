'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Video, X, ExternalLink } from 'lucide-react';
import { menteeApi } from '@/lib/services/mentee-api';
import { getSocket } from '@/lib/services/socket-client';
import { useCall } from '@/lib/context/CallContext';

interface ActiveReview {
  sessionId: string;
  domain: string; room: string; url: string;
  displayName: string | null; clanName: string; externalUrl: string | null; avatarUrl: string | null;
  pollsEnabled?: boolean;
}

/**
 * Live cohort-review bar for mentees. Polls for an active review in their clan;
 * when one is live, a banner offers to join.
 *
 * The call itself belongs to CallProvider, not to this bar — a mentee who opens
 * their tasks mid-review used to drop out of the call the moment the route
 * changed (this bar lives in the mentee layout, so it survived mentee→mentee
 * navigation but nothing else). Presence heartbeat and talk-time reporting moved
 * to the provider for the same reason. Leaving is now an explicit act.
 */
export function ReviewJoinBar() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [active, setActive] = useState<ActiveReview | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const autoJoinedRef = useRef(false);

  const { startCall, updateCall, call, leaveGuestCall, registerDock, isLive } = useCall();
  const inCall = isLive(active?.sessionId);

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

  const join = useCallback((review: ActiveReview) => {
    startCall({
      sessionId: review.sessionId,
      domain: review.domain,
      room: review.room,
      displayName: review.displayName,
      avatarUrl: review.avatarUrl,
      role: 'guest',
      title: `Review · ${review.clanName}`,
      returnHref: '/mentee/dashboard',
      polls: !!review.pollsEnabled,
      externalUrl: review.externalUrl,
    });
  }, [startCall]);

  // Deep-link from the "Join review" notification (`?join=review`): the moment the
  // active review loads, join directly instead of just landing on the dashboard.
  // Fires once, then strips the param so a refresh doesn't re-join.
  useEffect(() => {
    if (autoJoinedRef.current || searchParams.get('join') !== 'review' || !active) return;
    autoJoinedRef.current = true;
    setDismissed(null);
    join(active);
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    params.delete('join');
    router.replace(`${pathname}${params.toString() ? `?${params.toString()}` : ''}`, { scroll: false });
  }, [active, searchParams, router, pathname, join]);

  // Follow the session to its current room.
  //
  // A new call gets a NEW room (reviewMeetingService._needsFreshRoom) so it can't
  // inherit the previous call's ghosts. A mentee who never pressed Leave would
  // otherwise still be sitting in the old, now-empty room while the mentor talks
  // in the new one. Same session, different room → move them across; JitsiRoom
  // leaves the old room properly on the way out.
  useEffect(() => {
    if (!inCall || !active?.room || !call || call.sessionId !== active.sessionId) return;
    if (call.room === active.room) return;
    updateCall({ room: active.room, polls: !!active.pollsEnabled });
  }, [inCall, active, call, updateCall]);

  // While the mentee is on a page that shows this bar, give the call a big home
  // to dock into; navigating elsewhere releases it to the floating window.
  const dockCb = useCallback((el: HTMLDivElement | null) => registerDock(el), [registerDock]);

  if (!active) return null;
  const isDismissed = dismissed === active.sessionId;

  return (
    <>
      {!inCall && !isDismissed && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand-600" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-900">Live review in {active.clanName}</p>
            <p className="text-xs text-slate-500">Your mentor started the clan review — hop in.</p>
          </div>
          <button onClick={() => join(active)} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-700">
            <Video className="h-4 w-4" /> Join review
          </button>
          <button onClick={() => setDismissed(active.sessionId)} aria-label="Dismiss" className="p-1.5 text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
        </div>
      )}

      {inCall && (
        // In-call, on a mentee page: a docked panel. No backdrop and no
        // click-outside-to-leave — leaving the call is a deliberate act now, and
        // a stray click on the page behind used to end it.
        <div className="mb-4 overflow-hidden rounded-2xl border border-slate-200 bg-card shadow-sm">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200">
            <p className="text-sm font-medium text-slate-900">Clan review · {active.clanName}</p>
            <div className="flex items-center gap-2">
              {active.externalUrl && (
                <a href={active.externalUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-brand-700">
                  <ExternalLink className="h-3.5 w-3.5" /> Trouble? Open backup link
                </a>
              )}
              <button onClick={() => leaveGuestCall()} className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100">Leave</button>
            </div>
          </div>
          {/* Placeholder: CallProvider renders the video over this box. */}
          <div ref={dockCb} className="h-[64vh] min-h-[420px] bg-slate-900" />
        </div>
      )}
    </>
  );
}
