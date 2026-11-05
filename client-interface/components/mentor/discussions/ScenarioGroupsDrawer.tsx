'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, ChevronRight, MessageCircle, Plus, Users } from 'lucide-react';
import { Drawer } from '@/components/shared/Drawer';
import type { EntityCardStat } from '@/components/admin/EntityCard';
import { DiscussionStateBadge, discussionTimeLabel, sortDiscussions } from '@/components/shared/discussions/DiscussionStatus';
import type { DiscussionScenario, DiscussionState } from '@/lib/services/group-discussions-api';
import { MeetingChip } from '@/components/shared/discussions/meeting/MeetingChip';

type Filter = 'all' | DiscussionState;
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'ended', label: 'Ended' },
];

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/**
 * Every group of one scenario, opened from its card so the card keeps its
 * size. The facts repeat the card's, the chips narrow to what is running, and
 * each group opens its page.
 */
export function ScenarioGroupsDrawer({ open, onClose, scenario, stats, dates, onNewGroup }: {
  open: boolean;
  onClose: () => void;
  scenario: DiscussionScenario;
  /** The card's own facts, so the two always agree. */
  stats: EntityCardStat[];
  /** When the groups run, as the card's footer says it. */
  dates: string;
  onNewGroup: () => void;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const sorted = useMemo(() => sortDiscussions(scenario.groups), [scenario.groups]);

  const counts = useMemo(() => {
    const out: Record<Filter, number> = { all: sorted.length, open: 0, upcoming: 0, ended: 0 };
    for (const group of sorted) out[group.state] += 1;
    return out;
  }, [sorted]);
  const visible = filter === 'all' ? sorted : sorted.filter((group) => group.state === filter);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={scenario.title}
      subtitle={`${plural(sorted.length, 'group')} · ${dates}`}
      footer={(dismiss) => (
        <button
          type="button"
          onClick={() => { dismiss(); onNewGroup(); }}
          className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" /> New group
        </button>
      )}
    >
      <div className="space-y-5">
        <dl className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-muted/30 p-4 sm:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="min-w-0">
              <dt className="truncate text-xs text-slate-500">{stat.label}</dt>
              <dd className={`mt-1 truncate text-base font-semibold tabular-nums ${
                stat.tone === 'good' ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-900'
              }`}>{stat.value}</dd>
            </div>
          ))}
        </dl>

        <div className="flex gap-1.5 overflow-x-auto" role="group" aria-label="Filter groups">
          {FILTERS.filter(({ key }) => key === 'all' || counts[key] > 0).map(({ key, label }) => {
            const active = filter === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                aria-pressed={active}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  active ? 'border-brand-600 bg-brand-600 text-white' : 'border-border bg-card text-slate-600 hover:bg-muted'
                }`}
              >
                {label}
                <span className="tabular-nums opacity-75">{counts[key]}</span>
              </button>
            );
          })}
        </div>

        <ul className="space-y-2.5">
          {visible.map((group) => (
            <li key={group.id}>
              <Link
                href={`/mentor/group-discussions/${group.id}`}
                className="group flex items-start gap-3 rounded-xl border border-border bg-card p-4 transition-all hover:border-brand-300 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600">
                  <Users className="h-4.5 w-4.5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-slate-900 group-hover:text-brand-700">{group.name}</p>
                    <DiscussionStateBadge state={group.state} />
                  </div>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                    <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span className="truncate">{discussionTimeLabel(group)}</span>
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums text-slate-600">
                      <Users className="h-3 w-3" aria-hidden />{plural(group.memberCount, 'mentee')}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums text-slate-600">
                      <MessageCircle className="h-3 w-3" aria-hidden />{plural(group.messageCount, 'message')}
                    </span>
                    {group.meeting && (group.meeting.state === 'live' || group.meeting.state === 'scheduled') && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-slate-600">
                        <MeetingChip meeting={group.meeting} />
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight className="mt-2.5 h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </Drawer>
  );
}
