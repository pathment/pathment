'use client';

import { useState } from 'react';
import { CheckCircle2, ChevronRight, ChevronDown, ChevronUp, Clock, Award, ArrowUpRight } from 'lucide-react';
import type { MenteeRoadmapStep } from '@/lib/services/roadmap-api';
import { useRouter } from 'next/navigation';

interface RoadmapLinearStepCardProps {
  step: MenteeRoadmapStep;
  index: number;
  isLast?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  onSelectStep: (step: MenteeRoadmapStep) => void;
}

export function RoadmapLinearStepCard({
  step,
  index,
  isLast = false,
  isExpanded: controlledExpanded,
  onToggleExpand,
  onSelectStep,
}: RoadmapLinearStepCardProps) {
  const router = useRouter();
  const [internalExpanded, setInternalExpanded] = useState(false);

  const isExpanded = controlledExpanded !== undefined ? controlledExpanded : internalExpanded;
  const toggleExpand = () => {
    if (onToggleExpand) {
      onToggleExpand();
    } else {
      setInternalExpanded((prev) => !prev);
    }
  };

  const isDone = step.done || step.status === 'completed';
  const isCurrent = step.current || step.status === 'current';

  const getDifficultyColor = (difficulty?: string) => {
    switch (difficulty) {
      case 'easy':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'medium':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'hard':
        return 'bg-orange-50 text-orange-700 border-orange-200';
      case 'expert':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  const handleAction = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (step.assignedTask?.id) {
      router.push(`/mentee/tasks/${step.assignedTask.id}`);
    } else {
      onSelectStep(step);
    }
  };

  const taskStatus = step.assignedTask?.status;
  const isSubmitted = taskStatus === 'submitted';
  const isRevisionNeeded = taskStatus === 'revision_needed';
  const isOverdue =
    step.assignedTask?.dueDate &&
    !isDone &&
    !isSubmitted &&
    new Date(step.assignedTask.dueDate).getTime() < Date.now();

  const getStatusBadge = () => {
    if (isDone) {
      return { text: 'Completed', style: 'bg-emerald-100 text-emerald-800' };
    }
    if (isRevisionNeeded) {
      return { text: 'Revision Needed', style: 'bg-rose-100 text-rose-800' };
    }
    if (isSubmitted) {
      return { text: 'Under Review', style: 'bg-amber-100 text-amber-800' };
    }
    if (isOverdue) {
      return { text: 'Overdue', style: 'bg-rose-100 text-rose-800 font-bold' };
    }
    if (isCurrent) {
      return { text: 'Current Stage', style: 'bg-brand-100 text-brand-700 font-bold' };
    }
    return { text: `Step ${index + 1}`, style: 'bg-slate-200/70 text-slate-600' };
  };

  const statusBadge = getStatusBadge();

  const getActionButtonText = () => {
    if (isDone || isSubmitted) return 'View Submission';
    if (isRevisionNeeded) return 'Submit Revision';
    return 'Go to Task';
  };

  return (
    <div className="relative flex items-start gap-3 sm:gap-5 group">
      {/* Left Timeline Node & Connecting Line */}
      <div className="flex flex-col items-center self-stretch shrink-0 pt-2.5">
        <button
          type="button"
          onClick={toggleExpand}
          className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center border-2 z-10 transition-all focus:outline-hidden ${isDone
            ? 'bg-emerald-600 border-emerald-600 text-white shadow-2xs hover:bg-emerald-700'
            : isCurrent
              ? 'bg-brand-600 border-brand-600 text-white shadow-md shadow-brand-500/25 ring-4 ring-brand-100 animate-pulse'
              : 'bg-card border-slate-300 text-slate-500 hover:border-slate-400'
            }`}
        >
          {isDone ? (
            <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" />
          ) : (
            <span className="text-xs font-bold">{index + 1}</span>
          )}
        </button>
        {!isLast && (
          <div
            className={`w-0.5 flex-1 my-1.5 transition-colors ${isDone ? 'bg-emerald-400' : 'bg-slate-200'
              }`}
          />
        )}
      </div>

      {/* Main Step Content Card */}
      <div
        className={`flex-1 min-w-0 rounded-2xl border transition-all duration-200 mb-3.5 ${isCurrent
          ? 'bg-card border-brand-300 shadow-md ring-1 ring-brand-200'
          : isDone
            ? 'bg-card border-slate-200'
            : 'bg-slate-50/50 border-slate-200/80'
          }`}
      >
        {/* Card Header (Always Clickable Bar) */}
        <div
          onClick={toggleExpand}
          className={`p-3.5 sm:p-4 flex items-center justify-between gap-3 cursor-pointer select-none ${isExpanded ? 'border-b border-slate-100' : ''
            }`}
        >
          <div className="min-w-0 flex-1 flex flex-col sm:flex-row items-start sm:items-center gap-1.5 sm:gap-2.5">
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-semibold tracking-wide shrink-0 ${statusBadge.style}`}
            >
              {statusBadge.text}
            </span>

            <h3 className="text-xs sm:text-sm  font-bold text-slate-900 truncate w-full sm:w-auto text-left hover:text-brand-700 transition-colors">
              {step.title}
            </h3>

            {!isExpanded && (
              <div className="hidden md:flex items-center gap-3 text-xs text-slate-400 ml-auto shrink-0 pr-2">
                {isDone && step.assignedTask?.pointsAwarded != null ? (
                  <span className="font-bold text-emerald-600 text-[11px]">
                    +{step.assignedTask.pointsAwarded} pts
                  </span>
                ) : step.pointsBase != null ? (
                  <span className="text-amber-600 font-medium text-[11px]">
                    {step.pointsBase} pts
                  </span>
                ) : null}
              </div>
            )}
          </div>

          {/* Action Button & Toggle Chevron */}
          <div className="flex items-center gap-2 shrink-0">
            {step.assignedTask?.id ? (
              <button
                type="button"
                onClick={handleAction}
                className={`px-2 py-1 sm:px-3 sm:py-1.5 rounded-xl text-[11px] sm:text-xs font-semibold flex items-center gap-1 transition-all shadow-2xs ${isDone
                  ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  : isRevisionNeeded
                    ? 'bg-rose-600 text-white hover:bg-rose-700'
                    : 'bg-brand-600 text-white hover:bg-brand-700'
                  }`}
              >
                {getActionButtonText()}
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectStep(step);
                }}
                className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors flex items-center gap-1"
              >
                Details
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand();
              }}
              aria-label={isExpanded ? 'Collapse step' : 'Expand step'}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Collapsible Expanded Body */}
        {isExpanded && (
          <div className="p-4 sm:p-5 pt-3 space-y-3.5 bg-card rounded-b-2xl">
            {/* Badges strip */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700 capitalize">
                {step.type || 'Assignment'}
              </span>

              {step.difficulty && (
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium border uppercase tracking-wider ${getDifficultyColor(
                    step.difficulty
                  )}`}
                >
                  {step.difficulty}
                </span>
              )}

              {step.effort && (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 uppercase">
                  Effort: {step.effort}
                </span>
              )}
            </div>

            {/* Description */}
            {step.description && (
              <p className="text-xs text-slate-600 leading-relaxed">
                {step.description}
              </p>
            )}

            {/* Task due date & Points footer */}
            <div className="flex items-center gap-4 pt-1 text-xs text-slate-500 flex-wrap">
              {isDone && step.assignedTask?.pointsAwarded != null ? (
                <span className="inline-flex items-center gap-1 font-bold text-emerald-600">
                  <Award className="w-3.5 h-3.5 text-emerald-500" />
                  +{step.assignedTask.pointsAwarded} pts earned
                </span>
              ) : step.pointsBase != null ? (
                <span className="inline-flex items-center gap-1 font-medium text-amber-600">
                  <Award className="w-3.5 h-3.5" />
                  {step.pointsBase} pts
                </span>
              ) : null}
              {step.estimatedHours != null && (
                <span className="inline-flex items-center gap-1 font-medium">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  ~{step.estimatedHours} hrs
                </span>
              )}
              {step.assignedTask?.dueDate && (
                <span className={`inline-flex items-center gap-1 font-medium ${isOverdue ? 'text-rose-600 font-bold' : 'text-brand-600'}`}>
                  Due {new Date(step.assignedTask.dueDate).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
