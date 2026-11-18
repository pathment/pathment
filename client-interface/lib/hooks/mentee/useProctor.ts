'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { interviewProctorApi, type ProctorApi, type ProctorEvent } from '@/lib/services/interview-api';
import { grabFrame, randomDelay } from '@/lib/utils/interviewMedia';

/**
 * useProctor — the interview anti-cheat harness (all client-side, zero cost).
 * While `active`, it:
 *   - locks the page to fullscreen and flags any exit,
 *   - counts tab/window focus losses (visibility + blur),
 *   - blocks & logs copy / paste / right-click,
 *   - captures webcam snapshots at random moments (when a camera stream is provided),
 *   - captures the shared screen at random moments, and right away when they
 *     leave the tab or window (so the mentor sees where they went),
 * and buffers every event, flushing to the server on an interval and on demand.
 * The mentor sees the resulting proctor log in review (Phase 4).
 */
export interface ProctorState {
  focusLosses: number;
  isFullscreen: boolean;
  /** For a camera-required interview: is a live camera frame currently available?
   *  Goes false when the candidate turns the camera off / it disconnects mid-run. */
  cameraLive: boolean;
  totalEvents: number;
  requestFullscreen: () => Promise<void>;
  log: (type: string, meta?: Record<string, unknown>) => void;
  flush: () => Promise<void>;
  /** Take a camera and a screen snapshot now (e.g. as a video answer starts and ends). */
  captureNow: (reason?: string) => void;
}

interface Options {
  sessionId: string | null;
  active: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  cameraRequired: boolean;
  /** Id of the question on screen — stamped onto each snapshot so the mentor can
   *  see what the candidate was doing during a specific question. */
  currentQuestionId?: string | null;
  /** Take webcam snapshots (defaults to cameraRequired). Off for an unproctored
   *  interview that only has the camera on for its video answers. */
  cameraSnapshots?: boolean;
  /** The shared screen, when the interview is proctored with screen sharing. */
  screenStream?: MediaStream | null;
  /** Where events and snapshots go: an interview's or a quiz's endpoints. */
  api?: ProctorApi;
  /** Average gap between snapshots; each one lands at a random point around it. */
  snapshotIntervalMs?: number;
  flushIntervalMs?: number;
}

export function useProctor({
  sessionId,
  active,
  videoRef,
  cameraRequired,
  currentQuestionId = null,
  cameraSnapshots,
  screenStream = null,
  api = interviewProctorApi,
  snapshotIntervalMs = 25000,
  flushIntervalMs = 10000,
}: Options): ProctorState {
  const takeCameraShots = cameraSnapshots ?? cameraRequired;
  const [focusLosses, setFocusLosses] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [cameraLive, setCameraLive] = useState(true);
  const [totalEvents, setTotalEvents] = useState(0);

  const buffer = useRef<ProctorEvent[]>([]);
  const sessionRef = useRef(sessionId);
  const activeRef = useRef(active);
  const questionRef = useRef(currentQuestionId);
  useEffect(() => { sessionRef.current = sessionId; }, [sessionId]);
  useEffect(() => { activeRef.current = active; }, [active]);
  useEffect(() => { questionRef.current = currentQuestionId; }, [currentQuestionId]);
  const apiRef = useRef(api);
  useEffect(() => { apiRef.current = api; }, [api]);

  // ── Event buffering + flush ──────────────────────────────────────────────
  const flush = useCallback(async () => {
    const sid = sessionRef.current;
    if (!sid || buffer.current.length === 0) return;
    const batch = buffer.current;
    buffer.current = [];
    try {
      await apiRef.current.logProctor(sid, batch);
    } catch {
      // Re-queue on failure so nothing is lost.
      buffer.current = [...batch, ...buffer.current];
    }
  }, []);

  const log = useCallback((type: string, meta: Record<string, unknown> = {}) => {
    buffer.current.push({ type, at: new Date().toISOString(), meta });
    setTotalEvents((n) => n + 1);
  }, []);

  // ── Fullscreen ────────────────────────────────────────────────────────────
  const requestFullscreen = useCallback(async () => {
    try {
      const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
      const asked = el.requestFullscreen ? el.requestFullscreen() : el.webkitRequestFullscreen?.();
      // Never let fullscreen hold up the attempt: a browser that neither grants
      // nor refuses would otherwise leave the candidate stuck before the start.
      // Not being fullscreen is shown (and logged) by the exit banner instead.
      await Promise.race([asked, new Promise((resolve) => setTimeout(resolve, 1200))]);
    } catch {
      /* user may deny; the exit banner handles it */
    }
  }, []);

  // ── DOM listeners while active ──────────────────────────────────────────────
  useEffect(() => {
    if (!active) return;

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
      if (!fs) log('fullscreen_exit');
    };
    const onCopy = (e: ClipboardEvent) => { e.preventDefault(); log('copy_blocked'); };
    const onContextMenu = (e: MouseEvent) => { e.preventDefault(); log('context_menu_blocked'); };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('copy', onCopy);
    document.addEventListener('contextmenu', onContextMenu);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('contextmenu', onContextMenu);
    };
  }, [active, log]);

  // ── Never went fullscreen ───────────────────────────────────────────────────
  // Leaving fullscreen is logged when it happens; never entering it is not an
  // event at all, so it's checked once, a moment after the attempt starts.
  useEffect(() => {
    if (!active) return;
    const id = setTimeout(() => { if (!document.fullscreenElement) log('not_fullscreen'); }, 4000);
    return () => clearTimeout(id);
  }, [active, log]);

  // ── Periodic flush ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => { flush(); }, flushIntervalMs);
    return () => { clearInterval(id); flush(); };
  }, [active, flushIntervalMs, flush]);

  // ── Required-camera health ───────────────────────────────────────────────
  // Detect a camera that was allowed at the start but then turned off / covered /
  // disconnected mid-interview (browser controls, OS, unplug). The track goes
  // `muted` or `ended` — we surface that so the runner can block & warn instead of
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
      await apiRef.current.uploadSnapshot(sid, blob, questionRef.current, source);
    } catch {
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

  return { focusLosses, isFullscreen, cameraLive, totalEvents, requestFullscreen, log, flush, captureNow };
}
