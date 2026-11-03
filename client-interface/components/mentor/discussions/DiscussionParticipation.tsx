'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Heart, Image as ImageIcon, Loader2, MessageCircle, MessageSquareQuote, Mic } from 'lucide-react';
import { MetricTile } from '@/components/shared/MetricTile';
import { DiscussionStateBadge } from '@/components/shared/discussions/DiscussionStatus';
import { ACTIVITY, lastSeen } from './MemberProgress';
import { groupDiscussionsApi, type DiscussionParticipation as Participation } from '@/lib/services/group-discussions-api';
import { useApiQuery, qk } from '@/lib/query';

const DAY = 24 * 60 * 60 * 1000;
/** The chart shows at most this many days, the latest ones. */
const MAX_DAYS = 30;

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
const dayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const dayLabel = (date: Date) => date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

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

/**
 * How a mentee took part in the group behind their Group Discussion task, for
 * the mentor reviewing it: what they posted, how that sits against the group,
 * and when. The counts are the ones the group's own page shows.
 */
export function DiscussionParticipation({ taskId }: { taskId: string }) {
  const { data, loading } = useApiQuery({
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

  const { group, member, groupStats } = data;
  const activity = ACTIVITY[member.activity];
  const ActivityIcon = activity.icon;
  const media = member.imageCount + member.videoCount;
  const scale = Math.max(groupStats.maxMessages, member.messageCount, 1);
  const average = Math.round(groupStats.averageMessages * 10) / 10;
  const activeDays = days.filter((day) => day.count > 0).length;

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-card p-4 shadow-sm sm:p-5 dark:border-slate-800">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
            <MessageSquareQuote className="h-4 w-4 text-brand-600" aria-hidden />
            Group discussion participation
          </h3>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {group.name}{group.scenarioTitle ? ` · ${group.scenarioTitle}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DiscussionStateBadge state={group.state} />
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${activity.tone}`}>
            <ActivityIcon className="h-3 w-3" aria-hidden /> {activity.label}
          </span>
          <Link href={`/mentor/messages?discussion=${group.id}`} className="text-xs font-medium text-brand-600 hover:text-brand-700">
            Open chat →
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <MetricTile compact label="Messages" value={member.messageCount} icon={MessageCircle} tone={0} hint={`${member.textCount} with text`} />
        <MetricTile compact label="Voice notes" value={member.voiceCount} icon={Mic} tone={1} hint="Recorded in the chat" />
        <MetricTile
          compact
          label="Images & videos"
          value={media}
          icon={ImageIcon}
          tone={2}
          hint={member.fileCount ? `+ ${plural(member.fileCount, 'other file')}` : `${member.imageCount} images, ${member.videoCount} videos`}
        />
        <MetricTile compact label="Reactions" value={member.reactionsReceived} icon={Heart} tone={3} hint="Others reacted to their messages" />
      </div>

      {/* Against the group: their messages on a track that ends at the busiest
          member, with the group's average marked. */}
      <div>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Compared with the group</p>
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
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Messages per day</p>
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
          <p className="rounded-xl bg-muted/50 px-3 py-6 text-center text-xs text-muted-foreground">
            Nothing posted yet, so there is no activity to chart.
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

      <p className="border-t border-slate-100 pt-3 text-xs text-muted-foreground dark:border-slate-800">
        {lastSeen(member)}
      </p>
    </section>
  );
}
