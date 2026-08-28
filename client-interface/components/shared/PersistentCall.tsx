'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUpLeft, Maximize2, Minimize2, PhoneOff } from 'lucide-react';
import { JitsiRoom, type JitsiParticipant } from '@/components/shared/JitsiRoom';
import type { CallSpec } from '@/lib/context/CallContext';

/**
 * The one on-screen home for a live call. Rendered by CallProvider — i.e. above
 * the router — so navigating never unmounts the Jitsi iframe.
 *
 * Two presentations, ONE mounted iframe (the whole point: remounting is what
 * dropped the mentor from their own call and left a ghost behind):
 *   - docked: absolutely positioned over the placeholder a page registered, so
 *     on /mentor/review it looks exactly as embedded as it did before
 *   - floating: a corner window with its own header, for every other screen
 *
 * Switching between the two only changes this wrapper's geometry.
 */
export function PersistentCall({
  call, reloadKey, dockedTo, minimized, onMinimize, onEnd,
  onJoined, onParticipantJoined, onDominantSpeaker, onSelfDominantChange,
}: {
  call: CallSpec;
  reloadKey: number;
  dockedTo: HTMLElement | null;
  minimized: boolean;
  onMinimize: (v: boolean) => void;
  onEnd: () => void;
  onJoined?: () => void;
  onParticipantJoined?: (p: JitsiParticipant) => void;
  onDominantSpeaker?: (id: string) => void;
  onSelfDominantChange?: (speaking: boolean) => void;
}) {
  const router = useRouter();
  const [rect, setRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  // Track the dock placeholder's geometry. A fixed overlay has to be told where
  // its target is, and that target moves with scroll, resize, sidebar collapse
  // and any layout shift on the page — hence the observers AND a slow poll as a
  // catch-all for shifts nothing notifies us about.
  useEffect(() => {
    // No dock: leave any previous rect alone. It can't be used, because `isDocked`
    // below requires a live `dockedTo` as well — and clearing it here would be a
    // synchronous setState in an effect for no gain.
    if (!dockedTo) return;
    const sync = () => {
      const r = dockedTo.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    sync();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(sync) : null;
    ro?.observe(dockedTo);
    // `true` = capture, so scrolling ANY ancestor container repositions us.
    window.addEventListener('scroll', sync, true);
    window.addEventListener('resize', sync);
    const poll = setInterval(sync, 500);
    return () => {
      ro?.disconnect();
      window.removeEventListener('scroll', sync, true);
      window.removeEventListener('resize', sync);
      clearInterval(poll);
    };
  }, [dockedTo]);

  const isDocked = Boolean(dockedTo && rect);
  const floatSize = minimized ? 'w-[260px] h-[168px]' : 'w-[380px] h-[280px] sm:w-[440px] sm:h-[300px]';

  return (
    <div
      // Docked sits under page chrome; floating sits above content but below
      // modals (the contribution modal is z-[60]).
      className={
        isDocked
          ? 'fixed z-30'
          : `fixed bottom-4 right-4 z-40 ${floatSize} rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden flex flex-col`
      }
      style={isDocked && rect ? { top: rect.top, left: rect.left, width: rect.width, height: rect.height } : undefined}
    >
      {!isDocked && (
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 shrink-0">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
          </span>
          <p className="text-[11px] font-medium text-white truncate flex-1">{call.title}</p>
          <button
            onClick={() => router.push(call.returnHref)}
            title="Back to the review"
            className="p-1 rounded text-slate-300 hover:text-white hover:bg-white/10"
          >
            <ArrowUpLeft className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onMinimize(!minimized)}
            title={minimized ? 'Expand' : 'Shrink'}
            className="p-1 rounded text-slate-300 hover:text-white hover:bg-white/10"
          >
            {minimized ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={onEnd}
            title={call.role === 'host' ? 'End & score' : 'Leave the call'}
            className="p-1 rounded text-red-300 hover:text-white hover:bg-red-500/30"
          >
            <PhoneOff className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className={isDocked ? 'w-full h-full' : 'flex-1 min-h-0'}>
        <JitsiRoom
          key={reloadKey}
          domain={call.domain}
          room={call.room}
          displayName={call.displayName}
          avatarUrl={call.avatarUrl}
          role={call.role}
          privateChat={call.privateChat}
          polls={call.polls}
          startWithVideoMuted={call.startWithVideoMuted}
          onJoined={onJoined}
          onParticipantJoined={onParticipantJoined}
          onDominantSpeaker={onDominantSpeaker}
          onSelfDominantChange={onSelfDominantChange}
          // The user hung up inside Jitsi's own toolbar — treat it exactly like
          // pressing our End/Leave button. This is the ONLY path (besides those
          // buttons) that may end a call; navigation no longer reaches it.
          onReadyToClose={onEnd}
        />
      </div>
    </div>
  );
}
