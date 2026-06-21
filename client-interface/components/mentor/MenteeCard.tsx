'use client';

import {
  ClipboardCheck, Flag, Clock, TrendingUp, TrendingDown, Minus, ArrowUpRight, Users2,
} from 'lucide-react';
import { DualProgress } from '@/components/mentor/DualProgress';
import { NudgeButton } from '@/components/mentor/NudgeButton';
import type { CohortMentee, CohortRisk, CohortMomentum } from '@/lib/types/cohort';

/**
 * The single, consistent mentee summary card. Used by the Cockpit, My Mentees
 * and At-risk screens so a mentor reads the SAME signals everywhere and never
 * has to relearn a different layout per screen:
 *   • risk badge + momentum + last-active
 *   • dual progress (absolute vs fair/relative)
 *   • work chips (to-review / blockers / on-time)
 *   • the plain-English risk reason
 *   • concrete rule-based "why" signal chips
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

export function MenteeCard({ m, onOpen, showClan = false }: { m: CohortMentee; onOpen: () => void; showClan?: boolean }) {
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
