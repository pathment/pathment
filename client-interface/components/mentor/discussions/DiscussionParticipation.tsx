'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  Check, ChevronDown, Heart, Loader2, MessageSquareQuote, Star, Video,
} from 'lucide-react';
import { StarRating } from '@/components/shared/StarRating';
import { CriteriaBars } from '@/components/shared/discussions/meeting/CriteriaBars';
import { ParticipationStats } from '@/components/shared/discussions/meeting/ParticipationStats';
import { fmtTalk } from '@/components/shared/discussions/meeting/meetingFormat';
import { DiscussionStateBadge } from '@/components/shared/discussions/DiscussionStatus';
import { ACTIVITY, lastSeen } from './MemberProgress';
import { FeedbackForm } from './FeedbackForm';
import { groupDiscussionsApi, type DiscussionParticipation as Participation } from '@/lib/services/group-discussions-api';
import { useAuth } from '@/lib/context/AuthContext';
import { useApiQuery, useInvalidate, qk } from '@/lib/query';

const DAY = 24 * 60 * 60 * 1000;
/** The chart shows at most this many days, the latest ones. */
const MAX_DAYS = 30;

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
const dayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const dayLabel = (date: Date) => date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const shortWhen = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/**
 * Messages per day across the discussion, in the reader's own days: from when
 * it opened (or the first message) to when it closed, or today if sooner.
 */
function dailySeries(data: Participation) {
  const times = data.messageTimes.map((t) => new Date(t));
  const now = new Date();
  const opened = data.group.opensAt ? new Date(data.group.opensAt) : times[0] ?? now;
  const closed = data.group.closesAt ? new Date(data.group.closesAt) : now;
  const end = closed < now ? closed : now;
  let start = opened < end ? opened : end;
  if ((end.getTime() - start.getTime()) / DAY > MAX_DAYS - 1) start = new Date(end.getTime() - (MAX_DAYS - 1) * DAY);

  const counts = new Map<string, number>();
  for (const time of times) counts.set(dayKey(time), (counts.get(dayKey(time)) ?? 0) + 1);

  const days: { key: string; label: string; count: number }[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (cursor <= last) {
    days.push({ key: dayKey(cursor), label: dayLabel(cursor), count: counts.get(dayKey(cursor)) ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

const BASIS_TEXT = {
  both: 'Your feedback 70% · their activity against the group 30%',
  feedback: 'From mentor feedback only',
  activity: 'Activity only: nobody has given feedback yet',
} as const;
const PART_LABEL = { messages: 'Messages', talk: 'Speaking', voice: 'Voice notes', files: 'Files' } as const;

/** The meeting, as the app's status pills read: joined (with when), or not. */
function MeetingPill({ meeting }: { meeting: Participation['meeting'] }) {
  if (!meeting) {
    return <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300"><Video className="h-3 w-3" aria-hidden /> No meeting yet</span>;
  }
  return meeting.joined ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
      <Check className="h-3 w-3" aria-hidden /> Joined the meeting{meeting.joinedAt ? ` · ${shortWhen(meeting.joinedAt)}` : ''}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
      <Video className="h-3 w-3" aria-hidden /> Did not join the meeting
    </span>
  );
}

/**
 * How a mentee took part in the group behind their Group Discussion task, laid
 * out for the mentor reviewing it, most important first:
 *
 *   1. the verdict: their stars and what the stars are built from
 *   2. the facts: did they join, how long they spoke, what they posted
 *   3. the mentor's own feedback, given right here (with `canRate`)
 *   4. the detail, folded: the activity behind the stars, other mentors'
 *      notes, the chat against the group and per day
 *
 * The stars above and the Quality rating at the bottom of the review drawer
 * follow whatever the mentor saves in step 3.
 */
export function DiscussionParticipation({ taskId, menteeId, menteeName, canRate = false }: {
  taskId: string;
  menteeName?: string;
  /** With `canRate`, the reviewing mentor gives their feedback right here. */
  menteeId?: string;
  canRate?: boolean;
}) {
  const { user } = useAuth();
  const invalidate = useInvalidate();
  const { data, loading, refetch } = useApiQuery({
    queryKey: qk.mentor.discussionParticipation(taskId),
    queryFn: () => groupDiscussionsApi.participation(taskId),
    refetchInterval: 60_000,
  });
  const days = useMemo(() => (data ? dailySeries(data) : []), [data]);

  if (loading) {
    return (
      <div className="flex justify-center rounded-2xl border border-slate-200 bg-card p-6 dark:border-slate-800">
        <Loader2 className="h-5 w-5 animate-spin text-brand-600" aria-label="Loading participation" />
      </div>
    );
  }
  // No group behind the task any more (the mentee was removed from it).
  if (!data) return null;

  const { group, member, groupStats, rating, meeting, feedback = [] } = data;
  const chat = ACTIVITY[member.activity];
  const ChatIcon = chat.icon;
  const scale = Math.max(groupStats.maxMessages, member.messageCount, 1);
  const average = Math.round(groupStats.averageMessages * 10) / 10;
  const activeDays = days.filter((day) => day.count > 0).length;
  const parts = Object.entries(rating?.activity.parts ?? {}) as [keyof typeof PART_LABEL, number][];
  const mine = feedback.find((f) => f.mentorId === user?.id) ?? null;
  const others = feedback.filter((f) => f.mentorId !== user?.id);
  const rateHere = canRate && !!menteeId;
  const notes = (rateHere ? others : feedback).filter((f) => f.note);

  return (
    <section className="space-y-5 rounded-2xl border border-slate-200 bg-card p-4 shadow-sm sm:p-5 dark:border-slate-800">
      {/* What this is */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
            <MessageSquareQuote className="h-4 w-4 text-brand-600" aria-hidden />
            Group discussion
          </h3>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {group.scenarioTitle ? `${group.scenarioTitle} · ` : ''}{group.name}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DiscussionStateBadge state={group.state} />
          <Link href={`/mentor/messages?discussion=${group.id}`} className="text-xs font-medium text-brand-600 hover:text-brand-700">
            Open chat →
          </Link>
        </div>
        <div className="basis-full">
          <MeetingPill meeting={meeting} />
        </div>
      </div>

      {/* 1. The verdict. While reviewing, the stars live in the drawer's
          Quality rating instead, like every other task, where they can be changed. */}
      {!rateHere && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200/70 bg-amber-50/50 px-4 py-3 dark:border-amber-500/20 dark:bg-amber-500/5">
          <StarRating value={rating?.stars ?? null} size="lg" />
          <div>
            <p className="text-base font-bold tabular-nums text-slate-900">
              {rating?.stars != null ? `${rating.stars.toFixed(1)} / 5` : 'Not rated yet'}
            </p>
            <p className="text-[11px] text-muted-foreground">{rating?.basis ? BASIS_TEXT[rating.basis] : 'No feedback or activity yet'}</p>
          </div>
        </div>
      )}

      {/* 2. What they did: the app's stat tiles, as on the group's own page. */}
      <ParticipationStats
        talkSeconds={meeting?.talkSeconds ?? 0}
        messageCount={member.messageCount}
        voiceCount={member.voiceCount}
        imageCount={member.imageCount}
        videoCount={member.videoCount}
        fileCount={member.fileCount}
        talkHint={data.groupMax?.talk ? `Most in the group: ${fmtTalk(data.groupMax.talk)}` : 'Nobody has spoken yet'}
        messagesHint={groupStats.rank ? `#${groupStats.rank} of ${groupStats.memberCount} in the group` : `${groupStats.memberCount} in the group`}
      />

      {/* 3. The mentor's feedback */}
      {rateHere ? (
        <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
          <h3 className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
            <Star className="h-4 w-4 text-amber-500" aria-hidden />
            {mine ? 'Your feedback' : 'Give your feedback'}
          </h3>
          <p className="mb-3 mt-0.5 text-xs text-muted-foreground">
            Each slider starts at 50%. Add a note if you like, then save; the Quality rating below follows it.
          </p>
          <FeedbackForm
            key={menteeId}
            groupId={group.id}
            menteeId={menteeId!}
            menteeName={menteeName ?? 'the mentee'}
            initial={mine}
            onSaved={() => { refetch(); invalidate(qk.mentor.discussionMeeting(group.id), qk.mentor.discussionMeetingSummary(group.id)); }}
            compact
          />
        </div>
      ) : rating?.feedback.criteria ? (
        <div>
          <p className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
            Mentor feedback{rating.feedback.raters > 1 ? ` (${rating.feedback.raters} mentors, averaged)` : ''}
          </p>
          <CriteriaBars criteria={rating.feedback.criteria} compact />
        </div>
      ) : null}

      {notes.length > 0 && (
        <ul className="space-y-2">
          {notes.map((f) => (
            <li key={f.mentorId} className="rounded-lg bg-muted/40 px-3 py-2 text-sm text-slate-700 dark:text-slate-300">
              <span className="text-xs font-semibold text-slate-900">{f.mentorName}: </span>{f.note}
            </li>
          ))}
        </ul>
      )}

      {/* 4. The detail, folded */}
      <details className="group/details rounded-xl border border-border">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-muted/40 dark:text-slate-300 [&::-webkit-details-marker]:hidden">
          <span>How the stars are worked out, and chat activity</span>
          <ChevronDown className="h-4 w-4 text-slate-400 transition-transform group-open/details:rotate-180" aria-hidden />
        </summary>
        <div className="space-y-5 border-t border-border px-4 py-4">
          <div>
            <p className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-300">Activity against the busiest member (30% of the stars)</p>
            {parts.length ? (
              <ul className="space-y-1.5">
                {parts.map(([key, share]) => (
                  <li key={key}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="text-slate-700 dark:text-slate-300">{PART_LABEL[key]}</span>
                      <span className="tabular-nums text-muted-foreground">{Math.round(share * 100)}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-slate-500 dark:bg-slate-400" style={{ width: `${share * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : <p className="text-xs text-muted-foreground">Nobody in the group has posted or spoken yet.</p>}
            <p className="mt-2 text-[11px] text-muted-foreground">A measure nobody in the group used is left out, so a quiet group is not marked down.</p>
          </div>

          {rateHere && others.length > 0 && rating?.feedback.criteria && (
            <div>
              <p className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-300">All mentors&apos; feedback, averaged ({rating.feedback.raters})</p>
              <CriteriaBars criteria={rating.feedback.criteria} compact />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${chat.tone}`}>
              <ChatIcon className="h-3 w-3" aria-hidden /> Chat: {chat.label}
            </span>
            <span className="inline-flex items-center gap-1"><Heart className="h-3 w-3" aria-hidden />{plural(member.reactionsReceived, 'reaction')} received</span>
            <span>{member.textCount} with text</span>
            <span>{lastSeen(member)}</span>
          </div>

          {/* Against the group: their messages on a track that ends at the busiest
              member, with the group's average marked. */}
          <div>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Messages compared with the group</p>
              <p className="text-xs text-muted-foreground">
                {groupStats.rank ? `#${groupStats.rank} of ${groupStats.memberCount}` : `${groupStats.memberCount} members`}
                {` · group average ${average}`}
              </p>
            </div>
            <div
              className="relative h-2.5 rounded-full bg-slate-100 dark:bg-white/10"
              role="img"
              aria-label={`${plural(member.messageCount, 'message')}; the group average is ${average} and the most active member sent ${groupStats.maxMessages}`}
            >
              <div className="h-full rounded-full bg-brand-600" style={{ width: `${(member.messageCount / scale) * 100}%` }} />
              <span
                className="absolute -top-1 h-4.5 w-0.5 rounded-full bg-slate-500 ring-2 ring-card dark:bg-slate-300"
                style={{ left: `${(groupStats.averageMessages / scale) * 100}%` }}
                title={`Group average: ${average}`}
                aria-hidden
              />
            </div>
            <div className="mt-1.5 flex justify-between text-[11px] tabular-nums text-muted-foreground">
              <span>0</span>
              <span>Most active: {groupStats.maxMessages}</span>
            </div>
          </div>

          <div>
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Messages per day</p>
              <p className="text-xs text-muted-foreground">
                {member.messageCount ? `Active on ${plural(activeDays, 'day')}` : 'No messages yet'}
              </p>
            </div>
            {member.messageCount > 0 ? (
              <div className="h-36 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={days} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                    <XAxis
                      dataKey="label"
                      axisLine={false}
                      tickLine={false}
                      interval="preserveStartEnd"
                      minTickGap={16}
                      tick={{ fill: '#64748b', fontSize: 11 }}
                    />
                    <YAxis hide allowDecimals={false} domain={[0, 'auto']} />
                    <Tooltip
                      cursor={{ fill: 'rgba(100, 116, 139, 0.08)' }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const day = payload[0].payload as (typeof days)[number];
                        return (
                          <div className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-medium text-white shadow-lg">
                            {day.label}: {plural(day.count, 'message')}
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="count" fill="var(--color-brand-600)" radius={[4, 4, 0, 0]} maxBarSize={18} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="rounded-xl bg-muted/50 px-3 py-4 text-center text-xs text-muted-foreground">
                Nothing posted in the chat yet.
              </p>
            )}
            {/* The same numbers as a table, for screen readers. */}
            <table className="sr-only">
              <caption>Messages per day</caption>
              <tbody>
                {days.map((day) => (
                  <tr key={day.key}><th scope="row">{day.label}</th><td>{day.count}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </details>
    </section>
  );
}
