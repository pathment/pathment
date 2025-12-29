'use client';

import { BookOpen, Users, UserCheck, TrendingUp, ArrowUpRight } from 'lucide-react';

export function DashboardStats() {
  const stats = [
    { label: 'Total Programs', value: '24', change: '+12%', icon: BookOpen, color: 'indigo' },
    { label: 'Active Mentees', value: '156', change: '+8%', icon: Users, color: 'green' },
    { label: 'Active Mentors', value: '42', change: '+5%', icon: UserCheck, color: 'purple' },
    { label: 'Completion Rate', value: '87%', change: '+3%', icon: TrendingUp, color: 'blue' },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <div key={stat.label} className="bg-white rounded-2xl p-6 border border-slate-200">
            <div className="flex items-start justify-between mb-4">
              <div className={`w-12 h-12 bg-${stat.color}-100 rounded-xl flex items-center justify-center`}>
                <Icon className={`w-6 h-6 text-${stat.color}-600`} />
              </div>
              <span className="text-green-600 text-sm flex items-center gap-1">
                <ArrowUpRight className="w-4 h-4" />
                {stat.change}
              </span>
            </div>
            <div className="text-slate-600 text-sm mb-1">{stat.label}</div>
            <div className="text-slate-900 text-2xl">{stat.value}</div>
          </div>
        );
      })}
    </div>
  );
}
