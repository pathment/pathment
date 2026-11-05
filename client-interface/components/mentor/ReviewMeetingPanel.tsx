'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { Video, VideoOff, Loader2, Check, Circle, Trophy, RotateCw, Users, Radio } from 'lucide-react';
import { mentorApi } from '@/lib/services/mentor-api';
import { usePolling } from '@/lib/hooks/shared/usePolling';
import { getRateLimit } from '@/lib/utils/api-error';
import { ComingSoon } from '@/components/shared/ComingSoon';
import { useCall } from '@/lib/context/CallContext';

interface RosterRow { menteeId: string; name: string; attendance: string | null; autoPresent: boolean; talkSeconds: number; contributionPoints: number }
interface Meeting { sessionId: string; domain: string; room: string; jwt: string; url: string; displayName: string | null; avatarUrl: string | null; externalUrl: string | null; startedAt: string | null; endedAt: string | null; pollsEnabled?: boolean }

// Talk time: seconds under a minute (the contribution bar is 20s), minutes above.
const fmtTalk = (s: number) => (s < 60 ? `${s}s` : `${Math.round(s / 60)}m`);

/**
 * Host (mentor) side of the live clan review: starts the room, shows the live
 * roster, and offers "End & score".
 *
 * The call itself is NOT owned here any more — CallProvider owns it, above the
 * router, so opening a mentee's profile mid-review no longer hangs the mentor up
 * (see the note in CallContext). This panel just registers a placeholder for the
 * call to dock into, and drives it through the context. Talk-time tracking and
 * the contribution modal moved to the provider for the same reason: they have to
 * outlive this page.
 */
export function ReviewMeetingPanel({ sessionId, isDraft, ensureSession, onAttendanceSync, onEnded, readOnly = false, buttonSlot }: {
  sessionId: string;
  isDraft?: boolean;
  /** Creates today's session on demand, so "Start meeting" works from a blank page. */
  ensureSession?: () => Promise<{ id: string } | null>;
  /** Push live auto-attendance up to the review page so its attendance strip and
   *  present/absent/excused counts reflect who joined the call (server truth). */
  onAttendanceSync?: (rows: { menteeId: string; attendance: string | null }[]) => void;
  /** Fired after the call ends (which now auto-finishes the session server-side) so
   *  the page can reload and show the "Finished" state. */
  onEnded?: () => void;
  readOnly?: boolean;
  /**
   * Where the Start button goes while there is no call.
   *
   * Idle, this panel is one button pretending to be a section: a heading, an
   * explanation and a lot of horizontal rule, sitting above the mentee the
   * mentor came here for. Given a slot in the page header it renders the button
   * there instead and takes no vertical space at all — while keeping every bit
   * of meeting state, so nothing has to be lifted or duplicated.
   */
  buttonSlot?: HTMLElement | null;
}) {
  // The session id can arrive late (created by Start), so track it locally.
  const [liveSessionId, setLiveSessionId] = useState(sessionId);
  useEffect(() => { if (sessionId) setLiveSessionId(sessionId); }, [sessionId]);
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(true);
  // On by default for reviews (joining auto-marks present); the server is the
  // source of truth and overwrites this on the first refresh. Off = general call.
  const [attendanceTracking, setAttendanceTracking] = useState(true);
  // Private 1:1 chat — OFF by default; the host toggles it on (remounts Jitsi).
  const [privateChat, setPrivateChat] = useState(false);
  // In-call polls — OFF by default; server (session.pollsEnabled) is the source of
  // truth and overwrites this on refresh. Propagated to mentees so they can vote.
  const [polls, setPolls] = useState(false);
  // The whole live-video feature is behind a server flag (self-hosted Jitsi not
  // wired in prod yet). When the server reports it off, render nothing — unless
  // it also reports `comingSoon`, in which case we show an inviting teaser.
  const [disabled, setDisabled] = useState(false);
  const [comingSoon, setComingSoon] = useState(false);
  const [busy, setBusy] = useState(false);
  // Once scored, the session is done — don't invite the mentor to reopen it.
  const [scored, setScored] = useState(false);

  const { startCall, updateCall, reloadCall, endHostCall, registerDock, provideRoster, isLive, endedNonce, wasEndedHere } = useCall();
  // The placeholder the persistent call docks over while this page is open.
  const dockRef = useRef<HTMLDivElement | null>(null);
  // A call for THIS session is up (started here, or still running after the
  // mentor navigated away and came back).
  const callUp = isLive(liveSessionId);

  const refresh = useCallback(async () => {
    try {
      const res = await mentorApi.getReviewMeeting(liveSessionId) as { data?: { enabled?: boolean; comingSoon?: boolean; meeting: Meeting; roster: RosterRow[]; live: boolean; attendanceTracking?: boolean } };
      if (res?.data?.enabled === false) { setDisabled(true); setComingSoon(!!res?.data?.comingSoon); return; }
      setMeeting(res?.data?.meeting ?? null);
      setRoster(res?.data?.roster ?? []);
      setLive(!!res?.data?.live);
      setAttendanceTracking(!!res?.data?.attendanceTracking);
      setPolls(!!res?.data?.meeting?.pollsEnabled);
    } catch (error) {
      // Keep the last roster on a transient failure, but let a 429 through so the
      // poll loop backs off instead of hammering the limit it just hit.
      if (getRateLimit(error).limited) throw error;
    }
    finally { setLoading(false); }
  }, [liveSessionId]);

  // Check feature availability FIRST, independent of any session. Today's review
  // is a draft (empty sessionId) until the mentor acts, so gating only inside
  // refresh() (which needs a session) let the panel slip through and show the
  // live UI even when the feature is off — this is what leaked it into prod.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await mentorApi.getReviewMeetingConfig() as { data?: { enabled?: boolean; comingSoon?: boolean } };
        if (cancelled) return;
        if (res?.data?.enabled === false) {
          setDisabled(true);
          setComingSoon(!!res?.data?.comingSoon);
          setLoading(false);
          return;
        }
      } catch { /* fall through to the session-based path */ }
      if (cancelled) return;
      if (liveSessionId) refresh().catch(() => {}); else setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [refresh, liveSessionId]);
  // While live, refresh the roster often so a mentee who joins is auto-marked
  // present within a few seconds (their client self-reports on join).
  // Only while live, and only via usePolling — at 8s this is the app's fastest
  // loop, so it is also the one most able to hold a rate limit open if it ignored
  // a 429. `intervalMs: null` stops it outright when the review is not live.
  usePolling(refresh, { intervalMs: live ? 8_000 : null, immediate: false });
  // Mirror the roster's attendance (server truth, incl. live auto-present) up to
  // the review page, so its strip + present/absent/excused counts stay in sync
  // instead of showing the stale once-loaded session. Only rows with a mark set
  // are pushed — an unmarked mentee shouldn't clobber a page-side pending state.
  useEffect(() => {
    if (!onAttendanceSync || !roster.length) return;
    const marked = roster.filter((r) => r.attendance).map((r) => ({ menteeId: r.menteeId, attendance: r.attendance }));
    if (marked.length) onAttendanceSync(marked);
  }, [roster, onAttendanceSync]);

  // The provider maps Jitsi display names → menteeIds when it flushes talk time,
  // and it can't fetch the roster itself, so hand it over while we're mounted.
  // Names don't change mid-call, so the last one it received stays usable after
  // the mentor navigates away.
  useEffect(() => {
    if (roster.length) provideRoster(roster.map((r) => ({ menteeId: r.menteeId, name: r.name })));
  }, [roster, provideRoster]);

  // Dock the persistent call over our placeholder. A ref callback rather than an
  // effect, so it can't race the placeholder's mount: React calls it with the
  // node when it appears and with null when this page goes away — and null is
  // what floats the call rather than ending it.
  const dockCb = useCallback((el: HTMLDivElement | null) => {
    dockRef.current = el;
    registerDock(el);
  }, [registerDock]);

  // The provider ends the call (its floating window has an End button too), so
  // pick up the resulting state change here.
  const endedSeen = useRef(endedNonce);
  useEffect(() => {
    if (endedNonce === endedSeen.current) return;
    endedSeen.current = endedNonce;
    setScored(true);
    refresh().catch(() => {});
    onEnded?.();
  }, [endedNonce, refresh, onEnded]);

  // Start works from a blank page: if today's session doesn't exist yet we
  // create it first, so the mentor never has to "mark someone" to unlock video.
  const start = async () => {
    setBusy(true);
    try {
      let id = liveSessionId;
      if (!id && ensureSession) {
        const created = await ensureSession();
        if (!created?.id) throw new Error('no session');
        id = created.id;
        setLiveSessionId(id);
      }
      if (!id) throw new Error('no session');
      // The start endpoint returns the join config itself (not wrapped in
      // `meeting`) — see reviewMeetingService.startMeeting → _joinConfig.
      const res = await mentorApi.startReviewMeeting(id) as { data?: Meeting };
      setScored(false);
      const m = res?.data;
      // Hand the room to the provider — from here it belongs to the app, not the page.
      startCall({
        sessionId: id,
        domain: m?.domain || meeting?.domain || '',
        room: m?.room || meeting?.room || '',
        jwt: m?.jwt || meeting?.jwt || '',
        displayName: m?.displayName ?? meeting?.displayName ?? null,
        avatarUrl: m?.avatarUrl ?? meeting?.avatarUrl ?? null,
        role: 'host',
        title: 'Live review',
        returnHref: '/mentor/review',
        privateChat: false,
        polls,
      });
      await refresh();
      toast.success('Meeting started — mentees can join now');
    } catch { toast.error('Could not start the meeting'); }
    finally { setBusy(false); }
  };

  const toggleAttendance = async () => {
    const next = !attendanceTracking;
    setAttendanceTracking(next); // optimistic
    try { await mentorApi.setReviewAttendanceTracking(liveSessionId, next); } catch { setAttendanceTracking(!next); toast.error('Could not update attendance tracking'); }
  };
  // Both of these rebuild the Jitsi room (it can't toggle them live), so they go
  // through the provider — which owns the room now.
  const togglePolls = async () => {
    const next = !polls;
    setPolls(next); // optimistic
    updateCall({ polls: next });
    try { await mentorApi.setReviewPolls(liveSessionId, next); } catch { setPolls(!next); updateCall({ polls: !next }); toast.error('Could not update polls'); }
  };
  const togglePrivateChat = () => {
    const next = !privateChat;
    setPrivateChat(next);
    updateCall({ privateChat: next });
  };

  // A full browser reload takes the provider down with everything else, but the
  // meeting is still live server-side. Re-adopt it so the mentor lands back in
  // their call instead of staring at an empty box.
  //
  // `wasEndedHere` is the guard that matters. `scored` and `meeting.endedAt` both
  // arrive as state — `scored` from the endedNonce effect below, `endedAt` from the
  // server refresh — so in the render pass where the call ends, BOTH are still
  // false here and this effect used to rejoin the room the host had just left. The
  // mentor then saw themselves in a floating window after ending, and the next
  // "Start a new call" stacked another copy on top (three tiles, all the same
  // person). wasEndedHere is ref-backed, so it is already true by this point.
  const readoptedRef = useRef(false);
  useEffect(() => {
    if (!live || !meeting || callUp || scored || meeting.endedAt) return;
    if (wasEndedHere(liveSessionId)) return;
    if (readoptedRef.current) return;
    readoptedRef.current = true;
    startCall({
      sessionId: liveSessionId,
      domain: meeting.domain,
      room: meeting.room,
      jwt: meeting.jwt,
      displayName: meeting.displayName,
      avatarUrl: meeting.avatarUrl,
      role: 'host',
      title: 'Live review',
      returnHref: '/mentor/review',
      privateChat,
      polls,
    });
  }, [live, meeting, callUp, scored, liveSessionId, privateChat, polls, startCall, wasEndedHere]);

  const togglePresent = async (r: RosterRow) => {
    const present = r.attendance !== 'present';
    setRoster((prev) => prev.map((x) => (x.menteeId === r.menteeId ? { ...x, attendance: present ? 'present' : 'absent' } : x)));
    try { await mentorApi.markReviewPresent(liveSessionId, r.menteeId, present); } catch { toast.error('Could not update attendance'); refresh().catch(() => {}); }
  };

  // Feature flag off. In production we tease it ("Coming soon"); everywhere else
  // the panel simply doesn't exist for the mentor.
  if (disabled) {
    return comingSoon ? (
      <ComingSoon
        title="Live review calls"
        description="Run your clan review over live video — right inside Pathment. No links to juggle, and everyone joins as themselves."
        icon={<Video className="h-5 w-5" />}
        cta="Start meeting"
        features={[
          { icon: <Radio className="h-3 w-3 text-brand-500" />, label: 'One-click start' },
          { icon: <Users className="h-3 w-3 text-brand-500" />, label: 'Auto attendance' },
          { icon: <Trophy className="h-3 w-3 text-amber-500" />, label: 'Contribution points' },
        ]}
      />
    ) : null;
  }
  if (loading) return <div className="py-4 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-brand-600" /></div>;

  const presentCount = roster.filter((r) => r.attendance === 'present').length;

  /**
   * Idle, this is one line.
   *
   * Before a call starts there is nothing to look at — a heading, a button and
   * a paragraph of explanation — and all of it sat at full width above the
   * mentee, pushing the actual review below the fold. The explanation is now
   * the line itself, so the card costs a row instead of a block, and only
   * grows when there is a call in it.
   */
  const idleHint = meeting?.startedAt
    ? (scored
      ? `Review complete · ${presentCount}/${roster.length} attended · points awarded.`
      : `Meeting ended${attendanceTracking ? ` · ${presentCount}/${roster.length} attended` : ''}.`)
    : 'Mentees get a “Join review” banner when you start.';

  if (!live) {
    const restarting = scored || !!meeting?.endedAt;
    const startButton = (
      <button
        onClick={start}
        disabled={busy || readOnly}
        title={readOnly ? 'Completed programs are read-only' : idleHint}
        /**
         * The snake runs only on the button that starts something.
         *
         * "New call" after a finished meeting is a quiet, second-thought
         * action and gets no light; the one that opens the room everyone is
         * waiting to join is the live thing on this screen, and looks it.
         */
        className={restarting
          ? 'inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-brand-300 hover:text-brand-700 disabled:opacity-50 sm:px-3 sm:py-2 sm:text-sm'
          : 'pm-snake inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-2.5 py-1.5 text-xs font-semibold text-brand-700 transition-transform hover:-translate-y-px hover:bg-brand-100 disabled:opacity-50 sm:px-3 sm:py-2 sm:text-sm dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-300'}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin sm:h-4 sm:w-4" /> : <Video className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
        {restarting ? 'New call' : meeting?.startedAt ? 'Resume call' : 'Start meeting'}
      </button>
    );

    // In the header when the page offers a slot; otherwise the old inline row,
    // so this component still stands alone anywhere else.
    if (buttonSlot) return createPortal(startButton, buttonSlot);
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-slate-200 px-4 py-2.5">
        <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-slate-900">
          <Video className="h-4 w-4 text-brand-600" aria-hidden /> Live review
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-slate-500" title={idleHint}>{idleHint}</span>
        {startButton}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-sm font-medium text-slate-900 flex items-center gap-1.5"><Video className="w-4 h-4 text-brand-600" /> Live review</h3>
        <div className="flex items-center gap-2">
            <button onClick={reloadCall} title="Rebuild the call if the video is stuck" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-brand-300 hover:text-brand-700">
              <RotateCw className="w-3.5 h-3.5" /> Reload video
            </button>
            <button onClick={endHostCall} disabled={busy || readOnly} title={readOnly ? 'Completed programs are read-only' : undefined} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <VideoOff className="w-3.5 h-3.5" />} End &amp; score
            </button>
        </div>
      </div>

      {meeting && (
        <div className="grid gap-3 lg:grid-cols-[1fr_240px]">
          {/* Placeholder only — the call itself is rendered by CallProvider and
              positioned over this box. That's what lets it keep running when you
              open a mentee's profile: there is no iframe here to unmount. */}
          <div ref={dockCb} className="h-[68vh] min-h-[520px] rounded-xl bg-slate-900" />
          <div className="min-w-0">
            <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5">
              <span className="text-xs font-medium text-slate-700" title="When on, mentees who join are marked present. Off = a general call.">Track attendance</span>
              <button type="button" role="switch" aria-checked={attendanceTracking} onClick={toggleAttendance}
                className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${attendanceTracking ? 'bg-brand-600' : 'bg-slate-300'}`}>
                <span className={`absolute left-0 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${attendanceTracking ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
            </div>
            {/* Private 1:1 chat is OFF by default (mentees can't DM anyone); the
                mentor flips it on when they want to message privately. */}
            <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5">
              <span className="text-xs font-medium text-slate-700" title="Off = no private 1:1 messages. On lets you privately message a participant.">Private chat</span>
              <button type="button" role="switch" aria-checked={privateChat} onClick={togglePrivateChat}
                className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${privateChat ? 'bg-brand-600' : 'bg-slate-300'}`}>
                <span className={`absolute left-0 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${privateChat ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
            </div>
            {/* Polls — OFF by default; the mentor turns it on to create polls. When
                on, mentees can vote/see results too (propagated). */}
            <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5">
              <span className="text-xs font-medium text-slate-700" title="On lets you create in-call polls; mentees can vote and see results.">Polls</span>
              <button type="button" role="switch" aria-checked={polls} onClick={togglePolls}
                className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${polls ? 'bg-brand-600' : 'bg-slate-300'}`}>
                <span className={`absolute left-0 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${polls ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-2">{presentCount}/{roster.length} present</p>
            <div className="space-y-1 max-h-[420px] overflow-y-auto">
              {roster.map((r) => (
                <button key={r.menteeId} onClick={() => togglePresent(r)} className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-slate-50">
                  {r.attendance === 'present'
                    ? <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    : <Circle className="w-3.5 h-3.5 text-slate-300 shrink-0" />}
                  <span className="text-sm text-slate-700 truncate flex-1">{r.name}</span>
                  {r.talkSeconds > 0 && <span className="text-[11px] text-slate-400 tabular-nums">{fmtTalk(r.talkSeconds)}</span>}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              {attendanceTracking
                ? 'Anyone who joins from Pathment is marked present. Click a name to override.'
                : 'Attendance isn’t tracked for this call. Turn on “Track attendance”, or click a name to mark manually.'}
            </p>
          </div>
        </div>
      )}

    </div>
  );
}
