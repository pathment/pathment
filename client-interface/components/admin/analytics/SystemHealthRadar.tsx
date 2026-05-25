'use client';

import React from 'react';
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

interface SystemHealthRadarProps {
  mentorUtilization: number;
  menteeEngagement: number;
  menteeProgress: number;
  programCompletion: number;
  mentorRating: string | number;
  matchSatisfaction: string | number;
}

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-slate-900 text-white px-3 py-2 rounded-lg shadow-xl text-xs border border-slate-700">
        <p className="font-semibold mb-1 text-slate-100">{data.subject}</p>
        <p className="text-indigo-300">
          Score: <span className="text-white font-medium">{data.rawScore}</span>
        </p>
        <p className="text-slate-400 mt-0.5 text-[10px]">Normalized: {data.fullMark}%</p>
      </div>
    );
  }
  return null;
};

export function SystemHealthRadar({
  mentorUtilization,
  menteeEngagement,
  menteeProgress,
  programCompletion,
  mentorRating,
  matchSatisfaction,
}: SystemHealthRadarProps) {
  // Normalize ratings (out of 5) to percentages (out of 100)
  const normMentorRating = Math.min(100, (parseFloat(String(mentorRating)) / 5) * 100);
  const normMatchSatisfaction = Math.min(100, (parseFloat(String(matchSatisfaction)) / 5) * 100);

  const data = [
    {
      subject: 'Utilization',
      fullMark: Math.round(mentorUtilization),
      rawScore: `${Math.round(mentorUtilization)}%`,
    },
    {
      subject: 'Engagement',
      fullMark: Math.round(menteeEngagement),
      rawScore: `${Math.round(menteeEngagement)}%`,
    },
    {
      subject: 'Progress',
      fullMark: Math.round(menteeProgress),
      rawScore: `${Math.round(menteeProgress)}%`,
    },
    {
      subject: 'Completion',
      fullMark: Math.round(programCompletion),
      rawScore: `${Math.round(programCompletion)}%`,
    },
    {
      subject: 'Mentor Rating',
      fullMark: Math.round(normMentorRating),
      rawScore: `${parseFloat(String(mentorRating)).toFixed(1)}/5.0`,
    },
    {
      subject: 'Satisfaction',
      fullMark: Math.round(normMatchSatisfaction),
      rawScore: `${parseFloat(String(matchSatisfaction)).toFixed(1)}/5.0`,
    },
  ];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col">
      <div className="mb-2">
        <h3 className="text-base font-semibold text-slate-900">System Health Overview</h3>
        <p className="text-xs text-slate-500 mt-1">Normalized metrics across all modules</p>
      </div>
      
      <div className="flex-1 min-h-[250px] -mx-4">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
            <PolarGrid stroke="#e2e8f0" />
            <PolarAngleAxis 
              dataKey="subject" 
              tick={{ fill: '#64748b', fontSize: 11, fontWeight: 500 }} 
            />
            <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
            <Radar
              name="Health Score"
              dataKey="fullMark"
              stroke="#6366f1"
              strokeWidth={2}
              fill="#818cf8"
              fillOpacity={0.4}
              animationDuration={1200}
            />
            <Tooltip content={<CustomTooltip />} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
