import type { DiscussionMeeting } from '@/lib/services/group-discussions-api';

/** Talk time: seconds under a minute, then minutes (and hours past sixty). */
export function fmtTalk(seconds: number) {
  const s = Math.max(0, Math.round(seconds || 0));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** The viewer's own timezone, e.g. "Asia/Karachi". */
export const viewerZone = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'local time'; } catch { return 'local time'; }
};

/** An instant in the viewer's timezone: "Wed 5 Nov, 3:00 PM". */
export const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/** The meeting's time line: start, and the end when it has one. */
export function meetingTimeLabel(meeting: Pick<DiscussionMeeting, 'startsAt' | 'endsAt'>) {
  if (!meeting.endsAt) return fmtWhen(meeting.startsAt);
  const sameDay = new Date(meeting.startsAt).toDateString() === new Date(meeting.endsAt).toDateString();
  const end = sameDay
    ? new Date(meeting.endsAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : fmtWhen(meeting.endsAt);
  return `${fmtWhen(meeting.startsAt)} – ${end}`;
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

/** An ISO instant as the value a datetime-local input wants, in the viewer's zone. */
export function toLocalInput(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
