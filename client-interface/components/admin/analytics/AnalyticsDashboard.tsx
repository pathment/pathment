'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import {
  Users,
  UserCheck,
  BookOpen,
  BarChart3,
  Link2,
  TrendingUp,
  Loader2,
  RefreshCw
} from 'lucide-react';
import { useAnalyticsOverview } from '@/lib/hooks/admin';
import { KPICard } from './KPICard';
import { EnrollmentPipeline } from './EnrollmentPipeline';
import { EnrollmentDonutChart } from './EnrollmentDonutChart';
import { MatchDistributionChart } from './MatchDistributionChart';
import { MetricGaugesPanel } from './MetricGaugesPanel';
import { SystemHealthRadar } from './SystemHealthRadar';
import { UserDistributionChart } from './UserDistributionChart';

export function AnalyticsDashboard() {
  const { data, loading, error, refetch } = useAnalyticsOverview();
  const router = useRouter();

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          <p className="text-sm text-slate-500">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-6 bg-rose-50 border border-rose-200 rounded-2xl">
        <p className="text-rose-700 font-medium">Failed to load analytics</p>
        <p className="text-rose-600 text-sm mt-1">{error}</p>
        <button
          onClick={refetch}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-rose-100 text-rose-700 rounded-xl hover:bg-rose-200 transition-colors text-sm font-medium"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl text-center">
        <p className="text-slate-500">No analytics data available</p>
      </div>
    );
  }

  const completedMatches = Math.max(
    0,
    data.matches.totalMatches - data.matches.activeMatches - data.matches.pendingMatches
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Analytics Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">
            Last updated: {new Date(data.lastUpdated).toLocaleTimeString()}
          </p>
        </div>
        <button
          onClick={refetch}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors text-sm font-medium disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        <KPICard
          title="Active Mentors"
          value={data.mentors.totalMentors}
          subtitle={`${data.mentors.activeMatches} active matches`}
          icon={UserCheck}
          iconColor="blue"
          onClick={() => router.push('/admin/users/mentors')}
        />

        <KPICard
          title="Active Mentees"
          value={data.mentees.totalMentees}
          subtitle={`${data.mentees.avgProgress}% avg progress`}
          icon={Users}
          iconColor="green"
          onClick={() => router.push('/admin/users/mentees')}
        />

        <KPICard
          title="Published Programs"
          value={data.programs.publishedPrograms}
          subtitle={`${data.programs.completionRate}% completion rate`}
          icon={BookOpen}
          iconColor="indigo"
          onClick={() => router.push('/admin/programs/list')}
        />

        <KPICard
          title="Total Enrollments"
          value={data.enrollments.total}
          subtitle={`${data.enrollments.byStatus.active || 0} active`}
          icon={BarChart3}
          iconColor="purple"
          onClick={() => router.push('/admin/enrollment/overview')}
        />

        <KPICard
          title="Mentor Matches"
          value={data.matches.activeMatches}
          subtitle={`${data.matches.pendingMatches} pending`}
          icon={Link2}
          iconColor="orange"
          onClick={() => router.push('/admin/matching/mentor-assignment')}
        />

        <KPICard
          title="Engagement Score"
          value={`${data.mentees.engagementScore}%`}
          subtitle={`Satisfaction: ${data.matches.avgSatisfaction}/5`}
          icon={TrendingUp}
          iconColor="rose"
        />
      </div>

      {/* Row 2: Charts (Radar, User Distribution, Match Distribution) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <SystemHealthRadar 
          mentorUtilization={data.mentors.utilization}
          menteeEngagement={data.mentees.engagementScore}
          menteeProgress={data.mentees.avgProgress}
          programCompletion={data.programs.completionRate}
          mentorRating={data.mentors.avgRating}
          matchSatisfaction={data.matches.avgSatisfaction}
        />
        
        <UserDistributionChart 
          totalMentors={data.mentors.totalMentors}
          activeMentors={data.mentors.activeMatches}
          totalMentees={data.mentees.totalMentees}
          activeMentees={data.mentees.activeEnrollments}
        />

        <MatchDistributionChart
          totalMatches={data.matches.totalMatches}
          activeMatches={data.matches.activeMatches}
          pendingMatches={data.matches.pendingMatches}
          completedMatches={completedMatches}
          cancelledMatches={0}
          avgSatisfaction={data.matches.avgSatisfaction}
        />
      </div>

      {/* Row 3: Enrollments (Donut + Pipeline) */}
      <div className="space-y-5">
        <EnrollmentDonutChart
          byStatus={data.enrollments.byStatus}
          total={data.enrollments.total}
        />
        <EnrollmentPipeline byStatus={data.enrollments.byStatus} />
      </div>

      {/* Row 4: Metric Gauges Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <MetricGaugesPanel
          title="Mentor Performance"
          gauges={[
            {
              value: parseFloat(data.mentors.avgRating),
              maxValue: 5,
              label: 'Avg Rating',
              color: '#3b82f6',
            },
            {
              value: data.mentors.utilization,
              maxValue: 100,
              label: 'Utilization',
              color: '#8b5cf6',
            },
          ]}
          stats={[
            { label: 'Total Mentors', value: data.mentors.totalMentors },
            { label: 'Active Matches', value: data.mentors.activeMatches, color: 'text-emerald-600' },
          ]}
        />

        <MetricGaugesPanel
          title="Program Health"
          gauges={[
            {
              value: data.programs.completionRate,
              maxValue: 100,
              label: 'Completion',
              color: '#6366f1',
            },
            {
              value: data.programs.totalPrograms > 0
                ? Math.round((data.programs.publishedPrograms / data.programs.totalPrograms) * 100)
                : 0,
              maxValue: 100,
              label: 'Published',
              color: '#10b981',
            },
          ]}
          stats={[
            {
              label: 'Total Programs',
              value: `${data.programs.publishedPrograms} / ${data.programs.totalPrograms}`,
            },
            { label: 'Draft Programs', value: data.programs.draftPrograms, color: 'text-amber-600' },
          ]}
        />

        <MetricGaugesPanel
          title="Mentee Progress"
          gauges={[
            {
              value: data.mentees.avgProgress,
              maxValue: 100,
              label: 'Avg Progress',
              color: '#10b981',
            },
            {
              value: data.mentees.engagementScore,
              maxValue: 100,
              label: 'Engagement',
              color: '#f43f5e',
            },
          ]}
          stats={[
            { label: 'Active Enrollments', value: data.mentees.activeEnrollments },
            { label: 'Total Mentees', value: data.mentees.totalMentees },
          ]}
        />
      </div>
    </div>
  );
}
