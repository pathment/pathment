'use client';

import { Loader2, TrendingUp, TrendingDown, Minus, Flag, Clock, Check, CheckCircle2, Route } from 'lucide-react';
import { useMyProgress } from '@/lib/hooks/mentee';
import { useMyRoadmaps } from '@/lib/hooks/mentee/useMyRoadmaps';
import { DualProgress } from '@/components/mentor/DualProgress';
import { AISummaryPanel } from '@/components/mentor/AISummaryPanel';
import { PersonalityBars } from '@/components/mentor/PersonalityBars';

const SEVERITY_CLASS: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-slate-100 text-slate-600',
};

function MetricChip({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-card px-4 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-900 tabular-nums">{value}</div>
    </div>
  );
}

function MyRoadmapsSection() {
  const { roadmaps, loading } = useMyRoadmaps();
  if (loading || roadmaps.length === 0) return null;
  return (
    <div className="bg-card rounded-2xl border border-slate-200">
      <div className="px-6 py-5 border-b border-slate-200 flex items-center gap-2">
        <Route className="w-4 h-4 text-brand-600" /><h2 className="text-slate-900">Your roadmaps</h2>
      </div>
      <div className="p-6 space-y-5">
        {roadmaps.map((r) => (
          <div key={r.roadmapId}>
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <div className="min-w-0">
                <div className="font-medium text-slate-900 truncate">{r.name}</div>
                {!r.completed && r.currentStepTitle && (
                  <div className="text-sm text-slate-500 truncate">Next: {r.currentStepTitle}</div>
                )}
                {r.completed && <div className="text-sm text-green-600">Completed 🎉</div>}
              </div>
              <span className="text-xs text-slate-400 tabular-nums shrink-0">
                {Math.min(r.currentStep, r.totalSteps)}/{r.totalSteps}
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div className={`h-full rounded-full ${r.completed ? 'bg-green-500' : 'bg-brand-500'}`} style={{ width: `${r.percent}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MenteeProgress() {
  const { progress, loading, error, refetch } = useMyProgress();

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-600" /></div>;
  }
  if (error || !progress) {
    return (
      <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center max-w-3xl">
        <p className="text-slate-600 mb-3">{error || 'No progress data yet - once you start tasks this fills in.'}</p>
        {error && <button onClick={refetch} className="text-brand-600 hover:text-brand-700 text-sm font-medium">Try again</button>}
      </div>
    );
  }

  const gap = Math.round(progress.relativeProgress - progress.absoluteProgress);
  const Momentum = progress.momentum === 'up' ? TrendingUp : progress.momentum === 'down' ? TrendingDown : Minus;
  const momentumLabel = progress.momentum === 'up' ? 'Building momentum' : progress.momentum === 'down' ? 'Easing off' : 'Steady';
  const momentumTone = progress.momentum === 'up' ? 'text-emerald-600' : progress.momentum === 'down' ? 'text-amber-600' : 'text-slate-500';

  const encouragement = gap >= 8
    ? "You're doing better than the raw numbers suggest - your logged constraints are counted, and it shows."
    : progress.momentum === 'up'
    ? "Nice rhythm. Keep the steady cadence going."
    : "Every step counts. Log anything getting in your way - it helps, it doesn't hurt.";

  const openBlockers = progress.blockers.filter((b) => b.status === 'open');

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-slate-900 mb-2">My progress</h1>
        <p className="text-slate-600">Where you are, measured fairly with your real constraints counted.</p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricChip label="On-time" value={`${progress.onTimeRate}%`} />
        <MetricChip label="Awaiting review" value={progress.pendingApprovals} />
        <MetricChip label="Open roadblocks" value={openBlockers.length} />
        <MetricChip label="Week" value={`${progress.week}/${progress.totalWeeks || '-'}`} />
      </div>

      {/* Summary + dual progress */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <AISummaryPanel summary={progress.aiSummary} signals={progress.aiSignals} />
        </div>
        <div className="bg-card rounded-2xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900">Measured fairly</h3>
            <span className={`inline-flex items-center gap-1 text-xs font-medium ${momentumTone}`}>
              <Momentum className="w-3.5 h-3.5" />{momentumLabel}
            </span>
          </div>
          <DualProgress absolute={progress.absoluteProgress} relative={progress.relativeProgress} />
          <p className="mt-4 text-xs leading-relaxed text-slate-500 border-t border-slate-100 pt-3">{encouragement}</p>
        </div>
      </div>

      {/* Roadmaps (step X of N) */}
      <MyRoadmapsSection />

      {/* Working style (read-only self-view) */}
      {progress.personality && <PersonalityBars personality={progress.personality} />}

      {/* What's slowing you down */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-card rounded-2xl border border-slate-200">
          <div className="px-6 py-5 border-b border-slate-200 flex items-center gap-2">
            <Flag className="w-4 h-4 text-red-500" /><h2 className="text-slate-900">Your roadblocks</h2>
          </div>
          <div className="p-6">
            {openBlockers.length === 0 ? (
              <p className="text-sm text-slate-500 flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" />Nothing blocking you right now.</p>
            ) : (
              <div className="space-y-2">
                {openBlockers.map((b) => (
                  <div key={b.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <p className="text-sm font-medium text-slate-900">{b.title}</p>
                    <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                      <span className={`px-1.5 py-0.5 rounded ${SEVERITY_CLASS[b.severity] || SEVERITY_CLASS.low}`}>{b.severity}</span>
                      <span className="capitalize">{b.category}</span><span>·</span><span>{b.daysOpen}d open</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="bg-card rounded-2xl border border-slate-200">
          <div className="px-6 py-5 border-b border-slate-200 flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-500" /><h2 className="text-slate-900">Logged delays</h2>
          </div>
          <div className="p-6">
            {progress.delays.length === 0 ? (
              <p className="text-sm text-slate-500">No delays logged.</p>
            ) : (
              <div className="space-y-2">
                {progress.delays.map((d) => {
                  const status = d.reviewStatus || (d.accepted ? 'accepted' : 'pending');
                  return (
                  <div key={d.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm text-slate-900">{d.reason}</p>
                      {status === 'accepted' && (
                        <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs">
                          <Check className="w-3 h-3" />Counted
                        </span>
                      )}
                      {status === 'rejected' && (
                        <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 text-red-700 text-xs">
                          Rejected
                        </span>
                      )}
                      {status === 'pending' && (
                        <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-xs">
                          Pending review
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                      <span className="capitalize">{d.kind}</span><span>·</span><span>{d.days}d</span>
                    </div>
                    {status === 'rejected' && d.rejectionReason && (
                      <p className="text-xs text-red-600 mt-1">{d.rejectionReason}</p>
                    )}
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
