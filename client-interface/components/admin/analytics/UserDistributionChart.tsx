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
  Legend,
} from 'recharts';

interface UserDistributionChartProps {
  totalMentors: number;
  activeMentors: number; // For mentors, active matches can be a proxy, or just use total if we don't have 'active' status distinct
  totalMentees: number;
  activeMentees: number; // For mentees, active enrollments
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-slate-200 px-3 py-2 rounded-lg shadow-lg text-xs">
        <p className="font-semibold text-slate-900 mb-1">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center gap-2 mt-1">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-slate-600">{entry.name}:</span>
            <span className="font-medium text-slate-900">{entry.value}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export function UserDistributionChart({
  totalMentors,
  activeMentors,
  totalMentees,
  activeMentees,
}: UserDistributionChartProps) {
  const data = [
    {
      name: 'Mentors',
      Total: totalMentors,
      Active: activeMentors,
    },
    {
      name: 'Mentees',
      Total: totalMentees,
      Active: activeMentees,
    },
  ];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col">
      <div className="mb-6">
        <h3 className="text-base font-semibold text-slate-900">User Distribution</h3>
        <p className="text-xs text-slate-500 mt-1">Total vs Active users by role</p>
      </div>

      <div className="flex-1 min-h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 0, right: 20, left: 0, bottom: 0 }}
            barGap={4}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
            <XAxis type="number" hide />
            <YAxis 
              dataKey="name" 
              type="category" 
              axisLine={false} 
              tickLine={false} 
              tick={{ fill: '#475569', fontSize: 12, fontWeight: 500 }} 
              width={60}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc' }} />
            <Legend 
              iconType="circle" 
              wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} 
            />
            <Bar 
              dataKey="Total" 
              fill="#cbd5e1" 
              radius={[0, 4, 4, 0]} 
              barSize={16} 
              animationDuration={1000} 
            />
            <Bar 
              dataKey="Active" 
              fill="#3b82f6" 
              radius={[0, 4, 4, 0]} 
              barSize={16} 
              animationDuration={1000} 
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
