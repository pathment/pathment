'use client';

import {
  ClipboardCheck, Flag, Clock, TrendingUp, TrendingDown, Minus, ArrowUpRight, Users2, Trophy,
} from 'lucide-react';
import { DualProgress } from '@/components/mentor/DualProgress';
import { NudgeButton } from '@/components/mentor/NudgeButton';
import type { CohortMentee, CohortRisk, CohortMomentum } from '@/lib/hooks/mentor';

/**
 * The single, consistent mentee summary card. Used by the Cockpit, My Mentees
 * and At-risk screens so a mentor reads the SAME signals everywhere and never
 * has to relearn a different layout per screen:
 *   • risk badge + momentum + last-active (in-progress)
 *   • dual progress (absolute vs fair/relative) (in-progress)
 *   • work chips (to-review / blockers / on-time) (in-progress)
 *   • the plain-English risk reason (in-progress)
 *   • concrete rule-based "why" signal chips (in-progress)
 *   • OR completion summary + stats (completed)
 */

const RISK_BADGE: Record<CohortRisk, { label: string; className: string; dot: string }> = {
  high:  { label: 'At risk',  className: 'bg-red-50 text-red-700 border-red-200',           dot: 'bg-red-500' },
  watch: { label: 'Watch',    className: 'bg-amber-50 text-amber-700 border-amber-200',      dot: 'bg-amber-500' },
  low:   { label: 'On track', className: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
};

function MomentumIcon({ momentum }: { momentum: CohortMomentum }) {
  if (momentum === 'up') return <TrendingUp className="w-4 h-4 text-emerald-500" />;
  if (momentum === 'down') return <TrendingDown className="w-4 h-4 text-red-500" />;
  return <Minus className="w-4 h-4 text-slate-400" />;
}

function Avatar({ m }: { m: CohortMentee }) {
  return m.profilePictureUrl
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={m.profilePictureUrl} alt={m.name} className="w-11 h-11 rounded-full object-cover shrink-0" />
    : <div className="w-11 h-11 bg-brand-100 rounded-full flex items-center justify-center shrink-0"><span className="text-brand-700 font-medium text-sm">{m.avatar}</span></div>;
}

function formatRelativeTime(timestamp: string | null | undefined): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return '1 day ago';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffWeeks === 1) return '1 w ago';
  if (diffWeeks < 4) return `${diffWeeks} w ago`;
  if (diffMonths === 1) return '1 m ago';
  return `${diffMonths} m ago`;
}

function formatDateShort(timestamp: string | null | undefined): string {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// In-progress mentee card (existing rendering)
function InProgressCard({ m, onOpen, showClan }: { m: CohortMentee; onOpen: () => void; showClan?: boolean }) {
  const risk = RISK_BADGE[m.risk];
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      className="group text-left bg-card rounded-2xl border border-slate-200 p-5 hover:border-brand-300 hover:shadow-sm transition-all cursor-pointer"
    >
      <div className="flex items-start gap-3">
        <Avatar m={m} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-medium text-slate-900">{m.name}</p>
            <MomentumIcon momentum={m.momentum} />
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
            {m.level && m.level !== '-' && <><span>{m.level}</span><span className="text-slate-300">·</span></>}
            <span>Wk {m.week}/{m.totalWeeks || '-'}</span>
            <span className="text-slate-300">·</span>
            <Clock className="w-3 h-3" /><span>{m.lastActive}</span>
            {showClan && m.clan && (
              <><span className="text-slate-300">·</span><span className="inline-flex items-center gap-1"><Users2 className="w-3 h-3" />{m.clan.name}</span></>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-medium ${risk.className}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${risk.dot}`} />{risk.label}
          </span>
          <NudgeButton menteeId={m.id} menteeName={m.name} variant="icon" stopPropagation />
        </div>
      </div>

      <div className="my-4">
        <DualProgress absolute={m.absoluteProgress} relative={m.relativeProgress} compact />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {m.pendingApprovals > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 text-xs font-medium">
            <ClipboardCheck className="w-3 h-3" />{m.pendingApprovals} to review
          </span>
        )}
        {m.openBlockers > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 text-red-700 text-xs font-medium">
            <Flag className="w-3 h-3" />{m.openBlockers} blocker{m.openBlockers > 1 ? 's' : ''}
          </span>
        )}
        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-medium">
          {m.onTimeRate}% on-time
        </span>
      </div>

      {m.riskReason && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <span className="text-xs leading-relaxed text-slate-500">{m.riskReason}</span>
        </div>
      )}

      {(m.signals?.length ?? 0) > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {m.signals!.map((s, i) => (
            <span key={i} className="px-2 py-0.5 rounded-md border border-slate-200 bg-slate-50 text-[11px] text-slate-600 font-mono">{s}</span>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center justify-end text-xs font-medium text-brand-600 opacity-0 group-hover:opacity-100 transition-opacity">
        Open full story <ArrowUpRight className="ml-0.5 w-3.5 h-3.5" />
      </div>
    </div>
  );
}


function CompletionCard({
  m,
  onOpen,
  showClan,
}: {
  m: CohortMentee;
  onOpen: () => void;
  showClan?: boolean;
}) {
  const relativeTime = formatRelativeTime(m.completedAt);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="group text-left bg-card rounded-2xl border border-purple-200 p-5 hover:border-purple-400 hover:shadow-sm transition-all cursor-pointer"
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <Avatar m={m} />

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate font-medium text-slate-900">
              {m.name}
            </p>

            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 text-xs font-medium shrink-0">
              <Trophy className="w-3 h-3" />
              Program Completed
            </span>
          </div>

          {/* Same responsive pattern as InProgressCard */}
      <div className="mt-1 text-xs text-slate-500">
  {/* Week */}
  <div>
    Wk {m.programDurationWeeks}/{m.programDurationWeeks}
  </div>

  {/* Mobile + Desktop = separate lines */}
  <div className="flex items-center gap-1 mt-1 md:hidden lg:flex">
    <Clock className="w-3 h-3 shrink-0" />
    <span>{relativeTime}</span>
  </div>

  <div className="flex items-center gap-1 mt-1 md:hidden lg:flex">
    <Users2 className="w-3 h-3 shrink-0" />
    <span>{m.clan?.name}</span>
  </div>

  {/* Tablet only = same line */}
  <div className="hidden md:flex lg:hidden items-center gap-4 mt-1">
    <div className="flex items-center gap-1">
      <Clock className="w-3 h-3 shrink-0" />
      <span>{relativeTime}</span>
    </div>

    <div className="flex items-center gap-1">
      <Users2 className="w-3 h-3 shrink-0" />
      <span>{m.clan?.name}</span>
    </div>
  </div>
</div>
        </div>
      </div>

      {/* Program Name */}
      {m.programName && (
        <div className="mt-4">
          <div className="flex items-start gap-2 text-sm text-purple-600">
            

            <p
              className="font-medium leading-5 break-words"
              title={m.programName}
            >
              {m.programName}
            </p>
          </div>
        </div>
      )}

      {/* Divider */}
      <div className="my-4 border-t border-slate-200" />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-slate-50 p-3 text-center min-w-0">
          <div className="text-xl font-semibold text-slate-900">
            {m.programDurationWeeks ?? 0} wks
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Duration
          </div>
        </div>

        <div className="rounded-lg bg-slate-50 p-3 text-center min-w-0">
          <div className="text-xl font-semibold text-slate-900">
            {m.onTimeRate ?? 0}%
          </div>
          <div className="text-xs text-slate-500 mt-1">
            On-time
          </div>
        </div>

        <div className="rounded-lg bg-slate-50 p-3 text-center min-w-0">
          <div className="text-xl font-semibold text-slate-900">
            {m.tasksCompleted ?? 0}/{m.tasksTotal ?? 0}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Tasks done
          </div>
        </div>
      </div>

      {/* Same hover effect as InProgressCard */}
      <div className="mt-3 flex items-center justify-end text-xs font-medium text-purple-600 opacity-0 group-hover:opacity-100 transition-opacity">
        View completion details
        <ArrowUpRight className="ml-0.5 w-3.5 h-3.5" />
      </div>
    </div>
  );
}
export function MenteeCard({ m, onOpen, showClan = false }: { m: CohortMentee; onOpen: () => void; showClan?: boolean }) {
  // Render completion card variant if mentee has completed the program
  if (m.isCompleted === true) {
    return <CompletionCard m={m} onOpen={onOpen} showClan={showClan} />;
  }

  // Render standard in-progress card
  return <InProgressCard m={m} onOpen={onOpen} showClan={showClan} />;
}