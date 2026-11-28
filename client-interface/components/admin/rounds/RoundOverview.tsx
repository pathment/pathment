'use client';

import { AlertTriangle, CalendarDays, CheckCircle2, ChevronRight, ClipboardCheck, Target, UsersRound, Waypoints } from 'lucide-react';
import { MetricTile } from '@/components/shared/MetricTile';
import type { RoundDetail } from '@/lib/services/round-api';
import { PanelHeader, fmtDate, panel } from '@/components/admin/pools/poolUi';

/**
 * Where everybody is, and what needs a person right now.
 *
 * The mirror of the pool's Overview, asking the questions a round that is a
 * clan actually has. Two of them are new and are the whole reason this screen
 * is not the pool's: a candidate with no level, and a candidate at a level
 * this round sets no work for. Both are silent by design — they are given
 * nothing and told nothing — so if the screen does not say so, nobody finds
 * out until the ranking looks wrong.
 */
export function RoundOverview({ data, onGo, onManage }: {
  data: RoundDetail;
  onGo: (tab: string) => void;
  onManage: (panel: 'work' | 'settings' | 'intake') => void;
}) {
  const { round, candidates, awaitingReview } = data;
  const live = candidates.filter((c) => !['withdrawn', 'disqualified'].includes(c.decision || ''));
  const selected = candidates.filter((c) => c.decision === 'selected').length;
  const placed = candidates.filter((c) => c.placementStatus === 'placed').length;
  const pendingPlacement = selected - placed;
  const failedPlacements = candidates.filter((c) => c.placementStatus === 'failed').length;
  const noLevel = live.filter((c) => c.noWorkReason === 'no_level').length;
  const noRule = live.filter((c) => c.noWorkReason === 'no_rule_for_level').length;
  const reviewPeople = live.filter((c) => c.work.awaitingReview > 0).length;
  const scoredSomething = live.filter((c) => c.work.scored > 0).length;

  const attention = [
    !round.levelRules.length && {
      text: 'No work is set for any level yet, so nobody is being given anything',
      go: () => onManage('work'),
    },
    !round.cohort && !candidates.length && {
      text: 'No intake feeds this round, so nobody arrives in it automatically',
      go: () => onManage('intake'),
    },
    noLevel > 0 && {
      text: `${noLevel} candidate${noLevel === 1 ? ' has' : 's have'} no level, so they have been given nothing`,
      go: () => onGo('candidates'),
    },
    noRule > 0 && {
      text: `${noRule} candidate${noRule === 1 ? ' is' : 's are'} at a level this round sets no work for`,
      go: () => onManage('work'),
    },
    awaitingReview > 0 && {
      text: `${awaitingReview} piece${awaitingReview === 1 ? ' of work is' : 's of work are'} waiting for a review`,
      go: () => onGo('candidates'),
    },
    failedPlacements > 0 && {
      text: `${failedPlacements} placement${failedPlacements === 1 ? '' : 's'} failed, so fix and retry`,
      go: () => onGo('selection'),
    },
    pendingPlacement > 0 && failedPlacements === 0 && {
      text: `${pendingPlacement} selected candidate${pendingPlacement === 1 ? '' : 's'} not placed yet`,
      go: () => onGo('selection'),
    },
  ].filter(Boolean) as { text: string; go: () => void }[];

  const muted = (text: string) => <span className="ml-1 text-xs font-normal text-muted-foreground">{text}</span>;
  const facts: { label: string; value: React.ReactNode }[] = [
    { label: 'Intake', value: round.cohort?.name || 'Not attached' },
    { label: 'Qualification deadline', value: fmtDate(round.settings.qualificationDueAt) },
    { label: 'Levels with work', value: <>{round.levelRules.length}{round.levelRules.length ? null : muted('nobody is given anything')}</> },
    { label: 'Waitlist', value: <>{round.settings.waitlistSize}{muted('places after the quota')}</> },
    { label: 'Started their work', value: <>{scoredSomething}{muted('something approved')}</> },
    { label: 'Waiting on a reviewer', value: <>{reviewPeople}{muted('candidates')}</> },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <button onClick={() => onGo('candidates')} className="text-left">
          <MetricTile
            label="Candidates" value={live.length} icon={UsersRound} tone={0} compact
            hint={round.cohort ? `From ${round.cohort.name}` : 'Added by hand'}
          />
        </button>
        <button onClick={() => onGo('candidates')} className="text-left">
          <MetricTile
            label="Needs review" value={awaitingReview} icon={ClipboardCheck} tone={1} compact
            hint={awaitingReview ? `Handed in by ${reviewPeople} candidate${reviewPeople === 1 ? '' : 's'}` : 'Nothing handed in to review'}
          />
        </button>
        <button onClick={() => onGo('selection')} className="text-left">
          <MetricTile label="Selected" value={`${selected} / ${round.settings.quota}`} icon={Target} tone={2} hint="Against the quota" compact />
        </button>
        <button onClick={() => onGo('selection')} className="text-left">
          <MetricTile
            label="Placed in a clan" value={placed} icon={Waypoints} tone={3} compact
            hint={pendingPlacement ? `${pendingPlacement} still to place` : 'Nobody waiting to be placed'}
          />
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className={panel}>
          <PanelHeader icon={AlertTriangle} title="Needs attention" count={attention.length} />
          <div className="px-5 pb-5 sm:px-6 sm:pb-6">
            {attention.length === 0 ? (
              <p className="flex items-center gap-2 rounded-2xl border border-border bg-muted/50 px-4 py-3 text-sm text-slate-600">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> Nothing is waiting on a person right now.
              </p>
            ) : (
              <ul className="space-y-2">
                {attention.map((a) => (
                  <li key={a.text}>
                    <button onClick={a.go} className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-left text-sm text-slate-700 transition-colors hover:bg-muted">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" aria-hidden="true" />
                      <span className="flex-1">{a.text}</span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className={panel}>
          <PanelHeader icon={CalendarDays} title="The round" />
          <dl className="grid grid-cols-2 border-t border-border">
            {facts.map((f, i) => (
              <div key={f.label} className={`px-5 py-3 sm:px-6 ${i % 2 ? 'border-l border-border' : ''} ${i > 1 ? 'border-t border-border' : ''}`}>
                <dt className="text-xs text-muted-foreground">{f.label}</dt>
                <dd className="mt-0.5 text-sm font-medium text-slate-900 tabular-nums">{f.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </div>
  );
}
