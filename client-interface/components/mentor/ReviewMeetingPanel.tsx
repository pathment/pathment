'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Video, VideoOff, Loader2, Check, Circle, Trophy, RotateCw, Users, Radio } from 'lucide-react';
import { mentorApi } from '@/lib/services/mentor-api';
import { JitsiRoom, type JitsiParticipant } from '@/components/shared/JitsiRoom';
import { ComingSoon } from '@/components/shared/ComingSoon';

interface RosterRow { menteeId: string; name: string; attendance: string | null; autoPresent: boolean; talkSeconds: number; contributionPoints: number }
interface ScoreRow { menteeId: string; name: string; talkSeconds: number; proposed: boolean; alreadyAwarded: boolean }
interface Meeting { sessionId: string; domain: string; room: string; url: string; displayName: string | null; avatarUrl: string | null; externalUrl: string | null; startedAt: string | null; endedAt: string | null }

// Talk time: seconds under a minute (the contribution bar is 20s), minutes above.
const fmtTalk = (s: number) => (s < 60 ? `${s}s` : `${Math.round(s / 60)}m`);

/**
 * Host (mentor) side of the live cohort review. Starts the Jitsi room, embeds
 * it, shows a live roster, tracks dominant-speaker time as a contribution
 * signal, and on "End & score" awards the contribution point to the confirmed
 * speakers. The mentor's page is the source of truth for attendance + talk time.
 */
export function ReviewMeetingPanel({ sessionId, isDraft, ensureSession }: {
  sessionId: string;
  isDraft?: boolean;
  /** Creates today's session on demand, so "Start meeting" works from a blank page. */
  ensureSession?: () => Promise<{ id: string } | null>;
}) {
  // The session id can arrive late (created by Start), so track it locally.
  const [liveSessionId, setLiveSessionId] = useState(sessionId);
  useEffect(() => { if (sessionId) setLiveSessionId(sessionId); }, [sessionId]);
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(true);
  // Off = a general call (no attendance). On = joining auto-marks mentees present.
  const [attendanceTracking, setAttendanceTracking] = useState(false);
  // The whole live-video feature is behind a server flag (self-hosted Jitsi not
  // wired in prod yet). When the server reports it off, render nothing — unless
  // it also reports `comingSoon`, in which case we show an inviting teaser.
  const [disabled, setDisabled] = useState(false);
  const [comingSoon, setComingSoon] = useState(false);
  const [busy, setBusy] = useState(false);
  const [scoring, setScoring] = useState<ScoreRow[] | null>(null);
  // Once scored, the session is done — don't invite the mentor to reopen it.
  const [scored, setScored] = useState(false);
  // Bumping this remounts the Jitsi iframe — a clean way to clear meet.jit.si's
  // promo overlay without reloading the whole review page.
  const [videoKey, setVideoKey] = useState(0);

  // Talk-time tracking (host-observed). id → seconds, id → displayName.
  const talkById = useRef<Map<string, number>>(new Map());
  const nameById = useRef<Map<string, string>>(new Map());
  const speakingId = useRef<string | null>(null);
  const speakingSince = useRef<number>(0);

  const refresh = useCallback(async () => {
    try {
      const res = await mentorApi.getReviewMeeting(liveSessionId) as { data?: { enabled?: boolean; comingSoon?: boolean; meeting: Meeting; roster: RosterRow[]; live: boolean; attendanceTracking?: boolean } };
      if (res?.data?.enabled === false) { setDisabled(true); setComingSoon(!!res?.data?.comingSoon); return; }
      setMeeting(res?.data?.meeting ?? null);
      setRoster(res?.data?.roster ?? []);
      setLive(!!res?.data?.live);
      setAttendanceTracking(!!res?.data?.attendanceTracking);
    } catch { /* keep last */ }
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
      if (liveSessionId) refresh(); else setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [refresh, liveSessionId]);
  // While live, refresh the roster often so a mentee who joins is auto-marked
  // present within a few seconds (their client self-reports on join).
  useEffect(() => {
    if (!live) return;
    const t = setInterval(refresh, 8_000);
    return () => clearInterval(t);
  }, [live, refresh]);

  // Map a Jitsi participant name → a roster menteeId (best-effort, by name).
  const menteeIdForName = useCallback((name?: string) => {
    if (!name) return null;
    const n = name.trim().toLowerCase();
    return roster.find((r) => r.name.trim().toLowerCase() === n)?.menteeId ?? null;
  }, [roster]);

  const flushTalk = useCallback(async () => {
    // Close the current speaking span.
    if (speakingId.current) {
      const add = Math.round((Date.now() - speakingSince.current) / 1000);
      talkById.current.set(speakingId.current, (talkById.current.get(speakingId.current) || 0) + Math.max(0, add));
      speakingSince.current = Date.now();
    }
    const items: { menteeId: string; seconds: number }[] = [];
    for (const [id, secs] of talkById.current.entries()) {
      const menteeId = menteeIdForName(nameById.current.get(id));
      if (menteeId) items.push({ menteeId, seconds: secs });
    }
    if (items.length) { try { await mentorApi.recordReviewTalkTime(liveSessionId, items); } catch { /* retry next flush */ } }
  }, [liveSessionId, menteeIdForName]);

  // Periodically flush talk time while live.
  useEffect(() => {
    if (!live) return;
    const t = setInterval(flushTalk, 20_000);
    return () => clearInterval(t);
  }, [live, flushTalk]);

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
      await mentorApi.startReviewMeeting(id);
      setScored(false);
      endingRef.current = false; // fresh call — allow it to be ended/scored again
      await refresh();
      toast.success('Meeting started — mentees can join now');
    } catch { toast.error('Could not start the meeting'); }
    finally { setBusy(false); }
  };

  // Guard so ending is idempotent — the Jitsi hangup ("end for all") and the
  // panel's own "End & score" button can both fire; only the first should run.
  const endingRef = useRef(false);
  const endAndScore = useCallback(async () => {
    if (endingRef.current) return;
    endingRef.current = true;
    setBusy(true);
    try {
      await flushTalk();
      await mentorApi.endReviewMeeting(liveSessionId);
      const res = await mentorApi.proposeReviewContribution(liveSessionId) as { data?: { proposed: ScoreRow[] } };
      setLive(false);
      setScoring(res?.data?.proposed ?? []);
      await refresh();
    } catch { toast.error('Could not end the meeting'); endingRef.current = false; }
    finally { setBusy(false); }
  }, [flushTalk, liveSessionId, refresh]);

  const onDominant = (id: string) => {
    if (speakingId.current && speakingId.current !== id) {
      const add = Math.round((Date.now() - speakingSince.current) / 1000);
      talkById.current.set(speakingId.current, (talkById.current.get(speakingId.current) || 0) + Math.max(0, add));
    }
    speakingId.current = id;
    speakingSince.current = Date.now();
  };
  const onParticipant = (p: JitsiParticipant) => { if (p.displayName) nameById.current.set(p.id, p.displayName); };

  const toggleAttendance = async () => {
    const next = !attendanceTracking;
    setAttendanceTracking(next); // optimistic
    try { await mentorApi.setReviewAttendanceTracking(liveSessionId, next); } catch { setAttendanceTracking(!next); toast.error('Could not update attendance tracking'); }
  };

  const togglePresent = async (r: RosterRow) => {
    const present = r.attendance !== 'present';
    setRoster((prev) => prev.map((x) => (x.menteeId === r.menteeId ? { ...x, attendance: present ? 'present' : 'absent' } : x)));
    try { await mentorApi.markReviewPresent(liveSessionId, r.menteeId, present); } catch { toast.error('Could not update attendance'); refresh(); }
  };

  // Feature flag off. In production we tease it ("Coming soon"); everywhere else
  // the panel simply doesn't exist for the mentor.
  if (disabled) {
    return comingSoon ? (
      <ComingSoon
        title="Live review calls"
        description="Run your cohort review over live video — right inside Pathment. No links to juggle, and everyone joins as themselves."
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

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-sm font-medium text-slate-900 flex items-center gap-1.5"><Video className="w-4 h-4 text-brand-600" /> Live review</h3>
        {!live ? (
          // A meeting that was scored OR ended (endedAt set, e.g. after a refresh)
          // is done — offer a quiet "Start a new call", not a primary "Resume"
          // that implies unfinished business. Only a never-started session shows
          // the primary "Start meeting".
          (scored || !!meeting?.endedAt) ? (
            <button onClick={start} disabled={busy} className="text-xs font-medium text-slate-500 hover:text-brand-700 disabled:opacity-50">
              {busy ? 'Starting…' : 'Start a new call'}
            </button>
          ) : (
            <button onClick={start} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Video className="w-3.5 h-3.5" />} {meeting?.startedAt ? 'Resume meeting' : 'Start meeting'}
            </button>
          )
        ) : (
          <div className="flex items-center gap-2">
            <button onClick={() => setVideoKey((k) => k + 1)} title="Reload the call (clears the meet.jit.si promo)" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-brand-300 hover:text-brand-700">
              <RotateCw className="w-3.5 h-3.5" /> Reload video
            </button>
            <button onClick={endAndScore} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <VideoOff className="w-3.5 h-3.5" />} End &amp; score
            </button>
          </div>
        )}
      </div>

      {live && meeting && (
        <div className="grid gap-3 lg:grid-cols-[1fr_240px]">
          <div className="h-[440px]">
            <JitsiRoom
              key={videoKey}
              domain={meeting.domain} room={meeting.room} displayName={meeting.displayName} avatarUrl={meeting.avatarUrl}
              onParticipantJoined={onParticipant} onDominantSpeaker={onDominant}
              onReadyToClose={endAndScore}
              onError={(m) => toast.error(m)}
            />
          </div>
          <div className="min-w-0">
            <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5">
              <span className="text-xs font-medium text-slate-700" title="When on, mentees who join are marked present. Off = a general call.">Track attendance</span>
              <button type="button" role="switch" aria-checked={attendanceTracking} onClick={toggleAttendance}
                className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${attendanceTracking ? 'bg-brand-600' : 'bg-slate-300'}`}>
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${attendanceTracking ? 'translate-x-4' : 'translate-x-0.5'}`} />
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

      {!live && meeting?.startedAt && (
        <p className="text-xs text-slate-500">
          {scored
            ? `Review complete · ${presentCount}/${roster.length} attended · points awarded.`
            : `Meeting ended${attendanceTracking ? ` · ${presentCount}/${roster.length} attended` : ''}. Start a new call anytime.`}
        </p>
      )}
      {!live && !meeting?.startedAt && (
        <p className="text-xs text-slate-500">Start the call and your mentees get a “Join review” banner. Flip on “Track attendance” once you’re live to auto-mark joiners present.</p>
      )}

      {scoring && <ContributionModal proposed={scoring} sessionId={liveSessionId} onClose={() => { setScoring(null); setScored(true); }} onDone={() => { setScoring(null); setScored(true); refresh(); }} />}
    </div>
  );
}

// ── contribution scoring modal ───────────────────────────────────────────────
function ContributionModal({ proposed, sessionId, onClose, onDone }: {
  proposed: ScoreRow[];
  sessionId: string; onClose: () => void; onDone: () => void;
}) {
  // Pre-check the speakers; the mentor can add anyone else who contributed.
  const [picked, setPicked] = useState<Set<string>>(new Set(proposed.filter((p) => p.proposed && !p.alreadyAwarded).map((p) => p.menteeId)));
  const [busy, setBusy] = useState(false);

  const award = async () => {
    setBusy(true);
    try {
      const res = await mentorApi.finalizeReviewContribution(sessionId, [...picked]) as { data?: { awarded: number } };
      toast.success(`Awarded a contribution point to ${res?.data?.awarded ?? 0} mentee(s)`);
      onDone();
    } catch { toast.error('Could not award points'); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !busy && onClose()}>
      <div className="w-full max-w-md rounded-2xl bg-card p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold text-slate-900 flex items-center gap-1.5"><Trophy className="w-5 h-5 text-amber-500" /> Contribution points</h3>
        <p className="mt-1 text-sm text-slate-500">Award a point to whoever contributed. Speakers are pre-checked — tick anyone who helped in chat too.</p>
        <div className="mt-3 space-y-1 max-h-64 overflow-y-auto">
          {proposed.length === 0 && <p className="text-sm text-slate-400">Nobody attended this session.</p>}
          {proposed.map((p) => (
            <label key={p.menteeId} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${p.alreadyAwarded ? 'opacity-50' : 'hover:bg-slate-50 cursor-pointer'}`}>
              <input
                type="checkbox"
                disabled={p.alreadyAwarded}
                checked={p.alreadyAwarded || picked.has(p.menteeId)}
                onChange={(e) => setPicked((s) => { const n = new Set(s); e.target.checked ? n.add(p.menteeId) : n.delete(p.menteeId); return n; })}
              />
              <span className="text-sm text-slate-700 flex-1">{p.name}</span>
              <span className="text-[11px] text-slate-400 tabular-nums">
                {p.alreadyAwarded ? 'already awarded' : p.talkSeconds > 0 ? `spoke ${fmtTalk(p.talkSeconds)}` : 'no speaking time'}
              </span>
            </label>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} disabled={busy} className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-700">Skip</button>
          <button onClick={award} disabled={busy || picked.size === 0} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trophy className="w-4 h-4" />} Award {picked.size}
          </button>
        </div>
      </div>
    </div>
  );
}
