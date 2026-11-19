'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { screenShareSupported } from '@/lib/proctoring/media';

/* eslint-disable @typescript-eslint/no-explicit-any */

export type ScreenShareProblem =
  /** The browser can't share a screen at all (every phone, some old browsers). */
  | 'unsupported'
  /** They closed the picker or blocked it. */
  | 'denied'
  /** They picked a tab or one window — the rest of the screen stays hidden. */
  | 'not_entire_screen';

export interface ScreenShare {
  stream: MediaStream | null;
  /** Sharing right now. Goes false the moment they press "Stop sharing". */
  live: boolean;
  problem: ScreenShareProblem | null;
  busy: boolean;
  supported: boolean;
  /** Ask for the screen. Must run inside a click (the browser insists). */
  start: () => Promise<boolean>;
  stop: () => void;
}

/**
 * The candidate's whole screen, for proctoring.
 *
 * Only the entire screen counts: a single tab or window would let everything
 * else on the machine go unseen, so a share of anything smaller is stopped and
 * reported as `not_entire_screen` for the runner to ask again. Browsers that
 * don't say what was picked are trusted (the snapshots show it either way).
 *
 * `onEvent` lands in the proctor log: a wrong pick, a stop, and a second
 * monitor plugged in (which a single-screen share can't see).
 */
export function useScreenShare(onEvent?: (type: string, meta?: Record<string, unknown>) => void): ScreenShare {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [live, setLive] = useState(false);
  const [problem, setProblem] = useState<ScreenShareProblem | null>(null);
  const [busy, setBusy] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const eventRef = useRef(onEvent);
  useEffect(() => { eventRef.current = onEvent; }, [onEvent]);
  const supported = screenShareSupported();

  const release = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    if (!screenShareSupported()) { setProblem('unsupported'); return false; }
    setBusy(true);
    try {
      const next = await navigator.mediaDevices.getDisplayMedia({
        // A still every half minute needs very few frames; keep it light.
        video: { displaySurface: 'monitor', frameRate: { max: 5 } },
        audio: false,
        // Chrome/Edge hints: offer whole screens, and don't let them switch the
        // share to a tab later from the sharing bar.
        monitorTypeSurfaces: 'include',
        surfaceSwitching: 'exclude',
        selfBrowserSurface: 'exclude',
      } as any);
      const track = next.getVideoTracks()[0];
      if (!track) { next.getTracks().forEach((t) => t.stop()); setProblem('denied'); return false; }
      const surface = (track.getSettings() as any).displaySurface as string | undefined;
      if (surface && surface !== 'monitor') {
        next.getTracks().forEach((t) => t.stop());
        eventRef.current?.('screen_share_wrong_surface', { surface });
        setProblem('not_entire_screen');
        return false;
      }
      release();
      track.addEventListener('ended', () => {
        if (streamRef.current !== next) return; // an older share we already replaced
        setLive(false);
        eventRef.current?.('screen_share_stopped');
      });
      streamRef.current = next;
      setStream(next);
      setLive(true);
      setProblem(null);
      if ((window.screen as any)?.isExtended) eventRef.current?.('multiple_monitors');
      return true;
    } catch {
      setProblem('denied');
      return false;
    } finally {
      setBusy(false);
    }
  }, [release]);

  const stop = useCallback(() => {
    release();
    setStream(null);
    setLive(false);
  }, [release]);

  useEffect(() => () => release(), [release]);

  return { stream, live, problem, busy, supported, start, stop };
}
