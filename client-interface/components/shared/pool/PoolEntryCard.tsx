'use client';

import { Clock, Snowflake, CheckCircle2, Loader2, Undo2, Map } from 'lucide-react';
import { Avatar } from '@/components/shared/Avatar';
import type { PoolEntry, HandoverReason } from '@/lib/services/handover-pool-api';

/**
 * One mentee waiting for a clan.
 *
 * This card is a decision, not a record, so it is built around the question a
 * mentor is actually asking: who is this, how far did they get, why are they
 * being handed on, and how long has nobody taken them.
 *
 * The waiting time is the one thing deliberately allowed to shout. An offer
 * nobody takes is this feature's failure state — a mentee with no mentor and
 * nobody noticing — and it is invisible unless something on the screen gets
 * louder as the days pass, so it does: quiet under a week, amber after one,
 * red after two.
 */

const REASON_LABEL: Record<HandoverReason, string> = {
  program_closed: 'Programme closed',
  mentor_leaving: 'Mentor stepping away',
  capacity: 'Over capacity',
  fit: 'Not the right fit',
  mentee_request: 'They asked to move',
  other: 'Other',
};

function Waiting({ days }: { days: number }) {
  const tone = days >= 14
    ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
    : days >= 7
      ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
      : 'bg-muted text-muted-foreground';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
      <Clock className="h-3 w-3" aria-hidden />
      {days === 0 ? 'Added today' : days === 1 ? 'Waiting 1 day' : `Waiting ${days} days`}
    </span>
  );
}

const lastSeen = (iso: string | null) => {
  if (!iso) return 'no activity yet';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'active today';
  if (days === 1) return 'active yesterday';
  return `active ${days} days ago`;
};

export function PoolEntryCard({
  entry,
  busy = false,
  onClaim,
  onWithdraw,
}: {
  entry: PoolEntry;
  busy?: boolean;
  /** Omitted when the viewer has nowhere to pull them into. */
  onClaim?: (entry: PoolEntry) => void;
  /** Omitted when the viewer did not push them and is not an admin. */
  onWithdraw?: (entry: PoolEntry) => void;
}) {
  const settled = entry.status !== 'open';

  return (
    <li className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start gap-3">
        <Avatar name={entry.mentee?.name} src={entry.mentee?.avatarUrl} size="md" />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-semibold text-foreground">{entry.mentee?.name || 'Mentee'}</p>
            {entry.status === 'open' && <Waiting days={entry.waitingDays} />}
            {entry.status === 'claimed' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                <CheckCircle2 className="h-3 w-3" aria-hidden />
                Taken by {entry.claimedClan?.name || 'another clan'}
              </span>
            )}
            {entry.status === 'withdrawn' && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                Withdrawn
              </span>
            )}
          </div>

          <p className="mt-0.5 text-sm text-muted-foreground">
            {entry.program?.name || 'No programme'}
            {entry.fromClan && (
              <>
                {' '}&middot; from <span className="text-foreground">{entry.fromClan.name}</span>
                {entry.fromClan.frozen && (
                  <span className="ml-1 inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                    <Snowflake className="h-3 w-3" aria-hidden /> closed
                  </span>
                )}
              </>
            )}
            {entry.pushedByName && <> &middot; handed over by {entry.pushedByName}</>}
          </p>

          <p className="mt-2 text-sm text-foreground">
            <span className="font-medium">{entry.work.completed}</span>
            <span className="text-muted-foreground"> of {entry.work.tasks} tasks done</span>
            <span className="text-muted-foreground"> &middot; {lastSeen(entry.work.lastActiveAt)}</span>
          </p>

          {!!entry.work.roadmaps?.length && (
            <div className="mt-2.5 flex flex-wrap gap-2">
              {entry.work.roadmaps.slice(0, 3).map((roadmap) => (
                <span key={roadmap.id} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-2.5 py-1 text-xs text-foreground">
                  <Map className="h-3 w-3 text-muted-foreground" aria-hidden />
                  <span className="max-w-48 truncate">{roadmap.name}</span>
                  <span className="text-muted-foreground">{roadmap.completed}/{roadmap.tasks}</span>
                </span>
              ))}
              {entry.work.roadmaps.length > 3 && (
                <span className="px-1 py-1 text-xs text-muted-foreground">+{entry.work.roadmaps.length - 3} more</span>
              )}
            </div>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {entry.reason && (
              <span className="rounded-lg bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {REASON_LABEL[entry.reason] || entry.reason}
              </span>
            )}
          </div>

          {entry.handoverNote && (
            <blockquote className="mt-2.5 rounded-xl border-l-2 border-brand-300 bg-muted/40 px-3 py-2 text-sm text-foreground">
              {entry.handoverNote}
            </blockquote>
          )}
        </div>

        {!settled && (onClaim || onWithdraw) && (
          <div className="flex shrink-0 flex-wrap gap-2">
            {onClaim && (
              <button
                type="button" onClick={() => onClaim(entry)} disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                Take into my clan
              </button>
            )}
            {onWithdraw && (
              <button
                type="button" onClick={() => onWithdraw(entry)} disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
              >
                <Undo2 className="h-4 w-4" aria-hidden /> Remove from pool
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

export default PoolEntryCard;
