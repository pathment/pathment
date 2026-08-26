'use client';

import { useState, useEffect } from 'react';
import { Loader2, Route, BookOpen, CheckCircle2, Trophy, Clock, Flag, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { useMyRoadmaps } from '@/lib/hooks/mentee/useMyRoadmaps';
import { useMyProgress } from '@/lib/hooks/mentee/useMyProgress';
import { useDailyLog } from '@/lib/hooks/mentee/useDailyLog';
import { RoadmapHeaderStats } from '@/components/mentee/roadmap/RoadmapHeaderStats';
import { RoadmapLinearStepCard } from '@/components/mentee/roadmap/RoadmapLinearStepCard';
import { WeeklyCommitmentChart } from '@/components/mentee/roadmap/WeeklyCommitmentChart';
import { RoadmapGamificationCard } from '@/components/mentee/roadmap/RoadmapGamificationCard';
import { RoadmapMilestoneDetailModal } from '@/components/mentee/roadmap/RoadmapMilestoneDetailModal';
import type { MenteeRoadmapStep } from '@/lib/services/roadmap-api';

const STEP_PAGE_SIZE = 10;

export default function MenteeRoadmapPage() {
  const { roadmaps, loading: roadmapsLoading, refetch: refetchRoadmaps } = useMyRoadmaps();
  const { progress, loading: progressLoading } = useMyProgress();
  const { entries: dailyLogEntries } = useDailyLog();

  const [selectedRoadmapId, setSelectedRoadmapId] = useState<string | null>(null);
  const [selectedStep, setSelectedStep] = useState<MenteeRoadmapStep | null>(null);
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState<number>(STEP_PAGE_SIZE);

  const loading = roadmapsLoading || progressLoading;

  // Active selected roadmap (or first available roadmap)
  const activeRoadmap =
    (selectedRoadmapId ? roadmaps.find((r) => r.roadmapId === selectedRoadmapId) : null) ||
    roadmaps[0] ||
    null;

  const steps = activeRoadmap?.steps || [];
  const completedStepsCount = steps.filter((s) => s.done).length;
  const isAllCompleted = activeRoadmap?.completed || (completedStepsCount === steps.length && steps.length > 0);

  // Active step is current step or first incomplete step
  const activeStepIdx = steps.findIndex((s) => s.current) !== -1
    ? steps.findIndex((s) => s.current)
    : steps.findIndex((s) => !s.done);

  const activeStep = activeStepIdx !== -1 ? steps[activeStepIdx] : (isAllCompleted ? steps[steps.length - 1] : steps[0]);

  const initialVisibleCount = Math.max(STEP_PAGE_SIZE, activeStepIdx !== -1 ? activeStepIdx + 6 : STEP_PAGE_SIZE);

  // Set initial expanded step & visible count when roadmap loads
  useEffect(() => {
    if (steps.length > 0) {
      const idx = activeStepIdx !== -1 ? activeStepIdx : 0;
      if (steps[idx]?.id) {
        setExpandedStepId(steps[idx].id);
      }
      // Ensure initial visible count covers up to active step + next 5 upcoming tasks
      setVisibleCount(initialVisibleCount);
    }
  }, [activeRoadmap?.roadmapId, steps.length, activeStepIdx, initialVisibleCount]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[65vh]">
        <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
      </div>
    );
  }

  if (!activeRoadmap) {
    return (
      <div className="max-w-4xl mx-auto py-16 text-center">
        <div className="w-16 h-16 rounded-full bg-brand-50 border border-brand-100 flex items-center justify-center mx-auto mb-4">
          <Route className="w-8 h-8 text-brand-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">No Active Roadmap Assigned Yet</h2>
        <p className="text-sm text-slate-500 max-w-md mx-auto mb-6 leading-relaxed">
          Your mentor will assign your fellowship roadmap soon. Once assigned, your complete step-by-step learning path will appear here.
        </p>
        <button
          onClick={refetchRoadmaps}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-brand-600 bg-brand-50 border border-brand-200 rounded-xl hover:bg-brand-100 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh Status
        </button>
      </div>
    );
  }

  // Next step is the step immediately following the active step
  const nextStepIdx = activeStepIdx !== -1 ? activeStepIdx + 1 : -1;
  const nextStep = nextStepIdx !== -1 && nextStepIdx < steps.length ? steps[nextStepIdx] : null;

  const currentPhaseName = isAllCompleted
    ? 'Roadmap Completed 🎉'
    : activeStep?.title || activeRoadmap.currentStepTitle || 'In Progress';

  const nextMilestoneTitle = isAllCompleted
    ? 'All Completed! 🎉'
    : nextStep?.title || 'Roadmap Completion';

  const formatShortDate = (isoStr?: string | null, fallback = 'Pending') => {
    if (!isoStr) return fallback;
    try {
      return new Date(isoStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return fallback;
    }
  };

  const nextMilestoneDueIso = isAllCompleted
    ? null
    : nextStep?.assignedTask?.dueDate || activeStep?.assignedTask?.dueDate || activeRoadmap.nextMilestoneDueDate;

  const nextMilestoneDue = isAllCompleted
    ? 'Completed'
    : formatShortDate(nextMilestoneDueIso, 'Upcoming');

  const visibleSteps = steps.slice(0, visibleCount);
  const remainingStepsCount = steps.length - visibleCount;
  const canShowLess = visibleCount > initialVisibleCount;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Title & Multi-roadmap Switcher Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            My Fellowship Roadmap
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Track your complete learning path, milestone progress, and upcoming topics.
          </p>
        </div>

        {/* Multi-roadmap tabs if fellow has more than 1 roadmap */}
        {roadmaps.length > 1 && (
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200/80 self-start sm:self-auto">
            {roadmaps.map((r) => (
              <button
                key={r.roadmapId}
                onClick={() => setSelectedRoadmapId(r.roadmapId)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${activeRoadmap.roadmapId === r.roadmapId
                  ? 'bg-card text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
                  }`}
              >
                {r.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Real Data Metric Cards */}
      <RoadmapHeaderStats
        percent={activeRoadmap.percent}
        currentPhaseName={currentPhaseName}
        nextMilestoneTitle={nextMilestoneTitle}
        nextMilestoneDue={nextMilestoneDue}
        totalSteps={steps.length}
        completedStepsCount={completedStepsCount}
      />

      {/* 2-Column Main Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start pt-2">
        {/* Left Column: Linear Steps Timeline (2/3 width) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-base font-bold text-slate-900">{activeRoadmap.name}</h2>
              {activeRoadmap.description && (
                <p className="text-xs text-slate-500 mt-0.5">{activeRoadmap.description}</p>
              )}
            </div>
            <span className="text-xs font-bold text-slate-600 tabular-nums bg-slate-100 px-3 py-1 rounded-full border border-slate-200 text-center">
              {completedStepsCount} / {activeRoadmap.totalSteps} Completed
            </span>
          </div>

          {/* Skill tags if present */}
          {activeRoadmap.skillTags && activeRoadmap.skillTags.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap pb-2">
              {activeRoadmap.skillTags.map((tag) => (
                <span
                  key={tag}
                  className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-brand-50 text-brand-700 border border-brand-200"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Linear Sequential Steps with Accordion Collapsible Cards & Pagination */}
          <div className="pl-1 pt-2 space-y-1">
            {steps.length === 0 ? (
              <div className="bg-card rounded-2xl border border-slate-200 p-8 text-center text-slate-500 text-sm">
                No roadmap steps configured for this roadmap.
              </div>
            ) : (
              visibleSteps.map((step, idx) => (
                <RoadmapLinearStepCard
                  key={step.id || idx}
                  step={step}
                  index={idx}
                  isLast={idx === visibleSteps.length - 1 && remainingStepsCount === 0}
                  isExpanded={expandedStepId === (step.id || String(idx))}
                  onToggleExpand={() => {
                    const stepKey = step.id || String(idx);
                    setExpandedStepId(expandedStepId === stepKey ? null : stepKey);
                  }}
                  onSelectStep={(s) => setSelectedStep(s)}
                />
              ))
            )}

            {/* "Show More / Show Less Steps" Pagination Buttons */}
            {(remainingStepsCount > 0 || canShowLess) && (
              <div className="pt-4 flex items-center justify-center gap-3">
                {remainingStepsCount > 0 && (
                  <button
                    onClick={() => setVisibleCount((prev) => Math.min(steps.length, prev + STEP_PAGE_SIZE))}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-brand-700 bg-brand-50 border border-brand-200 hover:bg-brand-100 hover:border-brand-300 transition-all shadow-2xs cursor-pointer"
                  >
                    <ChevronDown className="w-4 h-4" />
                    Show More Steps ({remainingStepsCount} remaining)
                  </button>
                )}

                {canShowLess && (
                  <button
                    onClick={() => setVisibleCount(initialVisibleCount)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 border border-slate-200 hover:bg-slate-200 transition-all shadow-2xs cursor-pointer"
                  >
                    <ChevronUp className="w-4 h-4" />
                    Show Less
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Real Progress Stats & Recommendations (1/3 width) */}
        <div className="space-y-6">
          {/* Real Fellowship Progress Summary Card */}
          <div className="bg-card rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-semibold text-slate-900 border-b border-slate-100 pb-3">
              Fellowship Snapshot
            </h3>

            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                <div className="text-xs text-slate-500 font-medium">On-Time Rate</div>
                <div className="text-lg font-bold text-slate-900 mt-0.5 tabular-nums">
                  {progress?.onTimeRate != null ? `${progress.onTimeRate}%` : 'N/A'}
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                <div className="text-xs text-slate-500 font-medium">Pending Review</div>
                <div className="text-lg font-bold text-amber-600 mt-0.5 tabular-nums">
                  {progress?.pendingApprovals ?? 0}
                </div>
              </div>
            </div>

            {progress?.week && (
              <div className="flex items-center justify-between text-xs text-slate-600 pt-1">
                <span>Fellowship Cadence</span>
                <span className="font-bold text-slate-900">
                  Week {progress.week} of {progress.totalWeeks || '-'}
                </span>
              </div>
            )}
          </div>

          <WeeklyCommitmentChart entries={dailyLogEntries} />

          <RoadmapGamificationCard
            steps={steps}
            earnedRoadmapPoints={activeRoadmap.earnedRoadmapPoints}
            totalRoadmapPoints={activeRoadmap.totalRoadmapPoints}
          />
        </div>
      </div>

      {/* Milestone Detail Slide-over / Modal */}
      <RoadmapMilestoneDetailModal step={selectedStep} onClose={() => setSelectedStep(null)} />
    </div>
  );
}
