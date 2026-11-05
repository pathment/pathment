'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Clock, Image as ImageIcon, Loader2, MessageCircle, Mic, X } from 'lucide-react';
import { Avatar } from '@/components/shared/Avatar';
import { StarRating } from '@/components/shared/StarRating';
import { fmtTalk } from '@/components/shared/discussions/meeting/meetingFormat';
import { DiscussionFeedbackDrawer } from './DiscussionFeedbackDrawer';
import { useScrollLock } from '@/lib/hooks/useScrollLock';
import { useMentorApprovals } from '@/lib/hooks/mentor';
import { groupDiscussionsApi, type MeetingSummaryMember } from '@/lib/services/group-discussions-api';
import { useApiQuery, useInvalidate, qk } from '@/lib/query';

const BASIS_LABEL = { both: 'Feedback + activity', feedback: 'Feedback only', activity: 'Activity only' } as const;

/**
 * One mentee: what the call and the chat measured, and their stars. The row
 * always opens their feedback drawer: the review drawer when their task is
 * waiting for review, the same feedback in a drawer otherwise.
 */
function SummaryRow({ member, maxTalk, reviewable, onOpen }: {
  member: MeetingSummaryMember;
  maxTalk: number;
  reviewable: boolean;
  onOpen: () => void;
}) {
  const { meeting, rating } = member;
  const files = member.imageCount + member.videoCount + member.fileCount;
  const talkWidth = maxTalk ? Math.max(meeting.talkSeconds ? 4 : 0, (meeting.talkSeconds / maxTalk) * 100) : 0;

  return (
    <li className="rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={onOpen}
        aria-haspopup="dialog"
        title={reviewable ? 'Review and rate' : 'Give feedback'}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40"
      >
        <Avatar name={member.name} src={member.profilePictureUrl} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-slate-900">{member.name}</p>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              meeting.joined ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300'
            }`}>
              {meeting.joined ? 'Joined' : 'Did not join'}
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" title={`Spoke for ${fmtTalk(meeting.talkSeconds)}`}>
              <div className="h-full rounded-full bg-brand-600" style={{ width: `${talkWidth}%` }} />
            </div>
            <span className="inline-flex shrink-0 items-center gap-1 text-[11px] tabular-nums text-muted-foreground">
              <Clock className="h-3 w-3" aria-hidden /> {fmtTalk(meeting.talkSeconds)}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] tabular-nums text-muted-foreground">
            <span className="inline-flex items-center gap-1" title="Messages"><MessageCircle className="h-3 w-3" aria-hidden />{member.messageCount}</span>
            <span className="inline-flex items-center gap-1" title="Voice notes"><Mic className="h-3 w-3" aria-hidden />{member.voiceCount}</span>
            <span className="inline-flex items-center gap-1" title="Files shared"><ImageIcon className="h-3 w-3" aria-hidden />{files}</span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <StarRating value={rating.stars} size="sm" />
          <span className="text-[10px] text-muted-foreground">
            {rating.stars === 0 ? 'No activity' : rating.basis ? BASIS_LABEL[rating.basis] : 'Not rated'}
          </span>
        </div>
        <span className="inline-flex shrink-0 items-center gap-0.5 rounded-lg bg-brand-50 px-2 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
          {reviewable ? 'Review' : 'Feedback'} <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </span>
      </button>
    </li>
  );
}

/**
 * After a group discussion meeting: every mentee's participation, speaking
 * time first, each opening their feedback drawer. The stars are the same
 * rating the task review shows.
 */
export function MeetingSummaryModal({ groupId, onClose }: { groupId: string; onClose: () => void }) {
  useScrollLock();
  const invalidate = useInvalidate();
  const { data, loading, refetch } = useApiQuery({
    queryKey: qk.mentor.discussionMeetingSummary(groupId),
    queryFn: () => groupDiscussionsApi.meetingSummary(groupId),
  });

  // Who joined first, then who spoke most: the people the mentor watched.
  const members = useMemo(() => [...(data?.members ?? [])].sort((a, b) => (
    Number(b.meeting.joined) - Number(a.meeting.joined) || b.meeting.talkSeconds - a.meeting.talkSeconds
  )), [data?.members]);
  const joined = members.filter((m) => m.meeting.joined).length;
  const rated = members.filter((m) => m.myFeedback).length;

  // A mentee who joined has a submitted task in the review queue.
  const { queue, refetch: refetchApprovals } = useMentorApprovals();
  const [openFor, setOpenFor] = useState<MeetingSummaryMember | null>(null);
  const itemFor = (member: MeetingSummaryMember) =>
    (member.task ? queue.find((item) => item.taskId === member.task!.id) : undefined) ?? null;
  // A task submitted moments ago may not be in the cached queue yet.
  const awaitingQueue = members.filter((m) => m.task?.status === 'submitted' && !queue.some((q) => q.taskId === m.task!.id)).length;
  useEffect(() => { if (awaitingQueue) refetchApprovals(); }, [awaitingQueue, refetchApprovals]);

  const changed = () => {
    refetch();
    refetchApprovals();
    invalidate(qk.mentor.discussionMeeting(groupId), qk.mentor.groupDiscussion(groupId));
  };

  // The drawer takes the screen while it is open, and the summary comes back
  // when it closes: two stacked dialogs would fight over focus and Escape.
  if (openFor) {
    return (
      <DiscussionFeedbackDrawer
        groupId={groupId}
        target={{
          menteeId: openFor.menteeId,
          name: openFor.name,
          avatarUrl: openFor.profilePictureUrl,
          task: openFor.task,
          feedback: openFor.myFeedback,
        }}
        reviewItem={itemFor(openFor)}
        onClose={() => { setOpenFor(null); changed(); }}
        onChanged={changed}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="meeting-summary-title"
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 id="meeting-summary-title" className="font-semibold text-slate-900">Meeting summary</h2>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              {data ? `${data.group.name} · ${joined}/${members.length} joined · ${rated} rated by you` : 'Loading…'}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div>
          ) : !members.length ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Nobody is in this group.</p>
          ) : (
            <>
              <p className="mb-3 text-xs text-muted-foreground">
                Open a mentee to review and rate them. Their stars are 70% your feedback and 30% their activity in the group.
              </p>
              <ul className="space-y-2">
                {members.map((member) => (
                  <SummaryRow
                    key={member.menteeId}
                    member={member}
                    maxTalk={data?.groupMax.talk ?? 0}
                    reviewable={!!itemFor(member)}
                    onOpen={() => setOpenFor(member)}
                  />
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="flex justify-end border-t border-border px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
