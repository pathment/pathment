'use client';

import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

interface MatchDistributionChartProps {
  totalMatches: number;
  activeMatches: number;
  pendingMatches: number;
  completedMatches: number;
  cancelledMatches: number;
  avgSatisfaction: string;
}

const COLORS = {
  active: '#10b981',
  pending: '#f59e0b',
  completed: '#6366f1',
  cancelled: '#94a3b8',
};

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const entry = payload[0];
    return (
      <div className="bg-slate-900 text-white px-3 py-2 rounded-lg shadow-xl text-xs">
        <p className="font-medium">{entry.payload.label}</p>
        <p className="text-slate-300 mt-0.5">{entry.value} matches</p>
      </div>
    );
  }
  return null;
};

export function MatchDistributionChart({
  totalMatches,
  activeMatches,
  pendingMatches,
  completedMatches,
  cancelledMatches,
  avgSatisfaction,
}: MatchDistributionChartProps) {
  const chartData = [
    { label: 'Active', value: activeMatches, color: COLORS.active },
    { label: 'Pending', value: pendingMatches, color: COLORS.pending },
    { label: 'Completed', value: completedMatches, color: COLORS.completed },
    { label: 'Cancelled', value: cancelledMatches, color: COLORS.cancelled },
  ].filter((d) => d.value > 0);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Match Distribution</h3>
          <p className="text-xs text-slate-400 mt-0.5">{totalMatches} total matches</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-slate-900">{avgSatisfaction}</p>
          <p className="text-xs text-slate-400">Avg Satisfaction</p>
        </div>
      </div>

      {chartData.length > 0 ? (
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barSize={36} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="#f1f5f9"
              />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: '#94a3b8' }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                allowDecimals={false}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc', radius: 8 }} />
              <Bar dataKey="value" radius={[8, 8, 0, 0]} animationDuration={700}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-52 flex items-center justify-center">
          <p className="text-sm text-slate-400">No match data available</p>
        </div>
      )}
    </div>
  );
}
