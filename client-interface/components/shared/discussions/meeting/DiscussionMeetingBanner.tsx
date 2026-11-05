'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Video, X } from 'lucide-react';
import { acquireSocket } from '@/lib/services/socket-client';
import { useCall } from '@/lib/context/CallContext';
import { groupDiscussionsApi, type UpcomingMeeting } from '@/lib/services/group-discussions-api';
import { useApiQuery, qk } from '@/lib/query';
import { formatMeeting } from '@/lib/utils/datetime';
import { untilLabel } from './meetingFormat';

/**
 * Join a group discussion meeting as a mentee: fetch the room (the server
 * checks they are in the group and that it is open), then hand it to the
 * call provider, which owns it from there and survives navigation.
 */
export function useJoinDiscussionMeeting() {
  const { startCall } = useCall();
  const [joining, setJoining] = useState<string | null>(null);
  const join = useCallback(async (groupId: string) => {
    setJoining(groupId);
    try {
      const room = await groupDiscussionsApi.myMeetingJoin(groupId);
      startCall({
        kind: 'discussion',
        sessionId: groupId,
        domain: room.domain,
        room: room.room,
        jwt: room.jwt,
        displayName: room.displayName,
        avatarUrl: room.avatarUrl,
        role: 'guest',
        title: room.title,
        // A discussion opens in Messages: its chat, with the scenario pinned.
        returnHref: `/mentee/messages?discussion=${groupId}`,
        initialTalkSeconds: room.talkSeconds ?? 0,
      });
      return true;
    } catch (error) {
      toast.error((error as { message?: string })?.message || 'Could not join the meeting');
      return false;
    } finally {
      setJoining(null);
    }
  }, [startCall]);
  return { join, joining };
}

/** Shown from this long before the start (the server opens the room then too). */
const visibleNow = (m: UpcomingMeeting, now: number) =>
  m.meeting.state === 'live' || now >= new Date(m.meeting.joinOpensAt).getTime();

/**
 * The banner at the top of the overview page when a group discussion meeting
 * is live or two minutes from starting. Mentees join from it; a mentor is
 * taken to the group's page, where the meeting starts and docks.
 *
 * `role` limits it to one hat for someone who is a mentor in one clan and a
 * mentee in another, so each portal shows only its own meetings.
 */
export function DiscussionMeetingBanner({ role }: { role: 'mentor' | 'mentee' }) {
  return (
    <>
      {/* Reads the address, so it sits in its own Suspense boundary. */}
      {role === 'mentee' && <Suspense fallback={null}><JoinFromLink /></Suspense>}
      <BannerBody role={role} />
    </>
  );
}

/**
 * `?join=meeting&discussion=<group>`: join that group's meeting as soon as it
 * is open. The banner's Join button and the meeting notifications both link
 * here. The param is dropped once used, which re-arms it for the next link.
 */
function JoinFromLink() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { isLive } = useCall();
  const { join } = useJoinDiscussionMeeting();
  const { data } = useApiQuery({
    queryKey: qk.mentee.upcomingDiscussionMeetings,
    queryFn: () => groupDiscussionsApi.upcomingMeetings(),
    refetchInterval: 30_000,
  });
  const target = searchParams.get('join') === 'meeting' ? searchParams.get('discussion') : null;
  const used = useRef(false);

  useEffect(() => {
    if (!target) { used.current = false; return; }
    if (used.current || isLive(target)) return;
    const meeting = (data ?? []).find((m) => m.groupId === target && m.role === 'mentee');
    if (!meeting || !visibleNow(meeting, Date.now())) return;
    used.current = true;
    const rest = new URLSearchParams(Array.from(searchParams.entries()));
    rest.delete('join');
    router.replace(`${pathname}${rest.toString() ? `?${rest.toString()}` : ''}`, { scroll: false });
    join(target);
  }, [target, data, isLive, join, router, pathname, searchParams]);

  return null;
}

function BannerBody({ role }: { role: 'mentor' | 'mentee' }) {
  const { call, isLive, leaveGuestCall, registerDock } = useCall();
  const pathname = usePathname();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(() => Date.now());

  const { data, refetch } = useApiQuery({
    queryKey: qk.mentee.upcomingDiscussionMeetings,
    queryFn: () => groupDiscussionsApi.upcomingMeetings(),
    refetchInterval: 30_000,
  });

  // Its own clock, so it appears at two minutes out without waiting on a poll.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(t);
  }, []);

  // A mentor opening (or closing) the room shows here at once.
  useEffect(() => {
    const socket = acquireSocket();
    const onChange = () => { refetch(); };
    socket?.on('discussion-meeting:started', onChange);
    socket?.on('discussion-meeting:ended', onChange);
    return () => {
      socket?.off('discussion-meeting:started', onChange);
      socket?.off('discussion-meeting:ended', onChange);
    };
  }, [refetch]);

  const dockCb = useCallback((el: HTMLDivElement | null) => registerDock(el), [registerDock]);

  // In a discussion call as a mentee: the video gets its own full-width block
  // at the top of the page, the way the Clan Review call does, and the page
  // (Messages, with the group's chat) carries on below it. Off Messages there
  // is a way back to the chat.
  const inCall = role === 'mentee' && call?.kind === 'discussion' && call.role === 'guest';
  if (inCall) {
    const inMessages = !!pathname?.includes('/mentee/messages');
    return (
      <div className="mb-4 overflow-hidden rounded-2xl border border-slate-200 bg-card shadow-sm">
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-2.5">
          <p className="inline-flex min-w-0 items-center gap-2 text-sm font-medium text-slate-900">
            <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-red-500" aria-hidden />
            <span className="truncate">Group discussion · {call.title}</span>
          </p>
          <div className="flex shrink-0 items-center gap-1">
            {inMessages ? (
              <span className="hidden text-xs text-muted-foreground sm:inline">The chat is below</span>
            ) : (
              <Link href={call.returnHref} className="rounded-lg px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50">
                Scenario &amp; chat
              </Link>
            )}
            <button onClick={() => leaveGuestCall()} className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10">Leave</button>
          </div>
        </div>
        {/* Placeholder: CallProvider renders the video over this box. */}
        {/* Close to the full screen height: on a wide screen a shorter box
            leaves the tiles small and the toolbar crowding them. */}
        <div ref={dockCb} className="h-[78vh] min-h-[480px] bg-slate-900" />
      </div>
    );
  }

  const shown = (data ?? []).find((m) => m.role === role && visibleNow(m, now) && !dismissed.has(m.groupId) && !isLive(m.groupId));
  if (!shown) return null;
  const live = shown.meeting.state === 'live';
  // A mentor starts the meeting on the group's page, beside the roster. A
  // mentee joins it in the group's chat in Messages (`join=meeting` joins on
  // arrival), with the scenario pinned above the video and the chat below.
  const href = role === 'mentor'
    ? `/mentor/group-discussions/${shown.groupId}${live ? '' : '?meeting=start'}`
    : `/mentee/messages?discussion=${shown.groupId}&join=meeting`;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 dark:border-brand-500/30 dark:bg-brand-500/10">
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand-600" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">
          {live ? 'Group discussion is live' : `Group discussion starts ${untilLabel(shown.meeting.startsAt, now)}`} · {shown.groupName}
        </p>
        <p className="truncate text-xs text-slate-500">
          {shown.scenarioTitle ? `${shown.scenarioTitle} · ` : ''}{formatMeeting(shown.meeting.startsAt)}
          {role === 'mentee' ? ' · joining submits your task' : ''}
        </p>
      </div>
      <Link href={href} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-700">
        <Video className="h-4 w-4" />
        {role === 'mentee' ? 'Join meeting' : live ? 'Open meeting' : 'Start meeting'}
      </Link>
      <button
        type="button"
        onClick={() => setDismissed((prev) => new Set(prev).add(shown.groupId))}
        aria-label="Dismiss"
        className="p-1.5 text-slate-400 hover:text-slate-600"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
