'use client';

import { Clock, Image as ImageIcon, MessageCircle, Mic, Sparkles } from 'lucide-react';
import { MetricTile } from '@/components/shared/MetricTile';
import { StarRating } from '@/components/shared/discussions/meeting/StarRating';
import { CriteriaBars } from '@/components/shared/discussions/meeting/CriteriaBars';
import { fmtTalk } from '@/components/shared/discussions/meeting/meetingFormat';
import { groupDiscussionsApi } from '@/lib/services/group-discussions-api';
import { useApiQuery, qk } from '@/lib/query';

const BASIS_TEXT = {
  both: 'From your mentor’s feedback (70%) and your activity in the group (30%).',
  feedback: 'From your mentor’s feedback.',
  activity: 'From your activity in the group. Your mentor has not given feedback yet.',
} as const;

/**
 * A mentee's own result in a group discussion: how long they spoke, what they
 * posted, and their mentor's feedback. The server only ever returns their own,
 * and holds the feedback back while the meeting is still running.
 */
/** One number in the embedded layout: quiet, so it sits with the drawer's other sections. */
function Cell({ icon: Icon, value, label }: { icon: typeof Clock; value: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 px-3 py-2.5 dark:border-slate-800">
      <Icon className="h-4 w-4 shrink-0 text-brand-600" aria-hidden />
      <div className="min-w-0">
        <p className="text-sm font-semibold tabular-nums text-slate-900">{value}</p>
        <p className="text-[11px] text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

/**
 * `embedded` is for a container that brings its own title and already shows
 * the rating (the task drawer's Approved note): no card, no heading, no stars,
 * and quiet cells instead of the large stat tiles.
 */
export function MyDiscussionResult({ groupId, embedded = false }: { groupId: string; embedded?: boolean }) {
  const { data } = useApiQuery({
    queryKey: qk.mentee.groupDiscussionResult(groupId),
    queryFn: () => groupDiscussionsApi.myResult(groupId),
    refetchInterval: 60_000,
  });
  if (!data?.member) return embedded ? <p className="text-sm text-muted-foreground">Nothing recorded for this discussion yet.</p> : null;
  const { member, rating, feedback } = data;
  // Nothing has happened yet: no meeting joined, nothing posted, no feedback.
  if (!member.meeting.joined && !member.messageCount && !feedback.length) {
    return embedded ? <p className="text-sm text-muted-foreground">You did not join the meeting or post in the chat.</p> : null;
  }

  const files = member.imageCount + member.videoCount + member.fileCount;

  if (embedded) {
    const notes = feedback.filter((f) => f.note);
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <Cell icon={Clock} value={fmtTalk(member.meeting.talkSeconds)} label={member.meeting.joined ? 'Speaking time in the meeting' : 'Did not join the meeting'} />
          <Cell icon={MessageCircle} value={member.messageCount} label="Messages in the chat" />
          <Cell icon={Mic} value={member.voiceCount} label="Voice notes" />
          <Cell icon={ImageIcon} value={files} label="Files shared" />
        </div>

        {data.feedbackHiddenUntilEnd ? (
          <p className="text-sm text-muted-foreground">Your mentor&apos;s feedback shows here once the meeting ends.</p>
        ) : rating?.feedback.criteria ? (
          <div>
            <p className="mb-2 text-xs font-medium text-slate-500">
              Your mentor&apos;s feedback{feedback.length > 1 ? ` (${feedback.length} mentors, averaged)` : ''}
            </p>
            <CriteriaBars criteria={rating.feedback.criteria} compact />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No feedback from your mentor yet.</p>
        )}

        {notes.length > 0 && (
          <ul className="space-y-2">
            {notes.map((f) => (
              <li key={f.mentorId} className="rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-700 dark:bg-white/5 dark:text-slate-300">
                <span className="font-medium text-slate-900">{f.mentorName}: </span>{f.note}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }
  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Sparkles className="h-4 w-4 text-brand-600" aria-hidden /> Your participation
          </h2>
          {rating?.basis && <p className="mt-0.5 text-xs text-muted-foreground">{BASIS_TEXT[rating.basis]}</p>}
        </div>
        {rating?.stars != null && (
          <div className="flex items-center gap-2">
            <StarRating value={rating.stars} size="lg" />
            <span className="text-sm font-semibold tabular-nums text-slate-900">{rating.stars.toFixed(1)}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricTile compact label="Speaking time" value={fmtTalk(member.meeting.talkSeconds)} icon={Clock} tone={0} hint={member.meeting.joined ? 'In the meeting' : 'You did not join the meeting'} />
        <MetricTile compact label="Messages" value={member.messageCount} icon={MessageCircle} tone={1} hint="In the group chat" />
        <MetricTile compact label="Voice notes" value={member.voiceCount} icon={Mic} tone={2} hint="Recorded in the chat" />
        <MetricTile compact label="Files shared" value={files} icon={ImageIcon} tone={3} hint="Images, videos and files" />
      </div>

      {data.feedbackHiddenUntilEnd ? (
        <p className="rounded-xl bg-muted/50 px-3 py-4 text-center text-xs text-muted-foreground">
          Your mentor&apos;s feedback shows here once the meeting ends.
        </p>
      ) : feedback.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
              Mentor feedback{feedback.length > 1 ? ` (${feedback.length} mentors, averaged)` : ''}
            </p>
            {rating?.feedback.criteria && <CriteriaBars criteria={rating.feedback.criteria} />}
          </div>
          <ul className="space-y-2">
            {feedback.filter((f) => f.note).map((f) => (
              <li key={f.mentorId} className="rounded-xl border border-border bg-muted/30 px-3 py-2.5">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">{f.mentorName}</p>
                <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">{f.note}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="rounded-xl bg-muted/50 px-3 py-4 text-center text-xs text-muted-foreground">No feedback from your mentor yet.</p>
      )}
    </section>
  );
}
