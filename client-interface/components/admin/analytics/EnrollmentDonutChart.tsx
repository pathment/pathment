'use client';

import React from 'react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

interface EnrollmentDonutChartProps {
  byStatus: Record<string, number>;
  total: number;
}

const STATUS_COLORS: Record<string, string> = {
  pending_approval: '#f59e0b',
  approved: '#0ea5e9',
  rejected: '#ef4444',
  pending_match: '#8b5cf6',
  matched: '#6366f1',
  active: '#10b981',
  pending_completion: '#14b8a6',
  level_completed: '#3b82f6',
  program_completed: '#22c55e',
  dropped: '#94a3b8',
};

const STATUS_LABELS: Record<string, string> = {
  pending_approval: 'Pending Approval',
  approved: 'Approved',
  rejected: 'Rejected',
  pending_match: 'Pending Match',
  matched: 'Matched',
  active: 'Active',
  pending_completion: 'Pending Completion',
  level_completed: 'Level Completed',
  program_completed: 'Completed',
  dropped: 'Dropped',
};

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const entry = payload[0];
    return (
      <div className="bg-slate-900 text-white px-3 py-2 rounded-lg shadow-xl text-xs">
        <p className="font-medium">{entry.name}</p>
        <p className="text-slate-300 mt-0.5">{entry.value} enrollments</p>
      </div>
    );
  }
  return null;
};

export function EnrollmentDonutChart({ byStatus, total }: EnrollmentDonutChartProps) {
  const chartData = Object.entries(byStatus)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => ({
      name: STATUS_LABELS[status] || status.replace(/_/g, ' '),
      value: count,
      color: STATUS_COLORS[status] || '#94a3b8',
    }));

  if (chartData.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-base font-semibold text-slate-900 mb-4">Enrollment Distribution</h2>
        <p className="text-sm text-slate-500">No enrollment data available</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6">
      <h2 className="text-base font-semibold text-slate-900 mb-2">Enrollment Distribution</h2>
      <div className="flex flex-col lg:flex-row items-center gap-6">
        <div className="relative w-56 h-56 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={65}
                outerRadius={95}
                paddingAngle={3}
                dataKey="value"
                strokeWidth={0}
                animationBegin={0}
                animationDuration={800}
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-3xl font-bold text-slate-900">{total}</span>
            <span className="text-xs text-slate-400 font-medium">Total</span>
          </div>
        </div>

        <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2.5 w-full">
          {chartData.map((entry) => (
            <div key={entry.name} className="flex items-center gap-2.5 min-w-0">
              <div
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: entry.color }}
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-slate-500 truncate">{entry.name}</p>
                <p className="text-sm font-semibold text-slate-900">{entry.value}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
