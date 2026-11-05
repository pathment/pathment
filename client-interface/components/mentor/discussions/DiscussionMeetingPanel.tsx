'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  BarChart3, CalendarClock, CalendarPlus, Check, Circle, Loader2, Pencil, RotateCw, Star, Video, VideoOff, X,
} from 'lucide-react';
import { ComingSoon } from '@/components/shared/ComingSoon';
import { ScheduleMeetingDrawer } from './ScheduleMeetingDrawer';
import { MeetingSummaryModal } from './MeetingSummaryModal';
import { DiscussionFeedbackDrawer } from './DiscussionFeedbackDrawer';
import { useMentorApprovals } from '@/lib/hooks/mentor';
import { fmtTalk, meetingTimeLabel, untilLabel, viewerZone } from '@/components/shared/discussions/meeting/meetingFormat';
import { useCall } from '@/lib/context/CallContext';
import { useConfirm } from '@/lib/context/ConfirmContext';
import { groupDiscussionsApi, type MeetingJoin, type MeetingRosterRow, type MeetingState } from '@/lib/services/group-discussions-api';
import { useApiQuery, useInvalidate, qk } from '@/lib/query';

const STATE_BADGE: Record<MeetingState, { label: string; cls: string }> = {
  scheduled: { label: 'Scheduled', cls: 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300' },
  live: { label: 'Live', cls: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300' },
  ended: { label: 'Ended', cls: 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300' },
  missed: { label: 'Did not happen', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300' },
};

const SECONDARY = 'inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-brand-300 hover:text-brand-700 disabled:opacity-50';

/** The ★ next to a present mentee. It always opens their feedback drawer. */
function FeedbackButton({ row, onOpen }: { row: MeetingRosterRow; onOpen: () => void }) {
  const rated = !!row.feedback;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-label={`${rated ? 'Edit' : 'Give'} feedback for ${row.name}`}
      title={rated ? 'Edit feedback' : 'Give feedback'}
      className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-semibold transition-colors ${
        rated
          ? 'bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-300'
          : 'text-slate-500 hover:bg-brand-50 hover:text-brand-700 dark:hover:bg-brand-500/10'
      }`}
    >
      <Star className={`h-3.5 w-3.5 ${rated ? 'fill-amber-400 text-amber-400' : ''}`} aria-hidden />
      {rated ? 'Rated' : 'Feedback'}
    </button>
  );
}

/**
 * The group's live meeting, for its mentors: create it, start it, run it, end
 * it, rate each mentee. The call is the Clan Review call (CallProvider owns it,
 * so moving to another page mid-meeting does not hang up); this panel docks it
 * and shows who is in it beside it, the same layout as Live review.
 */
export function DiscussionMeetingPanel({ groupId, groupName }: { groupId: string; groupName: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const confirm = useConfirm();
  const invalidate = useInvalidate();
  const { startCall, reloadCall, endHostCall, registerDock, provideRoster, isLive, endedNonce, wasEndedHere } = useCall();
  const callUp = isLive(groupId);

  const { data, loading, refetch } = useApiQuery({
    queryKey: qk.mentor.discussionMeeting(groupId),
    queryFn: () => groupDiscussionsApi.meetingHost(groupId),
    // Live, the roster is who is in the room right now; otherwise it only needs the state.
    refetchInterval: (view) => (view?.meeting?.state === 'live' ? 8_000 : 30_000),
  });
  const [scheduling, setScheduling] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  // A mentee who joined has their task submitted, so it is in the review queue:
  // the ★ opens the same review drawer Approvals uses.
  const { queue, refetch: refetchApprovals } = useMentorApprovals();
  const [feedbackFor, setFeedbackFor] = useState<MeetingRosterRow | null>(null);
  const reviewItemFor = (row: MeetingRosterRow) =>
    (row.task ? queue.find((item) => item.taskId === row.task!.id) : undefined) ?? null;
  const [busy, setBusy] = useState(false);
  // Re-render each 15s so "starts in 3 min" and the Start emphasis follow the clock.
  const [, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 15_000); return () => clearInterval(t); }, []);

  const meeting = data?.meeting ?? null;
  const roster = useMemo(() => data?.roster ?? [], [data?.roster]);
  const live = meeting?.state === 'live';

  // Joining submits a mentee's task mid-call; fetch the queue again so their ★
  // opens the review drawer rather than the popover.
  const awaitingQueue = roster.filter((r) => r.task?.status === 'submitted' && !queue.some((q) => q.taskId === r.task!.id)).length;
  useEffect(() => { if (awaitingQueue) refetchApprovals(); }, [awaitingQueue, refetchApprovals]);

  // The provider maps Jitsi names to mentees when it records talk time.
  useEffect(() => {
    if (roster.length) provideRoster(roster.map((r) => ({ menteeId: r.menteeId, name: r.name })));
  }, [roster, provideRoster]);

  const dockCb = useCallback((el: HTMLDivElement | null) => registerDock(el), [registerDock]);

  // The call was ended (here, or from its floating window): show the new state.
  const endedSeen = useRef(endedNonce);
  useEffect(() => {
    if (endedNonce === endedSeen.current) return;
    endedSeen.current = endedNonce;
    refetch();
  }, [endedNonce, refetch]);

  const hostCall = useCallback((join: Pick<MeetingJoin, 'domain' | 'room' | 'jwt' | 'displayName' | 'avatarUrl' | 'title'>) => {
    startCall({
      kind: 'discussion',
      sessionId: groupId,
      domain: join.domain,
      room: join.room,
      jwt: join.jwt,
      displayName: join.displayName,
      avatarUrl: join.avatarUrl,
      role: 'host',
      title: join.title || groupName,
      returnHref: `/mentor/group-discussions/${groupId}`,
    });
  }, [startCall, groupId, groupName]);

  const start = useCallback(async () => {
    setBusy(true);
    try {
      const join = await groupDiscussionsApi.startMeeting(groupId);
      hostCall(join);
      await refetch();
      invalidate(qk.mentee.upcomingDiscussionMeetings);
      toast.success('Meeting started — mentees can join now');
    } catch (error) {
      toast.error((error as { message?: string })?.message || 'Could not start the meeting');
    } finally {
      setBusy(false);
    }
  }, [groupId, hostCall, refetch, invalidate]);

  // The banner's Start button lands here with ?meeting=start: start once, then drop it.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current || searchParams.get('meeting') !== 'start' || !data?.enabled || !meeting) return;
    autoStarted.current = true;
    router.replace(`/mentor/group-discussions/${groupId}`, { scroll: false });
    if (!live && !callUp) start();
  }, [searchParams, data?.enabled, meeting, live, callUp, start, router, groupId]);

  // A reload drops the provider but not the meeting: rejoin it, unless we just ended it.
  const readopted = useRef(false);
  useEffect(() => {
    if (!live || callUp || !data?.join || readopted.current || wasEndedHere(groupId)) return;
    readopted.current = true;
    hostCall(data.join);
  }, [live, callUp, data?.join, hostCall, wasEndedHere, groupId]);

  const cancel = async () => {
    const ok = await confirm({
      title: 'Cancel this meeting?',
      description: 'It comes off everyone’s schedule. You can create a new one at any time.',
      variant: 'danger',
      confirmLabel: 'Cancel meeting',
    });
    if (!ok) return;
    try {
      await groupDiscussionsApi.cancelMeeting(groupId);
      toast.success('Meeting cancelled');
      refetch();
    } catch (error) {
      toast.error((error as { message?: string })?.message || 'Could not cancel it');
    }
  };

  if (loading) return <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-brand-600" /></div>;
  if (!data?.enabled) {
    return data?.comingSoon ? (
      <ComingSoon
        title="Live discussion meetings"
        description="Run the group discussion over live video inside Pathment, with speaking time and feedback for every mentee."
        icon={<Video className="h-5 w-5" />}
        cta="Create meeting"
      />
    ) : null;
  }

  const drawer = scheduling && (
    <ScheduleMeetingDrawer
      groupId={groupId}
      groupName={groupName}
      meeting={meeting}
      onClose={() => setScheduling(false)}
      onSaved={() => { refetch(); invalidate(qk.mentor.groupDiscussion(groupId)); }}
    />
  );
  const summary = summaryOpen && <MeetingSummaryModal groupId={groupId} onClose={() => { setSummaryOpen(false); refetch(); }} />;

  // ── no meeting yet ──
  if (!meeting) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-border bg-card px-4 py-3">
        <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-slate-900">
          <Video className="h-4 w-4 text-brand-600" aria-hidden /> Live meeting
        </span>
        <span className="min-w-0 flex-1 text-xs text-muted-foreground">
          Talk the scenario through on video. Everyone is invited, reminded 10 minutes before, and can join 2 minutes before.
        </span>
        <button type="button" onClick={() => setScheduling(true)} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700">
          <CalendarPlus className="h-4 w-4" /> Create meeting
        </button>
        {drawer}
      </div>
    );
  }

  const badge = STATE_BADGE[meeting.state];
  const joinedCount = roster.filter((r) => r.present).length;

  // ── scheduled / ended / missed ──
  if (!live) {
    const soon = meeting.state === 'scheduled' && new Date(meeting.joinOpensAt).getTime() <= Date.now();
    const anyoneJoined = joinedCount > 0;
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-border bg-card px-4 py-3">
        <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-slate-900">
          <Video className="h-4 w-4 text-brand-600" aria-hidden /> Live meeting
        </span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.cls}`}>{badge.label}</span>
        <span className="inline-flex min-w-0 flex-1 items-center gap-1.5 text-xs text-muted-foreground" title={`Your timezone: ${viewerZone()}`}>
          <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate">
            {meetingTimeLabel(meeting)}
            {meeting.state === 'scheduled' ? ` · starts ${untilLabel(meeting.startsAt)}` : ''}
            {meeting.state === 'ended' ? ` · ${joinedCount}/${roster.length} joined` : ''}
          </span>
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {(meeting.state === 'ended' || anyoneJoined) && (
            <button type="button" onClick={() => setSummaryOpen(true)} className={SECONDARY}>
              <BarChart3 className="h-3.5 w-3.5" /> Summary &amp; feedback
            </button>
          )}
          {meeting.state !== 'ended' && (
            <button type="button" onClick={() => setScheduling(true)} className={SECONDARY}>
              <Pencil className="h-3.5 w-3.5" /> Edit time
            </button>
          )}
          {meeting.state === 'ended' && (
            <button type="button" onClick={() => setScheduling(true)} className={SECONDARY}>
              <CalendarPlus className="h-3.5 w-3.5" /> New meeting
            </button>
          )}
          {meeting.state !== 'ended' && (
            <button type="button" onClick={cancel} className={`${SECONDARY} hover:border-rose-200 hover:text-rose-600`}>
              <X className="h-3.5 w-3.5" /> Cancel
            </button>
          )}
          <button
            type="button"
            onClick={start}
            disabled={busy}
            className={soon
              ? 'pm-snake inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-700 hover:bg-brand-100 disabled:opacity-50 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-300'
              : 'inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50'}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
            {meeting.state === 'ended' ? 'Start again' : 'Start meeting'}
          </button>
        </div>
        {drawer}
        {summary}
      </div>
    );
  }

  // ── live ──
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
          <Video className="h-4 w-4 text-brand-600" aria-hidden /> Live meeting
          <span className={`ml-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.cls}`}>{badge.label}</span>
        </h2>
        <div className="flex items-center gap-2">
          {callUp ? (
            <button type="button" onClick={reloadCall} title="Rebuild the call if the video is stuck" className={SECONDARY}>
              <RotateCw className="h-3.5 w-3.5" /> Reload video
            </button>
          ) : (
            <button type="button" onClick={() => data.join && hostCall(data.join)} className={SECONDARY}>
              <Video className="h-3.5 w-3.5" /> Rejoin call
            </button>
          )}
          <button
            type="button"
            onClick={() => (callUp
              ? endHostCall()
              : groupDiscussionsApi.endMeeting(groupId)
                .then(() => { refetch(); setSummaryOpen(true); })
                .catch((error) => toast.error((error as { message?: string })?.message || 'Could not end the meeting')))}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
          >
            <VideoOff className="h-3.5 w-3.5" /> End meeting
          </button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_260px]">
        {/* Placeholder only: CallProvider renders the call over this box. */}
        <div ref={dockCb} className="h-[68vh] min-h-[520px] rounded-xl bg-slate-900" />
        <div className="min-w-0">
          <p className="mb-2 text-xs text-muted-foreground">{joinedCount}/{roster.length} joined</p>
          <ul className="max-h-[60vh] space-y-1 overflow-y-auto">
            {roster.map((row) => (
              <li key={row.menteeId} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${row.present ? 'hover:bg-muted/50' : 'opacity-60'}`}>
                {row.present
                  ? <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-label="In the meeting" />
                  : <Circle className="h-3.5 w-3.5 shrink-0 text-slate-300" aria-label="Not joined" />}
                <span className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-300">{row.name}</span>
                {row.talkSeconds > 0 && <span className="text-[11px] tabular-nums text-slate-400">{fmtTalk(row.talkSeconds)}</span>}
                {row.present && <FeedbackButton row={row} onOpen={() => setFeedbackFor(row)} />}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Anyone who joins from Pathment is listed as present, and their task is submitted. Rate them with ★ while they talk; you can finish in the summary after.
          </p>
        </div>
      </div>
      {summary}
      {feedbackFor && (
        <DiscussionFeedbackDrawer
          groupId={groupId}
          target={{
            menteeId: feedbackFor.menteeId,
            name: feedbackFor.name,
            avatarUrl: feedbackFor.avatarUrl,
            task: feedbackFor.task,
            feedback: feedbackFor.feedback,
          }}
          reviewItem={reviewItemFor(feedbackFor)}
          onClose={() => setFeedbackFor(null)}
          onChanged={() => { refetch(); refetchApprovals(); invalidate(qk.mentor.groupDiscussion(groupId)); }}
        />
      )}
    </div>
  );
}
