'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  CircleDashed, ClipboardList, Eye, MessageCircle, Paperclip, Search, TrendingDown, TrendingUp, UserCheck, UserX, X, type LucideIcon,
} from 'lucide-react';
import { Avatar } from '@/components/shared/Avatar';
import { MetricTile } from '@/components/shared/MetricTile';
import { TablePagination } from '@/components/shared/TablePagination';
import { usePagination } from '@/lib/hooks/shared/usePagination';
import { formatRelativeTime } from '@/lib/utils/date';
import type { DiscussionMember, MemberActivity } from '@/lib/services/group-discussions-api';

export const ACTIVITY: Record<MemberActivity, { label: string; tone: string; icon: LucideIcon }> = {
  more_active: { label: 'More active', icon: TrendingUp, tone: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' },
  less_active: { label: 'Less active', icon: TrendingDown, tone: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300' },
  read_only: { label: 'Read only', icon: Eye, tone: 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300' },
  not_joined: { label: 'Not joined', icon: CircleDashed, tone: 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300' },
};

type Filter = 'all' | MemberActivity;
const FILTERS: Filter[] = ['all', 'more_active', 'less_active', 'read_only', 'not_joined'];
const PAGE_SIZES = [10, 20, 50, 100];

export const memberName = (member: DiscussionMember) => `${member.firstName} ${member.lastName}`.trim() || 'Mentee';

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** What the member last did, in the words a mentor would use. */
export function lastSeen(member: Pick<DiscussionMember, 'lastMessageAt' | 'lastReadAt'>) {
  if (member.lastMessageAt) return `Last message ${formatRelativeTime(member.lastMessageAt)}`;
  if (member.lastReadAt) return `Read ${formatRelativeTime(member.lastReadAt)}, has not posted`;
  return 'Has not opened the chat';
}

/**
 * Who is taking part, answered before the list is read.
 *
 * The tiles say how the group is doing and the filters go straight to the
 * people who need a nudge. Each bar is that member's messages against the
 * group's busiest member: it shows relative activity, not the quality of what
 * they said, which is why the row states the count beside it.
 */
export function MemberProgress({ members, action, onRemove }: {
  members: DiscussionMember[];
  /** The Add mentees control. */
  action?: ReactNode;
  onRemove: (member: DiscussionMember) => void;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const pagination = usePagination({ initialLimit: PAGE_SIZES[0] });

  const counts = useMemo(() => {
    const out: Record<Filter, number> = {
      all: members.length, more_active: 0, less_active: 0, read_only: 0, not_joined: 0,
    };
    for (const member of members) out[member.activity] += 1;
    return out;
  }, [members]);

  const totals = useMemo(() => members.reduce(
    (sum, m) => ({ messages: sum.messages + m.messageCount, files: sum.files + m.fileCount }),
    { messages: 0, files: 0 },
  ), [members]);

  const busiest = Math.max(1, ...members.map((m) => m.messageCount));
  const taking = counts.more_active + counts.less_active;
  const silent = counts.read_only + counts.not_joined;
  const query = search.trim().toLowerCase();
  const visible = useMemo(() => members.filter((m) => (
    (filter === 'all' || m.activity === filter)
    && (!query || memberName(m).toLowerCase().includes(query))
  )), [members, filter, query]);
  const hasTasks = members.some((m) => m.task);

  const { setTotal, reset, goToPage, page, totalPages, offset, limit } = pagination;
  useEffect(() => { setTotal(visible.length); }, [visible.length, setTotal]);
  // A new filter or search starts from the first page.
  useEffect(() => { reset(); }, [filter, query, reset]);
  // Removing the last member on the last page must not leave an empty page.
  useEffect(() => { if (page > totalPages) goToPage(totalPages); }, [page, totalPages, goToPage]);
  const paged = visible.slice(offset, offset + limit);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricTile compact label="Taking part" value={`${taking}/${members.length}`} icon={UserCheck} tone={0} hint="Posted at least once" />
        <MetricTile compact label="Not posting" value={silent} icon={UserX} tone={1} hint={`${counts.read_only} reading, ${counts.not_joined} not joined`} />
        <MetricTile compact label="Messages" value={totals.messages} icon={MessageCircle} tone={2} hint="From mentees in this group" />
        <MetricTile compact label="Files shared" value={totals.files} icon={Paperclip} tone={3} hint="Images, videos and voice notes" />
      </div>

      <section className="rounded-2xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">Mentee progress</h2>
          {action}
        </div>

        <div className="flex flex-col gap-2 border-b border-border px-4 py-2.5 md:flex-row md:items-center">
          <div className="flex min-w-0 gap-1.5 overflow-x-auto">
          {FILTERS.map((key) => {
            const Icon = key === 'all' ? null : ACTIVITY[key].icon;
            const active = filter === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                aria-pressed={active}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  active
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-border bg-card text-slate-600 hover:bg-muted'
                }`}
              >
                {Icon && <Icon className="h-3.5 w-3.5" aria-hidden />}
                {key === 'all' ? 'All' : ACTIVITY[key].label}
                <span className="tabular-nums opacity-75">{counts[key]}</span>
              </button>
            );
          })}
          </div>
          {members.length > 0 && (
            <div className="relative md:ml-auto md:w-64 md:shrink-0">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search mentees…"
                aria-label="Search mentees"
                className="w-full rounded-xl border border-border bg-background py-1.5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          )}
        </div>

        {!members.length ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nobody in this group yet.</p>
        ) : !visible.length ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            {query ? `No mentee matches "${search.trim()}".` : 'Nobody here right now.'}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {paged.map((member) => {
              const activity = ACTIVITY[member.activity];
              const ActivityIcon = activity.icon;
              const width = member.messageCount ? Math.max(4, (member.messageCount / busiest) * 100) : 0;
              return (
                <li key={member.userId} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2 gap-y-2 px-4 py-3 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto_auto] md:gap-x-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={memberName(member)} src={member.profilePictureUrl} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{memberName(member)}</p>
                      <p className="truncate text-xs text-muted-foreground">{lastSeen(member)}</p>
                    </div>
                  </div>

                  <div className="order-last col-span-3 min-w-0 md:order-none md:col-span-1">
                    <div
                      className="h-1.5 overflow-hidden rounded-full bg-muted"
                      title={`${plural(member.messageCount, 'message')}, ${plural(member.fileCount, 'file')}`}
                    >
                      <div className="h-full rounded-full bg-brand-600" style={{ width: `${width}%` }} />
                    </div>
                    <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                      {plural(member.messageCount, 'message')} · {plural(member.fileCount, 'file')}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-1.5 md:min-w-44">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${activity.tone}`}>
                      <ActivityIcon className="h-3 w-3" aria-hidden />
                      {activity.label}
                    </span>
                    {hasTasks && member.task && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium capitalize text-muted-foreground">
                        <ClipboardList className="h-3 w-3" aria-hidden />
                        {member.task.status.replace(/_/g, ' ')}
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => onRemove(member)}
                    aria-label={`Remove ${memberName(member)}`}
                    title={`Remove ${memberName(member)} from this group`}
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {visible.length > PAGE_SIZES[0] && (
          <TablePagination pagination={pagination} pageSizeOptions={PAGE_SIZES} className="border-t border-border !px-4" />
        )}
      </section>
    </div>
  );
}
