import type { DiscussionMeeting } from '@/lib/services/group-discussions-api';
import { dateInZone, formatMeeting, formatTime } from '@/lib/utils/datetime';

/** Talk time: seconds under a minute, then minutes (and hours past sixty). */
export function fmtTalk(seconds: number) {
  const s = Math.max(0, Math.round(seconds || 0));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

/**
 * The meeting's time line: start, and the end when it has one. Rendered with
 * the app's shared meeting format, in the viewer's timezone with its label.
 */
export function meetingTimeLabel(meeting: Pick<DiscussionMeeting, 'startsAt' | 'endsAt'>) {
  if (!meeting.endsAt) return formatMeeting(meeting.startsAt);
  const sameDay = dateInZone(meeting.startsAt) === dateInZone(meeting.endsAt);
  return `${formatMeeting(meeting.startsAt)} – ${sameDay ? formatTime(meeting.endsAt) : formatMeeting(meeting.endsAt)}`;
}

/** "in 5 min", "in 2 h", or "now", for a start still ahead. */
export function untilLabel(iso: string, now = Date.now()) {
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return 'now';
  const min = Math.ceil(ms / 60000);
  if (min < 60) return `in ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `in ${h} h` : `in ${Math.round(h / 24)} d`;
}
