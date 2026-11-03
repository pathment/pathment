'use client';

import type { ReactNode } from 'react';
import { CalendarClock, Users } from 'lucide-react';
import type { DiscussionState, DiscussionWindowFields, MyDiscussionGroup } from '@/lib/services/group-discussions-api';

const STATE_LABEL: Record<DiscussionState, string> = { open: 'Open', upcoming: 'Upcoming', ended: 'Ended' };
const STATE_TONE: Record<DiscussionState, string> = {
  open: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  upcoming: 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300',
  ended: 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300',
};

const STATE_ORDER: Record<DiscussionState, number> = { open: 0, upcoming: 1, ended: 2 };

/** What a mentee reads in place of the composer. */
export const DISCUSSION_CLOSED_NOTE: Record<DiscussionState, string> = {
  open: '',
  upcoming: 'This discussion is not open yet.',
  ended: 'This discussion has ended. You can still read it.',
};

/** Open discussions first, then what is coming, then what has ended. */
export const sortDiscussions = <T extends { state: DiscussionState }>(groups: T[]) =>
  [...groups].sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state]);

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export function DiscussionStateBadge({ state }: { state: DiscussionState }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATE_TONE[state]}`}>
      {STATE_LABEL[state]}
    </span>
  );
}

/** One line saying when a group runs, for the mentor's and the mentee's lists. */
export function discussionTimeLabel(group: DiscussionWindowFields & {
  repeat: 'none' | 'weekly';
  dayOfWeek?: number | null;
  timeLocal?: string | null;
}) {
  if (group.repeat === 'weekly') {
    const day = group.dayOfWeek != null ? DAYS[group.dayOfWeek] : 'week';
    return `Every ${day}${group.timeLocal ? ` at ${group.timeLocal}` : ''}`;
  }
  if (group.opensAt && group.closesAt) return `${when(group.opensAt)} to ${when(group.closesAt)}`;
  if (group.closesAt) return `Until ${when(group.closesAt)}`;
  if (group.opensAt) return `From ${when(group.opensAt)}`;
  return 'No time limit';
}

/** Where the group stands right now, for the header of its chat. */
export function discussionStateHint(group: DiscussionWindowFields) {
  if (group.state === 'open') return group.closesAt ? `Open until ${when(group.closesAt)}` : 'Open with no time limit';
  if (group.state === 'upcoming') return group.opensAt ? `Opens ${when(group.opensAt)}` : 'Not open yet';
  return 'This discussion has ended';
}

/** Which group this is and when it runs, as on a mentee's task row. */
export function DiscussionMeta({ group, children }: { group: MyDiscussionGroup; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
      <span className="flex items-center gap-1.5">
        <Users className="h-4 w-4 shrink-0" aria-hidden />
        {group.name}{group.clanName ? ` · ${group.clanName}` : ''}
      </span>
      <span className="flex items-center gap-1.5">
        <CalendarClock className="h-4 w-4 shrink-0" aria-hidden />
        {discussionTimeLabel(group)}
      </span>
      {children}
    </div>
  );
}
