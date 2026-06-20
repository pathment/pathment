'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  BookOpen, Calendar, CheckCircle2, Clock, Mail, MessageSquare, Plus,
  Target, TrendingUp, TrendingDown, Minus, Flag, Check, User, Loader2,
  Star, ThumbsUp, ThumbsDown, AlertCircle, ChevronLeft, Trophy, Users2,
} from 'lucide-react';
import { useMenteeDetailPage, useMenteeProfile, type CohortRisk, type CohortMomentum } from '@/lib/hooks/mentor';
import { useAuth } from '@/lib/context/AuthContext';
import { useMenteeActivity } from '@/lib/hooks/mentor/useMenteeActivity';
import { frictionApi } from '@/lib/services/friction-api';
import { mentorApi } from '@/lib/services/mentor-api';
import { ActivityCard } from '@/components/shared/ActivityCard';
import { DualProgress } from '@/components/mentor/DualProgress';
import { AISummaryPanel } from '@/components/mentor/AISummaryPanel';
import { PersonalityBars } from '@/components/mentor/PersonalityBars';
import { InsightsPanel } from '@/components/mentor/InsightsPanel';
import { OneOnOneDrawer, type OneOnOneData } from '@/components/mentor/OneOnOneDrawer';
import { AssignTaskDrawer } from '@/components/mentor/AssignTaskDrawer';
import { NudgeButton } from '@/components/mentor/NudgeButton';
import { CollaboratorsCard } from '@/components/mentor/CollaboratorsCard';
import { TracksPanel } from '@/components/mentor/TracksPanel';

// ── Small presentational helpers (current indigo/slate design system) ────────
const RISK_PILL: Record<CohortRisk, { label: string; className: string; dot: string }> = {
  high:  { label: 'At risk',  className: 'bg-red-50 text-red-700 border-red-200',             dot: 'bg-red-500' },
  watch: { label: 'Watch',    className: 'bg-amber-50 text-amber-700 border-amber-200',       dot: 'bg-amber-500' },
  low:   { label: 'On track', className: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
};

function RiskPill({ risk }: { risk: CohortRisk }) {
  const r = RISK_PILL[risk];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${r.className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${r.dot}`} />{r.label}
    </span>
  );
}

function MomentumPill({ momentum }: { momentum: CohortMomentum }) {
  if (momentum === 'up') return <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600"><TrendingUp className="w-3.5 h-3.5" />Building</span>;
  if (momentum === 'down') return <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600"><TrendingDown className="w-3.5 h-3.5" />Slipping</span>;
  return <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500"><Minus className="w-3.5 h-3.5" />Steady</span>;
}

function MetricChip({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-card px-4 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-900 tabular-nums">{value}</div>
    </div>
  );
}

const SEVERITY_CLASS: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-slate-100 text-slate-600',
};

const STATUS_META: Record<string, { label: string; className: string }> = {
  submitted:        { label: 'Submitted',       className: 'bg-blue-100 text-blue-700' },
  under_review:     { label: 'Under review',    className: 'bg-blue-100 text-blue-700' },
  revision_needed:  { label: 'Changes needed',  className: 'bg-orange-100 text-orange-700' },
  changes_requested:{ label: 'Changes needed',  className: 'bg-orange-100 text-orange-700' },
  in_progress:      { label: 'In progress',     className: 'bg-brand-100 text-brand-700' },
  assigned:         { label: 'Assigned',        className: 'bg-slate-100 text-slate-600' },
  not_started:      { label: 'Not started',     className: 'bg-slate-100 text-slate-600' },
  completed:        { label: 'Completed',       className: 'bg-green-100 text-green-700' },
  cancelled:        { label: 'Cancelled',       className: 'bg-red-100 text-red-700' },
  rejected:         { label: 'Rejected',        className: 'bg-red-100 text-red-700' },
};

// Order statuses so the work most needing attention surfaces first.
const STATUS_ORDER = [
  'submitted', 'under_review', 'revision_needed', 'changes_requested',
  'in_progress', 'assigned', 'not_started', 'completed', 'cancelled', 'rejected',
];

// Generate completion-focused summary for completed mentees
function generateCompletionSummary(insights: any, mentee: any): string {
  const taskCount = insights.tasksCompleted && insights.tasksTotal ? `${insights.tasksCompleted}/${insights.tasksTotal}` : '';
  const programName = insights.programName || 'the program';
  const clanName = insights.clan?.name;
  const onTime = insights.onTimeRate ?? 0;
  
  let summary = `${mentee?.firstName} has successfully completed ${programName}`;
  if (clanName) summary += ` in the ${clanName}`;
  summary += '.';
  
  if (taskCount) summary += ` They completed ${taskCount} tasks`;
  if (onTime > 0) summary += ` with ${onTime}% on-time delivery`;
  summary += '.';
  
  if (insights.openBlockersCount === 0) summary += ' They completed the program with no open blockers.';
  
  summary += ' Throughout the program they consistently progressed through milestones and successfully met graduation requirements.';
  
  return summary;
}

// Generate completion signals
function generateCompletionSignals(insights: any): string[] {
  const signals: string[] = [];
  
  if (insights.tasksCompleted && insights.tasksTotal) {
    signals.push(`All tasks completed (${insights.tasksCompleted}/${insights.tasksTotal})`);
  }
  
  signals.push(`${insights.onTimeRate ?? 0}% on-time delivery`);
  
  if (insights.openBlockersCount === 0) {
    signals.push('No open blockers');
  }
  
  if (insights.completedAt) {
    const date = new Date(insights.completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    signals.push(`Completed on ${date}`);
  }
  
  if (insights.lastActive) {
    signals.push(`Last active: ${insights.lastActive}`);
  }
  
  return signals;
}

export default function MenteeDetail() {
  const params = useParams();
  const router = useRouter();
  const menteeId = params.id as string;

  const {
    match, tasks, loading, completionLoading, rejectReason,
    showRejectModal, showCompleteConfirm, setRejectReason,
    setShowRejectModal, setShowCompleteConfirm,
    handleApproveCompletion, handleRejectCompletion, fetchMenteeDetails,
  } = useMenteeDetailPage(menteeId);

  const {
    summary: actSummary, dailySessions: actSessions, recentEvents: actEvents,
    loading: actLoading, days: actDays, setDays: setActDays, refetch: refetchActivity,
  } = useMenteeActivity(menteeId);

  const { profile: insights, refetch: refetchProfile } = useMenteeProfile(menteeId);
  const { user } = useAuth();
  const selfName = `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 'You';
  const [frictionBusy, setFrictionBusy] = useState<string | null>(null);

  const onAcceptDelay = async (id: string) => {
    try {
      setFrictionBusy(id);
      await frictionApi.acceptDelay(id);
      await refetchProfile();
      toast.success('Delay accepted - counted in their favour');
    } catch { toast.error('Could not update the delay'); }
    finally { setFrictionBusy(null); }
  };

  const onResolveBlocker = async (id: string) => {
    try {
      setFrictionBusy(id);
      await frictionApi.resolveBlocker(id);
      await refetchProfile();
      toast.success('Blocker resolved');
    } catch { toast.error('Could not resolve the blocker'); }
    finally { setFrictionBusy(null); }
  };

  const [loggingOneOnOne, setLoggingOneOnOne] = useState(false);
  const [assigningTask, setAssigningTask] = useState(false);

  const onSavePersonality = async (dims: Record<string, number>) => {
    await mentorApi.updatePersonality(menteeId, dims);
    await refetchProfile();
  };
  const onAddInsight = async (data: { kind: string; note: string; source: string }) => {
    await mentorApi.addInsight(menteeId, data);
    await refetchProfile();
  };
  const onSaveNote = async (data: OneOnOneData) => {
    await mentorApi.addMeetingNote(menteeId, data);
    await refetchProfile();
  };
  const onAddCollaborator = async (data: { name: string; role: string }) => {
    await mentorApi.addCollaborator(menteeId, data);
    await refetchProfile();
  };
  const onRemoveCollaborator = async (id: string) => {
    await mentorApi.removeCollaborator(menteeId, id);
    await refetchProfile();
  };

  const SENTIMENT_CLASS: Record<string, string> = {
    positive: 'bg-emerald-100 text-emerald-700',
    neutral: 'bg-slate-100 text-slate-600',
    low: 'bg-amber-100 text-amber-700',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
      </div>
    );
  }

  if (!match) {
    return (
      <div className="text-center py-12">
        <User className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-600">Mentee not found</p>
        <Link href="/mentor/mentees" className="text-brand-600 hover:text-brand-700 text-sm mt-2 inline-block">
          Back to Mentees
        </Link>
      </div>
    );
  }

  const mentee = match.mentee;
  const enrollment = match.enrollment;
  const profile = mentee?.menteeProfile;
  const progress = insights?.absoluteProgress ?? (parseFloat(enrollment?.overallProgressPercentage) || 0);

  const levelName = insights?.level || 'Level 1';
  const week = insights?.week ?? enrollment?.currentWeek ?? 1;
  const totalWeeks = insights?.totalWeeks || 0;

  // Work history groups (prefer computed grouping; fall back to raw task list).
  const grouped: Record<string, any[]> =
    insights?.tasksByStatus ??
    (tasks || []).reduce((acc: Record<string, any[]>, t: any) => {
      const k = t.status || 'assigned';
      (acc[k] = acc[k] || []).push({
        id: t.id, title: t.roadmapTask?.title || t.title, status: t.status,
        source: t.isCustomTask ? 'Custom' : (t.roadmapName || t.roadmapTask?.roadmap?.name ? `Roadmap · ${t.roadmapName || t.roadmapTask?.roadmap?.name}` : 'Roadmap'),
        points: t.points ?? t.pointsBase ?? t.roadmapTask?.pointsBase ?? null,
      });
      return acc;
    }, {});
  const orderedStatuses = STATUS_ORDER.filter((s) => grouped[s]?.length);
  const totalTasks = Object.values(grouped).reduce((n, arr) => n + arr.length, 0);

  return (
    <div className="space-y-6">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div>
        <Link href="/mentor/mentees" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4">
          <ChevronLeft className="w-4 h-4" />Back to mentees
        </Link>
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 bg-brand-100 rounded-full flex items-center justify-center shrink-0">
              <span className="text-brand-700 text-xl font-semibold">
                {mentee?.firstName?.[0]}{mentee?.lastName?.[0]}
              </span>
            </div>
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                               <h1 className="text-slate-900">{mentee?.firstName} {mentee?.lastName}</h1>
                {insights?.isCompleted === true ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-100 text-purple-700 text-xs font-medium">
                    <Trophy className="w-4 h-4" />Program Completed
                  </span>
                ) : (
                  <>
                    {insights && <MomentumPill momentum={insights.momentum} />}
                    {insights && <RiskPill risk={insights.risk} />}
                  </>
                )}
              </div>
                            <div className="mt-1 flex items-center gap-2 text-sm text-slate-500 flex-wrap">
                <span>{insights?.program || enrollment?.program?.name || 'Program'}</span>
                <span className="text-slate-300">·</span>
                {insights?.isCompleted === true ? (
                  <>
                    <span className="text-slate-400 italic">Completed {insights.completedAt ? new Date(insights.completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}</span>
                  </>
                ) : (
                  <>
                    <span>{levelName}</span>
                    <span className="text-slate-300">·</span>
                    <span>Wk {week}/{totalWeeks || '-'}</span>
                  </>
                )}
                <span className="text-slate-300">·</span>
                <span className="inline-flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{mentee?.email}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => router.push(`/mentor/messages?participantId=${menteeId}`)}
              className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl transition-colors flex items-center gap-2"
            >
              <MessageSquare className="w-4 h-4" />Message
            </button>
            <button
              onClick={() => setAssigningTask(true)}
              className="px-4 py-2 bg-card hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />Assign task
            </button>
            <NudgeButton menteeId={menteeId} menteeName={insights?.name} className="!rounded-xl !px-4" />
            {(enrollment?.status === 'active' || enrollment?.status === 'matched') && (
              <button
                onClick={() => setShowCompleteConfirm(true)}
                disabled={completionLoading}
                className="px-4 py-2 bg-green-50 hover:bg-green-100 border border-green-300 text-green-700 rounded-xl transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />Complete level
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Ready-for-sign-off banner ────────────────────────────────── */}
      {enrollment?.status === 'pending_completion' && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-start gap-3 flex-1">
            <AlertCircle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-amber-900 font-medium text-sm">
                {enrollment.completionRequestedByRole === 'system'
                  ? `${mentee?.firstName} ${mentee?.lastName} has finished every task - ready for your sign-off`
                  : `${mentee?.firstName} ${mentee?.lastName} has requested completion`}
              </p>
              <p className="text-amber-700 text-xs mt-1">
                Review their work, then confirm completion or send it back with a note.
              </p>
            </div>
          </div>
          <div className="flex gap-3 shrink-0">
            <button onClick={() => setShowRejectModal(true)} disabled={completionLoading}
              className="px-4 py-2 bg-card border border-red-300 text-red-700 hover:bg-red-50 rounded-xl text-sm flex items-center gap-2 transition-colors disabled:opacity-50">
              <ThumbsDown className="w-4 h-4" />Send back
            </button>
            <button onClick={handleApproveCompletion} disabled={completionLoading}
              className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm flex items-center gap-2 transition-colors disabled:opacity-50">
              {completionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ThumbsUp className="w-4 h-4" />}Confirm completion
            </button>
          </div>
        </div>
      )}

          {/* ── Metric chips ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricChip label="On-time" value={insights ? `${insights.onTimeRate}%` : '-'} />
        {insights?.isCompleted === true ? (
          <MetricChip label="Completed tasks" value={insights?.tasksCompleted && insights?.tasksTotal ? `${insights.tasksCompleted}/${insights.tasksTotal}` : '-'} />
        ) : (
          <MetricChip label="Awaiting review" value={insights?.pendingApprovals ?? 0} />
        )}
        <MetricChip label="Open blockers" value={insights?.openBlockers ?? 0} />
        <MetricChip label="Avg rating" value={insights && insights.avgRating > 0 ? insights.avgRating.toFixed(1) : '-'} />
      </div>

      
{/* ── Completion summary (if program completed - Issue #340) ────────── */}
{/* ── AI summary + measured fairly ─────────────────────────────── */}
{insights && (
  
  <div className="grid lg:grid-cols-3 gap-6">
    
    <div className={insights.isCompleted ? "lg:col-span-3" : "lg:col-span-2"}>
      {insights.isCompleted ? (
       <div className="bg-card rounded-2xl border border-purple-200/60 p-6 relative overflow-hidden">
  <div className="absolute inset-0 bg-gradient-to-r from-purple-500/5 via-transparent to-transparent pointer-events-none" />

  <div className="relative grid grid-cols-[120px_1fr] gap-8 items-center">
    
    {/* Achievement Icon */}
    <div className="flex items-center justify-center">
      <div className="relative">
        <div className="absolute inset-0 bg-purple-500/20 blur-2xl rounded-full" />

        <div className="relative h-24 w-24 rounded-2xl bg-gradient-to-br from-purple-500 via-violet-600 to-purple-700 flex items-center justify-center shadow-xl">
          <Trophy className="h-12 w-12 text-white" />
        </div>
      </div>
    </div>

    {/* Content */}
    <div className="min-w-0 pl-2">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-xl font-semibold text-slate-900">
            Program Completed! 🎉
          </h3>

          <p className="text-sm text-slate-500 mt-1">
            Completed on{" "}
            {insights.completedAt
              ? new Date(insights.completedAt).toLocaleDateString()
              : "recently"}
            {insights.lastActive ? ` • ${insights.lastActive}` : ""}
          </p>
        </div>

        <span className="text-xs text-purple-500 whitespace-nowrap">
          based on the signals below
        </span>
      </div>

      <p className="mt-4 text-sm leading-relaxed text-slate-700">
        {mentee?.firstName} has successfully completed
        {insights.programName
          ? ` the ${insights.programName}`
          : " their program"}
        {insights.clan
          ? ` in the ${insights.clan.name}`
          : ""}.
        {" "}Outstanding work and consistent progress throughout the
        program. Great job!
      </p>

      <div className="grid md:grid-cols-2 gap-x-12 gap-y-3 mt-5 text-sm">
        {insights.tasksTotal && insights.tasksCompleted ? (
          <div className="flex items-center gap-2 text-slate-700">
            <span className="text-purple-600 text-base">•</span>
            <span>
              All tasks completed ({insights.tasksCompleted}/
              {insights.tasksTotal})
            </span>
          </div>
        ) : null}

        <div className="flex items-center gap-2 text-slate-700">
          <span className="text-purple-600 text-base">•</span>
          <span>
            {insights.onTimeRate ?? 0}% on-time across all tasks
          </span>
        </div>

        {insights.openBlockersCount === 0 ? (
          <div className="flex items-center gap-2 text-slate-700">
            <span className="text-purple-600 text-base">•</span>
            <span>No open blockers</span>
          </div>
        ) : null}

        {insights.lastActive ? (
          <div className="flex items-center gap-2 text-slate-700">
            <span className="text-purple-600 text-base">•</span>
            <span>Last active {insights.lastActive}</span>
          </div>
        ) : null}
      </div>
    </div>
  </div>
</div>
      ) : (
        <AISummaryPanel
          summary={insights.aiSummary}
          signals={insights.aiSignals}
        />
      )}
    </div>

    {insights.isCompleted !== true && (
      <div className="bg-card rounded-2xl border border-slate-200 p-6">
        <h3 className="font-semibold text-slate-900 mb-4">Measured fairly</h3>
        <DualProgress absolute={insights.absoluteProgress} relative={insights.relativeProgress} />
        {insights.riskReason && (
          <p className="mt-4 text-xs leading-relaxed text-slate-500 border-t border-slate-100 pt-3">
            {insights.riskReason}
          </p>
        )}
      </div>
    )}
  </div>
)}
      {/* ── Work history ─────────────────────────────────────────────── */}
      <div className="bg-card rounded-2xl border border-slate-200">
        <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-slate-900">Work history</h2>
            {totalTasks > 0 && <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded-full">{totalTasks}</span>}
          </div>
          <button
            onClick={() => setAssigningTask(true)}
            className="text-brand-600 hover:text-brand-700 text-sm flex items-center gap-1"
          >
            <Plus className="w-4 h-4" />Assign task
          </button>
        </div>
        <div className="p-6">
          {totalTasks === 0 ? (
            <div className="text-center py-8">
              <CheckCircle2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-600 text-sm">No tasks yet</p>
            </div>
          ) : (
            <div className="space-y-5">
              {orderedStatuses.map((status) => {
                const meta = STATUS_META[status] || { label: status, className: 'bg-slate-100 text-slate-600' };
                return (
                  <div key={status}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${meta.className}`}>{meta.label}</span>
                      <span className="text-xs text-slate-400">{grouped[status].length}</span>
                    </div>
                    <div className="space-y-2">
                      {grouped[status].map((t: any) => (
                        <button
                          key={t.id}
                          onClick={() => router.push(`/mentor/tasks/${t.id}`)}
                          className="w-full text-left flex items-center justify-between gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 hover:border-brand-200 transition-colors"
                        >
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-slate-900 truncate">{t.title}</span>
                            <span className="block text-[11px] text-slate-500 truncate">{t.source}{t.points != null ? ` · ${t.points} pts` : ''}</span>
                          </span>
                          <div className="flex items-center gap-2 shrink-0">
                            {t.isLate && <span className="text-xs text-red-600">late</span>}
                            {t.finalRating != null && (
                              <span className="inline-flex items-center gap-0.5 text-xs text-amber-600">
                                <Star className="w-3 h-3 fill-amber-400 text-amber-400" />{t.finalRating}
                              </span>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Blockers + Delays ────────────────────────────────────────── */}
      {insights && (
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Blockers */}
          <div className="bg-card rounded-2xl border border-slate-200">
            <div className="px-6 py-5 border-b border-slate-200 flex items-center gap-2">
              <Flag className="w-4 h-4 text-red-500" />
              <h2 className="text-slate-900">Blockers</h2>
            </div>
            <div className="p-6">
              {insights.blockers.filter((b) => b.status === 'open').length === 0 ? (
                <p className="text-sm text-slate-500">No open blockers.</p>
              ) : (
                <div className="space-y-2">
                  {insights.blockers.filter((b) => b.status === 'open').map((b) => (
                    <div key={b.id} className="flex items-start justify-between gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900">{b.title}</p>
                        <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 flex-wrap">
                          <span className={`px-1.5 py-0.5 rounded ${SEVERITY_CLASS[b.severity] || SEVERITY_CLASS.low}`}>{b.severity}</span>
                          <span className="capitalize">{b.category}</span>
                          <span>·</span><span>{b.daysOpen}d open</span>
                          {b.taskTitle && (<><span>·</span><span className="truncate">{b.taskTitle}</span></>)}
                        </div>
                      </div>
                      <button onClick={() => onResolveBlocker(b.id)} disabled={frictionBusy === b.id}
                        className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg disabled:opacity-50">
                        {frictionBusy === b.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}Resolve
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Delays */}
          <div className="bg-card rounded-2xl border border-slate-200">
            <div className="px-6 py-5 border-b border-slate-200 flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500" />
              <h2 className="text-slate-900">Logged delays</h2>
            </div>
            <div className="p-6">
              {insights.delays.length === 0 ? (
                <p className="text-sm text-slate-500">No delays logged.</p>
              ) : (
                <div className="space-y-2">
                  {insights.delays.map((d) => (
                    <div key={d.id} className="flex items-start justify-between gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <div className="min-w-0">
                        <p className="text-sm text-slate-900">{d.reason}</p>
                        <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 flex-wrap">
                          <span className="capitalize">{d.kind}</span><span>·</span>
                          <span>{d.days}d</span><span>·</span><span className="capitalize">{d.category}</span>
                        </div>
                        {d.aiRationale && <p className="text-xs text-slate-400 mt-1">{d.aiRationale}</p>}
                      </div>
                      {d.accepted ? (
                        <span className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-lg">
                          <Check className="w-3 h-3" />Accepted
                        </span>
                      ) : (
                        <button onClick={() => onAcceptDelay(d.id)} disabled={frictionBusy === d.id}
                          className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-brand-700 bg-brand-50 hover:bg-brand-100 rounded-lg disabled:opacity-50">
                          {frictionBusy === d.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}Accept
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Working style + Insights ─────────────────────────────────── */}
      {insights && (
        <div className="grid lg:grid-cols-2 gap-6">
          <PersonalityBars personality={insights.personality} onSave={onSavePersonality} />
          <InsightsPanel insights={insights.insights} onAdd={onAddInsight} />
        </div>
      )}

      {/* ── 1:1 notes ────────────────────────────────────────────────── */}
      {insights && (
        <div className="bg-card rounded-2xl border border-slate-200">
          <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-slate-900">1:1 notes</h2>
            <button onClick={() => setLoggingOneOnOne(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-50 text-brand-700 text-sm font-medium hover:bg-brand-100">
              <Plus className="w-4 h-4" />Log 1:1
            </button>
          </div>
          <div className="p-6">
            {insights.notes.length === 0 ? (
              <p className="text-sm text-slate-500">No 1:1s logged yet.</p>
            ) : (
              <div className="space-y-3">
                {insights.notes.map((n) => (
                  <div key={n.id} className="p-4 rounded-xl border border-slate-200">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs font-medium text-slate-700 capitalize">{n.kind}</span>
                      <span className={`px-1.5 py-0.5 rounded text-xs capitalize ${SENTIMENT_CLASS[n.sentiment] || SENTIMENT_CLASS.neutral}`}>{n.sentiment}</span>
                      <span className="text-xs text-slate-400 ml-auto">{n.date ? new Date(n.date).toLocaleDateString() : ''}{n.by ? ` · ${n.by}` : ''}</span>
                    </div>
                    <p className="text-sm text-slate-700">{n.summary}</p>
                    {n.issues.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs font-medium text-amber-700 mb-0.5">Issues</p>
                        <ul className="list-disc list-inside text-xs text-slate-600 space-y-0.5">{n.issues.map((x, i) => <li key={i}>{x}</li>)}</ul>
                      </div>
                    )}
                    {n.nextSteps.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs font-medium text-emerald-700 mb-0.5">Next steps</p>
                        <ul className="list-disc list-inside text-xs text-slate-600 space-y-0.5">{n.nextSteps.map((x, i) => <li key={i}>{x}</li>)}</ul>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Collaborators ────────────────────────────────────────────── */}
      {insights && (
        <CollaboratorsCard
          collaborators={insights.collaborators}
          onAdd={onAddCollaborator}
          onRemove={onRemoveCollaborator}
        />
      )}

      {/* ── Recent daily logs ────────────────────────────────────────── */}
      {insights && insights.dailyLogs.length > 0 && (
        <div className="bg-card rounded-2xl border border-slate-200">
          <div className="px-6 py-5 border-b border-slate-200">
            <h2 className="text-slate-900">Recent daily logs</h2>
          </div>
          <div className="p-6 space-y-2">
            {insights.dailyLogs.map((l) => (
              <div key={l.dateKey} className="flex items-start gap-3 p-3 rounded-xl border border-slate-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900">{l.dateKey} · {l.tasksDone} task{l.tasksDone === 1 ? '' : 's'} done</p>
                  {l.note && <p className="text-xs text-slate-500 mt-0.5">{l.note}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {loggingOneOnOne && insights && (
        <OneOnOneDrawer
          menteeName={insights.name}
          selfName={selfName}
          specialists={insights.collaborators.map((c) => ({ id: c.id, name: c.name, role: c.role }))}
          onClose={() => setLoggingOneOnOne(false)}
          onSave={onSaveNote}
        />
      )}

      {assigningTask && (
        <AssignTaskDrawer
          mode="single"
          mentee={{ id: menteeId, name: `${mentee?.firstName ?? ''} ${mentee?.lastName ?? ''}`.trim() || 'Mentee' }}
          onClose={() => setAssigningTask(false)}
          onAssigned={fetchMenteeDetails}
        />
      )}

      {/* ── Learning profile + Activity ──────────────────────────────── */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-card rounded-2xl border border-slate-200 p-6">
          <h3 className="text-slate-900 mb-4">Learning profile</h3>
          {profile?.learningGoals?.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center gap-2 text-slate-600 text-sm mb-2"><Target className="w-4 h-4" />Goals</div>
              <div className="flex flex-wrap gap-2">
                {profile.learningGoals.map((g: string, i: number) => (
                  <span key={i} className="px-2 py-1 bg-brand-50 text-brand-700 rounded text-xs">{g}</span>
                ))}
              </div>
            </div>
          )}
          {profile?.interests?.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center gap-2 text-slate-600 text-sm mb-2"><Star className="w-4 h-4" />Interests</div>
              <div className="flex flex-wrap gap-2">
                {profile.interests.map((s: string, i: number) => (
                  <span key={i} className="px-2 py-1 bg-purple-50 text-purple-700 rounded text-xs">{s}</span>
                ))}
              </div>
            </div>
          )}
          {profile?.priorExperience && (
            <div>
              <div className="flex items-center gap-2 text-slate-600 text-sm mb-2"><BookOpen className="w-4 h-4" />Background</div>
              <p className="text-slate-700 text-sm">{profile.priorExperience}</p>
            </div>
          )}
          {!profile?.learningGoals?.length && !profile?.interests?.length && !profile?.priorExperience && (
            <p className="text-slate-500 text-sm">No profile information yet.</p>
          )}
        </div>

        <ActivityCard
          summary={actSummary}
          dailySessions={actSessions}
          recentEvents={actEvents}
          loading={actLoading}
          days={actDays}
          onDaysChange={setActDays}
          onRefresh={refetchActivity}
          compact
        />
      </div>

      {/* ── Tracks (personal lanes) ──────────────────────────────────── */}
      <TracksPanel menteeId={menteeId} />

      {/* ── Complete level confirmation modal ────────────────────────── */}
      {showCompleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-slate-900 text-lg font-semibold mb-2">Complete this level?</h3>
            {progress < 100 && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl mb-4">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-amber-800 text-sm">
                  This mentee has completed <strong>{progress}%</strong> of tasks. Are you sure they&apos;re ready to advance?
                </p>
              </div>
            )}
            <p className="text-slate-600 text-sm mb-5">
              This marks <strong>{mentee?.firstName}&apos;s</strong> current level complete.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowCompleteConfirm(false)}
                className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-sm hover:bg-slate-50">Cancel</button>
              <button
                onClick={async () => { setShowCompleteConfirm(false); await handleApproveCompletion(); }}
                disabled={completionLoading}
                className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm flex items-center gap-2 disabled:opacity-50">
                {completionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}Yes, complete level
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reject completion modal ──────────────────────────────────── */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-slate-900 text-lg font-semibold mb-2">Reject completion request</h3>
            <p className="text-slate-600 text-sm mb-4">Provide a reason so the mentee knows what still needs doing.</p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Final project submission is still outstanding..."
              rows={4}
              className="w-full border border-slate-300 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none mb-4"
            />
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setShowRejectModal(false); setRejectReason(''); }}
                className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-sm hover:bg-slate-50">Cancel</button>
              <button onClick={handleRejectCompletion} disabled={completionLoading}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm flex items-center gap-2 disabled:opacity-50">
                {completionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}Confirm rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
