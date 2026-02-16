'use client';

import { BookOpen, Users, UserCheck, TrendingUp } from 'lucide-react';

interface DashboardStatsProps {
  stats?: {
    totalPrograms: number;
    activeMentees: number;
    activeMentors: number;
    completionRate: number;
  };
}

export function DashboardStats({ stats }: DashboardStatsProps) {
  const statsData = [
    { 
      label: 'Total Programs', 
      value: stats?.totalPrograms?.toString() || '0', 
      icon: BookOpen, 
      color: 'indigo' 
    },
    { 
      label: 'Active Mentees', 
      value: stats?.activeMentees?.toString() || '0', 
      icon: Users, 
      color: 'green' 
    },
    { 
      label: 'Active Mentors', 
      value: stats?.activeMentors?.toString() || '0', 
      icon: UserCheck, 
      color: 'purple' 
    },
    { 
      label: 'Avg Completion', 
      value: `${stats?.completionRate || 0}%`, 
      icon: TrendingUp, 
      color: 'blue' 
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      {statsData.map((stat) => {
        const Icon = stat.icon;
        return (
          <div key={stat.label} className="bg-white rounded-2xl p-6 border border-slate-200">
            <div className="flex items-start justify-between mb-4">
              <div className={`w-12 h-12 bg-${stat.color}-100 rounded-xl flex items-center justify-center`}>
                <Icon className={`w-6 h-6 text-${stat.color}-600`} />
              </div>
            </div>
            <div className="text-slate-600 text-sm mb-1">{stat.label}</div>
            <div className="text-slate-900 text-2xl">{stat.value}</div>
          </div>
        );
      })}
    </div>
  );
}
