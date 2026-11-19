'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { grabFrame, randomDelay } from '@/lib/proctoring/media';
import type { ProctorEvent, ProctorTransport } from '@/lib/proctoring/types';

/**
 * useProctor — watches one proctored attempt (all client-side, zero cost).
 *
 * While `active`, it:
 *   - keeps the page fullscreen: `required` locks Esc where the browser allows
 *     it and reports `fullscreenBlocked` so the host can cover the questions
 *     until they're back; `track` only logs; `off` ignores fullscreen,
 *   - counts tab/window focus losses (visibility + blur),
 *   - blocks & logs copy and right-click,
 *   - captures camera and screen snapshots at random moments, and the screen
 *     right away when they leave the tab or window,
 *   - notices the connection dropping and coming back, and logs both,
 *   - logs every time the attempt is opened, so a resume after a crash, a
 *     closed tab or a power cut shows up (with how long they were away when
 *     it's the same device),
 * and buffers every event, flushing to the host on an interval and on demand.
 * Unsent events are kept on the device, so a crash or power cut loses nothing:
 * they're sent the next time the attempt opens.
 *
 * The hook knows nothing about any host: where events and snapshots go is the
 * `transport` the host passes in.
 */
export type FullscreenMode = 'required' | 'track' | 'off';

export interface ProctorState {
  focusLosses: number;
  isFullscreen: boolean;
  /** Fullscreen is required and they've left it: cover the questions until they're back. */
  fullscreenBlocked: boolean;
  /** The browser can't (or won't) go fullscreen; the attempt carries on and it's noted. */
  fullscreenUnavailable: boolean;
  /** For a camera-required attempt: is a live camera frame currently available? */
  cameraLive: boolean;
  /** The device's connection, as the browser reports it. */
  online: boolean;
  totalEvents: number;
  /** Ask for fullscreen (call it from a click). Resolves true once fullscreen. */
  requestFullscreen: () => Promise<boolean>;
  /** Their browser won't go fullscreen even when asked: let them carry on, flagged. */
  continueWithoutFullscreen: () => void;
  log: (type: string, meta?: Record<string, unknown>) => void;
  flush: () => Promise<void>;
  /** Take a camera and a screen snapshot now (e.g. as a video answer starts and ends). */
  captureNow: (reason?: string) => void;
}

interface Options {
  /** Identifies the attempt to the host (a session id, a private link's token). */
  sessionId: string | null;
  active: boolean;
  /** Where events and snapshots go. */
  transport: ProctorTransport;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  cameraRequired: boolean;
  /** Id of the question on screen — stamped onto each snapshot and event. */
  currentQuestionId?: string | null;
  /** Take camera snapshots (defaults to cameraRequired). */
  cameraSnapshots?: boolean;
  /** The shared screen, when the attempt is proctored with screen sharing. */
  screenStream?: MediaStream | null;
  /** Default `track`. */
  fullscreen?: FullscreenMode;
  /** Average gap between snapshots; each one lands at a random point around it. */
  snapshotIntervalMs?: number;
  flushIntervalMs?: number;
}

// ── Kept on the device: unsent events, and when the attempt was last seen ─────
const PENDING = (id: string) => `pathment.proctor.${id}.pending`;
const SEEN = (id: string) => `pathment.proctor.${id}.seen`;
const read = <T,>(key: string, fallback: T): T => {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
};
const write = (key: string, value: unknown) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked: memory still has it */ }
};
/** At most this many unsent events are kept on the device. */
const MAX_PENDING = 500;

type KeyboardLock = { lock?: (keys?: string[]) => Promise<void>; unlock?: () => void };
const keyboard = (): KeyboardLock | undefined =>
  (typeof navigator !== 'undefined' ? (navigator as Navigator & { keyboard?: KeyboardLock }).keyboard : undefined);

export function useProctor({
  sessionId,
  active,
  transport,
  videoRef,
  cameraRequired,
  currentQuestionId = null,
  cameraSnapshots,
  screenStream = null,
  fullscreen = 'track',
  snapshotIntervalMs = 25000,
  flushIntervalMs = 10000,
}: Options): ProctorState {
  const takeCameraShots = cameraSnapshots ?? cameraRequired;
  const [focusLosses, setFocusLosses] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Until the first read after going active, "not fullscreen" is unknown, not a fact.
  const [fullscreenKnown, setFullscreenKnown] = useState(false);
  const [fullscreenUnavailable, setFullscreenUnavailable] = useState(false);
  const [cameraLive, setCameraLive] = useState(true);
  const [online, setOnline] = useState(true);
  const [totalEvents, setTotalEvents] = useState(0);

  const buffer = useRef<ProctorEvent[]>([]);
  const sessionRef = useRef(sessionId);
  const activeRef = useRef(active);
  const questionRef = useRef(currentQuestionId);
  useEffect(() => { sessionRef.current = sessionId; }, [sessionId]);
  useEffect(() => { activeRef.current = active; }, [active]);
  useEffect(() => { questionRef.current = currentQuestionId; }, [currentQuestionId]);
  const transportRef = useRef(transport);
  useEffect(() => { transportRef.current = transport; }, [transport]);

  // ── Event buffering + flush ──────────────────────────────────────────────
  const persist = useCallback(() => {
    const sid = sessionRef.current;
    if (sid) write(PENDING(sid), buffer.current.slice(-MAX_PENDING));
  }, []);

  const flushing = useRef(false);
  const flush = useCallback(async () => {
    const sid = sessionRef.current;
    if (!sid || buffer.current.length === 0 || flushing.current) return;
    flushing.current = true;
    const batch = buffer.current;
    buffer.current = [];
    try {
      await transportRef.current.logProctor(sid, batch);
    } catch {
      // Keep them (in memory and on the device) and try again later.
      buffer.current = [...batch, ...buffer.current];
    } finally {
      flushing.current = false;
      persist();
    }
  }, [persist]);

  const log = useCallback((type: string, meta: Record<string, unknown> = {}) => {
    const q = questionRef.current;
    buffer.current.push({ type, at: new Date().toISOString(), meta: q && meta.questionId === undefined ? { ...meta, questionId: q } : meta });
    setTotalEvents((n) => n + 1);
    persist();
  }, [persist]);

  // Anything left unsent last time (a crash, a power cut) goes first.
  useEffect(() => {
    if (!sessionId) return;
    const left = read<ProctorEvent[]>(PENDING(sessionId), []);
    if (left.length) buffer.current = [...left, ...buffer.current];
  }, [sessionId]);

  // ── Opened / resumed ───────────────────────────────────────────────────────
  // Every opening is logged; more than one means they came back (after a crash,
  // a closed tab, a lost connection or a power cut). On the same device we also
  // know how long they were gone.
  useEffect(() => {
    if (!active || !sessionId) return;
    const seen = read<number | null>(SEEN(sessionId), null);
    log('attempt_opened', seen ? { awayMs: Math.max(0, Date.now() - seen), sameDevice: true } : {});
    const beat = () => write(SEEN(sessionId), Date.now());
    beat();
    const id = setInterval(beat, 5000);
    return () => clearInterval(id);
  }, [active, sessionId, log]);

  // ── Connection ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!active) return;
    let lostAt: number | null = navigator.onLine === false ? Date.now() : null;
    const sync = requestAnimationFrame(() => setOnline(navigator.onLine !== false));
    const onOffline = () => {
      lostAt = Date.now();
      setOnline(false);
      log('connection_lost');
    };
    const onOnline = () => {
      setOnline(true);
      log('connection_restored', lostAt ? { downMs: Date.now() - lostAt } : {});
      lostAt = null;
      void flush();
    };
    // Leaving the page (closing, reloading, a crash we can see coming): try to send now.
    const onPageHide = () => { persist(); void flush(); };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      cancelAnimationFrame(sync);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [active, log, flush, persist]);

  // ── Fullscreen ────────────────────────────────────────────────────────────
  const lockEscape = useCallback(() => {
    // Chrome and Edge: Esc no longer leaves fullscreen (they must press and hold it).
    if (fullscreen === 'required') keyboard()?.lock?.(['Escape']).catch(() => { });
  }, [fullscreen]);

  const requestFullscreen = useCallback(async (): Promise<boolean> => {
    if (fullscreen === 'off') return false;
    if (document.fullscreenElement) { lockEscape(); return true; }
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
    if (!document.fullscreenEnabled && !el.webkitRequestFullscreen) {
      setFullscreenUnavailable(true);
      log('fullscreen_unavailable', { reason: 'unsupported' });
      return false;
    }
    try {
      const asked = el.requestFullscreen ? el.requestFullscreen() : el.webkitRequestFullscreen?.();
      // Never let fullscreen hold up the attempt: a browser that neither grants
      // nor refuses would otherwise leave the candidate stuck before the start.
      await Promise.race([asked, new Promise((resolve) => setTimeout(resolve, 1200))]);
    } catch {
      // Refused outright (a policy, an embedded page): carry on, and say so.
      setFullscreenUnavailable(true);
      log('fullscreen_unavailable', { reason: 'refused' });
      return false;
    }
    const ok = !!document.fullscreenElement;
    if (ok) lockEscape();
    return ok;
  }, [fullscreen, lockEscape, log]);

  // ── DOM listeners while active ──────────────────────────────────────────────
  useEffect(() => {
    if (!active) return;
    // Fullscreen is asked for by the Start click, before the attempt is active
    // and these listeners exist, so its change event can come and go unheard.
    // Read where we are now (next frame) rather than waiting for the next change.
    const syncFrame = requestAnimationFrame(() => {
      const fs = !!document.fullscreenElement;
      setIsFullscreen(fs);
      setFullscreenKnown(true);
      if (fs) lockEscape();
    });
    let leftAt: number | null = null;

    const onVisibility = () => {
      if (document.hidden) { setFocusLosses((n) => n + 1); log('focus_loss', { reason: 'tab_hidden' }); }
    };
    const onBlur = () => {
      // Ignore blur that coincides with going fullscreen; only count real leaves.
      if (!document.hidden) log('window_blur');
    };
    const onFullscreenChange = () => {
      const fs = !!document.fullscreenElement;
      setIsFullscreen(fs);
      if (fullscreen === 'off') return;
      if (!fs) {
        leftAt = Date.now();
        log('fullscreen_exit');
        keyboard()?.unlock?.();
      } else {
        if (leftAt) log('fullscreen_restored', { awayMs: Date.now() - leftAt });
        leftAt = null;
        lockEscape();
      }
    };
    const onCopy = (e: ClipboardEvent) => { e.preventDefault(); log('copy_blocked'); };
    const onContextMenu = (e: MouseEvent) => { e.preventDefault(); log('context_menu_blocked'); };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('copy', onCopy);
    document.addEventListener('contextmenu', onContextMenu);

    return () => {
      cancelAnimationFrame(syncFrame);
      keyboard()?.unlock?.();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('contextmenu', onContextMenu);
    };
  }, [active, log, fullscreen, lockEscape]);

  // ── Never went fullscreen ───────────────────────────────────────────────────
  // Leaving fullscreen is logged when it happens; never entering it is not an
  // event at all, so it's checked once, a moment after the attempt starts.
  useEffect(() => {
    if (!active || fullscreen === 'off') return;
    const id = setTimeout(() => { if (!document.fullscreenElement) log('not_fullscreen'); }, 4000);
    return () => clearTimeout(id);
  }, [active, fullscreen, log]);

  // ── Periodic flush ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => { flush(); }, flushIntervalMs);
    return () => { clearInterval(id); flush(); };
  }, [active, flushIntervalMs, flush]);

  // ── Required-camera health ───────────────────────────────────────────────
  // Detect a camera that was allowed at the start but then turned off / covered /
  // disconnected mid-attempt (browser controls, OS, unplug). The track goes
  // `muted` or `ended` — we surface that so the host can block & warn instead of
  // silently recording black frames.
  useEffect(() => {
    if (!active || !cameraRequired) { setCameraLive(true); return; }
    let down = false;
    // The preview is attached a moment after the attempt goes live; until a
    // stream has been seen there is nothing to judge, not a camera that's off.
    let seen = false;
    const evaluate = () => {
      const stream = videoRef.current?.srcObject as MediaStream | null;
      const track = stream?.getVideoTracks?.()[0] || null;
      if (!track && !seen) return;
      seen = true;
      const live = !!track && track.readyState === 'live' && track.enabled && !track.muted;
      setCameraLive(live);
      if (!live && !down) { down = true; log('camera_off'); }
      else if (live && down) { down = false; log('camera_restored'); }
    };
    evaluate();
    const id = setInterval(evaluate, 1000);
    return () => clearInterval(id);
  }, [active, cameraRequired, videoRef, log]);

  // ── Snapshots: camera and screen, at moments nobody can predict ─────────────
  // The screen is read through a hidden <video> fed by the share; it never
  // touches the page, so the candidate doesn't see a second preview.
  const screenVideo = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (!screenStream) { screenVideo.current = null; return; }
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.srcObject = screenStream;
    v.play().catch(() => { });
    screenVideo.current = v;
    return () => { v.pause(); v.srcObject = null; if (screenVideo.current === v) screenVideo.current = null; };
  }, [screenStream]);

  const shoot = useCallback(async (source: 'camera' | 'screen', reason?: string) => {
    const sid = sessionRef.current;
    if (!sid || !activeRef.current) return;
    const video = source === 'camera' ? videoRef.current : screenVideo.current;
    // A screen is shot larger than a face so code on it stays legible.
    const blob = await grabFrame(video, source === 'screen' ? 1600 : 960, source === 'screen' ? 0.7 : 0.6);
    if (!blob) return;
    try {
      await transportRef.current.uploadSnapshot(sid, blob, questionRef.current, source);
    } catch {
      // Offline, a snapshot is simply skipped (and noted); the next one is on its way.
      log('snapshot_failed', { source, ...(reason ? { reason } : {}) });
    }
  }, [videoRef, log]);

  const captureNow = useCallback((reason?: string) => {
    if (takeCameraShots) void shoot('camera', reason);
    if (screenVideo.current) void shoot('screen', reason);
  }, [takeCameraShots, shoot]);

  // Each source on its own random rhythm: a fixed interval is a schedule a
  // candidate can learn and work around.
  const randomLoop = useCallback((source: 'camera' | 'screen', firstMs: number) => {
    let timer: ReturnType<typeof setTimeout>;
    const next = (ms: number) => {
      timer = setTimeout(async () => {
        await shoot(source);
        next(randomDelay(snapshotIntervalMs * 0.5, snapshotIntervalMs * 1.5));
      }, ms);
    };
    next(firstMs);
    return () => clearTimeout(timer);
  }, [shoot, snapshotIntervalMs]);

  useEffect(() => {
    if (!active || !takeCameraShots) return;
    return randomLoop('camera', randomDelay(2000, 6000));
  }, [active, takeCameraShots, randomLoop]);

  useEffect(() => {
    if (!active || !screenStream) return;
    return randomLoop('screen', randomDelay(3000, 9000));
  }, [active, screenStream, randomLoop]);

  // Leaving the tab or window is the moment the screen matters most: take it
  // right away, and again a moment later once they've landed somewhere.
  useEffect(() => {
    if (!active || !screenStream) return;
    let later: ReturnType<typeof setTimeout> | null = null;
    const onLeave = () => {
      void shoot('screen', 'left_page');
      if (later) clearTimeout(later);
      later = setTimeout(() => { void shoot('screen', 'left_page'); }, 2500);
    };
    const onVisibility = () => { if (document.hidden) onLeave(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onLeave);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onLeave);
      if (later) clearTimeout(later);
    };
  }, [active, screenStream, shoot]);

  const continueWithoutFullscreen = useCallback(() => {
    setFullscreenUnavailable(true);
    log('fullscreen_unavailable', { reason: 'could_not_enter' });
  }, [log]);

  const fullscreenBlocked = active && fullscreen === 'required' && fullscreenKnown && !isFullscreen && !fullscreenUnavailable;

  return {
    focusLosses, isFullscreen, fullscreenBlocked, fullscreenUnavailable, cameraLive, online, totalEvents,
    requestFullscreen, continueWithoutFullscreen, log, flush, captureNow,
  };
}
