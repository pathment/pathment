'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { mentorApi } from '@/lib/services/mentor-api';
import { menteeApi } from '@/lib/services/mentee-api';
import { PersistentCall } from '@/components/shared/PersistentCall';
import { ContributionModal, type ScoreRow } from '@/components/mentor/ContributionModal';

/**
 * The live review call, hoisted OUT of the page that starts it.
 *
 * It used to live inside ReviewMeetingPanel on /mentor/review. Next.js unmounts
 * a page on navigation, React ran JitsiRoom's cleanup, and the cleanup hangs up —
 * so opening a mentee's profile mid-review dropped the mentor out of their own
 * call. Worse, the immediate leave→rejoin when they came back is exactly the race
 * that leaves a ghost participant behind (you appear twice until the server times
 * the ghost out), and dominant-speaker tracking stopped while they were away, so
 * contribution points were under-counted.
 *
 * Now the call is owned here, above the router, and rendered into a fixed overlay:
 *   - on the review page it DOCKS over a placeholder and looks embedded as before
 *   - anywhere else it becomes a floating window you can keep talking through
 *   - it ends ONLY when the host ends it (or the guest leaves) — never on navigation
 *
 * Presence, talk-time accumulation and the flush timer live here too, for the same
 * reason: they have to outlive the page.
 */

export type CallRole = 'host' | 'guest';

export interface CallSpec {
  sessionId: string;
  domain: string;
  room: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  role: CallRole;
  /** Shown in the floating window's header. */
  title: string;
  /** Where "Back to review" sends the user. */
  returnHref: string;
  /** Host-only Jitsi knobs. Changing either rebuilds the room (Jitsi can't
   *  toggle them live), which is expected and survives navigation. */
  privateChat?: boolean;
  polls?: boolean;
  /** Backup join link, surfaced to a guest who can't get the embed working. */
  externalUrl?: string | null;
}

interface CallContextValue {
  call: CallSpec | null;
  /** True while a call for this session is up (any screen). */
  isLive: (sessionId?: string) => boolean;
  startCall: (spec: CallSpec) => void;
  updateCall: (patch: Partial<CallSpec>) => void;
  /** Rebuild the iframe (the "Reload video" affordance). */
  reloadCall: () => void;
  /** Host: end for everyone, then score. Guest: leave. Both are explicit acts. */
  endHostCall: () => Promise<void>;
  leaveGuestCall: () => Promise<void>;
  /** A page claims the call: it renders over `el` until the page unmounts. */
  registerDock: (el: HTMLElement | null) => void;
  /** Name→menteeId mapping needs the roster; the panel supplies it while mounted. */
  provideRoster: (rows: { menteeId: string; name: string }[]) => void;
  /** Increments when a host call ends, so the review page can refresh itself. */
  endedNonce: number;
  /**
   * Did WE end this session's call during this provider's lifetime?
   *
   * Read during render by anything that might re-adopt a live meeting. `endedNonce`
   * alone isn't enough: it lands as state, so a sibling effect that reacts to it
   * (setting `scored`) cannot stop another effect in the SAME pass from seeing the
   * stale value and rejoining the call we just ended. This is a ref, so it flips
   * synchronously and is true the instant the call ends.
   */
  wasEndedHere: (sessionId: string) => boolean;
  reloadKey: number;
  minimized: boolean;
  setMinimized: (v: boolean) => void;
  dockedTo: HTMLElement | null;
}

const CallCtx = createContext<CallContextValue | null>(null);

// Max seconds credited per continuous "dominant speaker" span. Jitsi keeps the
// last speaker dominant through silence, so an uncapped span counts the silence.
const SPEAK_SPAN_CAP = 15;

export function CallProvider({ children }: { children: React.ReactNode }) {
  const [call, setCall] = useState<CallSpec | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [minimized, setMinimized] = useState(false);
  const [dockedTo, setDockedTo] = useState<HTMLElement | null>(null);
  const [scoring, setScoring] = useState<{ sessionId: string; rows: ScoreRow[] } | null>(null);
  const [endedNonce, setEndedNonce] = useState(0);

  // ── host talk tracking (survives navigation) ──────────────────────────────
  const talkById = useRef<Map<string, number>>(new Map());
  const nameById = useRef<Map<string, string>>(new Map());
  const speakingId = useRef<string | null>(null);
  const speakingSince = useRef<number>(0);
  const rosterRef = useRef<{ menteeId: string; name: string }[]>([]);

  // ── guest presence tracking ───────────────────────────────────────────────
  const joinedAtRef = useRef<number | null>(null);
  const leavingRef = useRef(false);
  const guestTalkRef = useRef(0);
  const guestSpeakingSince = useRef<number | null>(null);

  // Ending is idempotent: Jitsi's own hangup and the End button can both fire.
  const endingRef = useRef(false);
  // Sessions whose call we ended here. Guards the review page's "re-adopt a live
  // meeting" effect against rejoining the room a beat after ending it.
  const endedHereRef = useRef<Set<string>>(new Set());
  // Read inside callbacks that must not close over a stale spec.
  const callRef = useRef<CallSpec | null>(null);
  useEffect(() => { callRef.current = call; }, [call]);

  const provideRoster = useCallback((rows: { menteeId: string; name: string }[]) => {
    if (rows.length) rosterRef.current = rows;
  }, []);

  const menteeIdForName = useCallback((name?: string) => {
    if (!name) return null;
    const n = name.trim().toLowerCase();
    return rosterRef.current.find((r) => r.name.trim().toLowerCase() === n)?.menteeId ?? null;
  }, []);

  /** Report closed spans plus the OPEN span (capped) without closing it. */
  const flushTalk = useCallback(async () => {
    const active = callRef.current;
    if (!active || active.role !== 'host') return;
    const items: { menteeId: string; seconds: number }[] = [];
    for (const [id, secs] of talkById.current.entries()) {
      let total = secs;
      if (speakingId.current === id && speakingSince.current) {
        total += Math.min(SPEAK_SPAN_CAP, (Date.now() - speakingSince.current) / 1000);
      }
      const menteeId = menteeIdForName(nameById.current.get(id));
      if (menteeId) items.push({ menteeId, seconds: Math.round(total) });
    }
    if (items.length) {
      try { await mentorApi.recordReviewTalkTime(active.sessionId, items); } catch { /* retry next flush */ }
    }
  }, [menteeIdForName]);

  // Periodic flush while a host call is up — on ANY screen, which is the point.
  useEffect(() => {
    if (!call || call.role !== 'host') return;
    const t = setInterval(flushTalk, 20_000);
    return () => clearInterval(t);
  }, [call, flushTalk]);

  // Reads refs only, so it is stable — which matters, because the heartbeat and
  // the leave path both depend on it.
  const guestTalk = useCallback(() => {
    const span = guestSpeakingSince.current ? Math.min(SPEAK_SPAN_CAP, (Date.now() - guestSpeakingSince.current) / 1000) : 0;
    return Math.round(guestTalkRef.current + span);
  }, []);

  // Guest presence heartbeat: keeps the mentor's "who is in the room right now"
  // fresh. Also survives navigation now, so browsing tasks mid-review no longer
  // makes a mentee look like they left.
  useEffect(() => {
    if (!call || call.role !== 'guest') return;
    const hb = setInterval(() => { menteeApi.joinReview(call.sessionId, guestTalk()).catch(() => {}); }, 15_000);
    return () => clearInterval(hb);
  }, [call, guestTalk]);

  const startCall = useCallback((spec: CallSpec) => {
    // Fresh call — reset every accumulator, and allow ending again.
    talkById.current.clear();
    nameById.current.clear();
    speakingId.current = null;
    speakingSince.current = 0;
    guestTalkRef.current = 0;
    guestSpeakingSince.current = null;
    joinedAtRef.current = null;
    leavingRef.current = false;
    endingRef.current = false;
    // Deliberately starting this session again clears the "we ended it" mark.
    endedHereRef.current.delete(spec.sessionId);
    setMinimized(false);
    setCall(spec);
  }, []);

  const wasEndedHere = useCallback((sessionId: string) => endedHereRef.current.has(sessionId), []);

  const updateCall = useCallback((patch: Partial<CallSpec>) => {
    setCall((c) => (c ? { ...c, ...patch } : c));
  }, []);

  const reloadCall = useCallback(() => setReloadKey((k) => k + 1), []);

  const endHostCall = useCallback(async () => {
    const active = callRef.current;
    if (!active || endingRef.current) return;
    endingRef.current = true;
    // Marked BEFORE the awaits: the review page must not re-adopt this meeting at
    // any point between "the host pressed End" and the server confirming the end.
    endedHereRef.current.add(active.sessionId);
    try {
      await flushTalk();
      await mentorApi.endReviewMeeting(active.sessionId); // also finishes the session
      const res = await mentorApi.proposeReviewContribution(active.sessionId) as { data?: { proposed: ScoreRow[] } };
      setCall(null); // tears the iframe down cleanly, once, on purpose
      setDockedTo(null);
      setScoring({ sessionId: active.sessionId, rows: res?.data?.proposed ?? [] });
      setEndedNonce((n) => n + 1);
    } catch {
      toast.error('Could not end the meeting');
      endingRef.current = false;
      endedHereRef.current.delete(active.sessionId);
    }
  }, [flushTalk]);

  const leaveGuestCall = useCallback(async () => {
    const active = callRef.current;
    if (!active || leavingRef.current) { setCall(null); return; }
    leavingRef.current = true;
    const secs = joinedAtRef.current ? Math.round((Date.now() - joinedAtRef.current) / 1000) : 0;
    joinedAtRef.current = null;
    const talk = guestTalk();
    setCall(null);
    setDockedTo(null);
    guestSpeakingSince.current = null;
    try { await menteeApi.joinReview(active.sessionId, talk); } catch { /* best-effort */ }
    try { await menteeApi.leaveReview(active.sessionId, secs); } catch { /* best-effort */ }
  }, [guestTalk]);

  const registerDock = useCallback((el: HTMLElement | null) => {
    // A page unmounting clears only its OWN dock claim: `el` is null and we drop
    // whatever we had, which floats the call rather than ending it.
    setDockedTo(el);
  }, []);

  const isLive = useCallback((sessionId?: string) => {
    if (!call) return false;
    return sessionId ? call.sessionId === sessionId : true;
  }, [call]);

  // ── Jitsi event handlers (stable; read the live spec through refs) ─────────
  const onParticipant = useCallback((p: { id: string; displayName?: string }) => {
    if (p.displayName) nameById.current.set(p.id, p.displayName);
  }, []);

  const onDominant = useCallback((id: string) => {
    if (speakingId.current && speakingId.current !== id && speakingSince.current) {
      const add = Math.min(SPEAK_SPAN_CAP, (Date.now() - speakingSince.current) / 1000);
      talkById.current.set(speakingId.current, (talkById.current.get(speakingId.current) || 0) + Math.max(0, add));
    }
    if (!talkById.current.has(id)) talkById.current.set(id, 0);
    speakingId.current = id;
    speakingSince.current = Date.now();
  }, []);

  const onSelfDominant = useCallback((speaking: boolean) => {
    if (speaking) { if (!guestSpeakingSince.current) guestSpeakingSince.current = Date.now(); }
    else if (guestSpeakingSince.current) {
      guestTalkRef.current += Math.min(SPEAK_SPAN_CAP, (Date.now() - guestSpeakingSince.current) / 1000);
      guestSpeakingSince.current = null;
    }
  }, []);

  const onGuestJoined = useCallback(async () => {
    const active = callRef.current;
    if (!active) return;
    joinedAtRef.current = Date.now();
    leavingRef.current = false;
    guestTalkRef.current = 0;
    guestSpeakingSince.current = null;
    try { await menteeApi.joinReview(active.sessionId); } catch { /* best-effort */ }
  }, []);

  const value = useMemo<CallContextValue>(() => ({
    call, isLive, startCall, updateCall, reloadCall, endHostCall, leaveGuestCall,
    registerDock, provideRoster, endedNonce, wasEndedHere, reloadKey, minimized, setMinimized, dockedTo,
  }), [call, isLive, startCall, updateCall, reloadCall, endHostCall, leaveGuestCall, registerDock, provideRoster, endedNonce, wasEndedHere, reloadKey, minimized, dockedTo]);

  return (
    <CallCtx.Provider value={value}>
      {children}
      {call && (
        <PersistentCall
          call={call}
          reloadKey={reloadKey}
          dockedTo={dockedTo}
          minimized={minimized}
          onMinimize={setMinimized}
          onEnd={call.role === 'host' ? endHostCall : leaveGuestCall}
          onParticipantJoined={call.role === 'host' ? onParticipant : undefined}
          onDominantSpeaker={call.role === 'host' ? onDominant : undefined}
          onSelfDominantChange={call.role === 'guest' ? onSelfDominant : undefined}
          onJoined={call.role === 'guest' ? onGuestJoined : undefined}
        />
      )}
      {scoring && (
        <ContributionModal
          proposed={scoring.rows}
          sessionId={scoring.sessionId}
          onClose={() => setScoring(null)}
          onDone={() => { setScoring(null); setEndedNonce((n) => n + 1); }}
        />
      )}
    </CallCtx.Provider>
  );
}

export function useCall() {
  const ctx = useContext(CallCtx);
  if (!ctx) throw new Error('useCall must be used inside CallProvider');
  return ctx;
}
