'use client';

import { BookOpen, Users, UserCheck, TrendingUp } from 'lucide-react';
import { StatsCard } from '@/components/admin/ui';

interface DashboardStatsProps {
  stats?: {
    totalPrograms: number;
    activeMentees: number;
    activeMentors: number;
    completionRate: number;
  };
}

export function DashboardStats({ stats }: DashboardStatsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      <StatsCard
        icon={BookOpen}
        label="Total Programs"
        value={stats?.totalPrograms ?? 0}
        colorClass="text-indigo-600 bg-indigo-50"
      />
      <StatsCard
        icon={Users}
        label="Active Mentees"
        value={stats?.activeMentees ?? 0}
        colorClass="text-green-600 bg-green-50"
      />
      <StatsCard
        icon={UserCheck}
        label="Active Mentors"
        value={stats?.activeMentors ?? 0}
        colorClass="text-purple-600 bg-purple-50"
      />
      <StatsCard
        icon={TrendingUp}
        label="Avg Completion"
        value={`${stats?.completionRate ?? 0}%`}
        colorClass="text-blue-600 bg-blue-50"
      />
    </div>
  );
}
