'use client';

import React from 'react';
import {
  RadialBarChart,
  RadialBar,
  ResponsiveContainer,
  PolarAngleAxis,
} from 'recharts';

interface RadialGaugeProps {
  value: number;
  maxValue?: number;
  label: string;
  color: string;
  size?: number;
}

function RadialGauge({ value, maxValue = 100, label, color, size = 100 }: RadialGaugeProps) {
  const percentage = Math.min((value / maxValue) * 100, 100);
  const data = [{ value: percentage, fill: color }];

  return (
    <div className="flex flex-col items-center">
      <div style={{ width: size, height: size }} className="relative">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            cx="50%"
            cy="50%"
            innerRadius="75%"
            outerRadius="100%"
            data={data}
            startAngle={90}
            endAngle={-270}
            barSize={8}
          >
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} angleAxisId={0} />
            <RadialBar
              dataKey="value"
              cornerRadius={12}
              background={{ fill: '#f1f5f9' }}
              animationDuration={800}
            />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold text-slate-900">
            {maxValue === 5 ? value : `${Math.round(value)}%`}
          </span>
        </div>
      </div>
      <p className="text-xs text-slate-500 mt-1.5 text-center font-medium">{label}</p>
    </div>
  );
}

interface MetricGaugesPanelProps {
  title: string;
  gauges: Array<{
    value: number;
    maxValue?: number;
    label: string;
    color: string;
  }>;
  stats: Array<{
    label: string;
    value: string | number;
    color?: string;
  }>;
}

export function MetricGaugesPanel({ title, gauges, stats }: MetricGaugesPanelProps) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6">
      <h3 className="text-base font-semibold text-slate-900 mb-5">{title}</h3>

      <div className="flex items-center justify-center gap-6 mb-5">
        {gauges.map((gauge) => (
          <RadialGauge
            key={gauge.label}
            value={gauge.value}
            maxValue={gauge.maxValue}
            label={gauge.label}
            color={gauge.color}
          />
        ))}
      </div>

      <div className="border-t border-slate-100 pt-4 space-y-2.5">
        {stats.map((stat) => (
          <div key={stat.label} className="flex items-center justify-between">
            <span className="text-sm text-slate-500">{stat.label}</span>
            <span className={`text-sm font-semibold ${stat.color || 'text-slate-900'}`}>
              {stat.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
