import React from 'react';

interface ProgressBarProps {
  /** 0–100 */
  value: number;
  /** Tailwind bg class for the filled bar, default: 'bg-indigo-500' */
  color?: string;
  showLabel?: boolean;
  size?: 'xs' | 'sm' | 'md';
  /** Optional text rendered below the bar, e.g. "2/10 tasks · Week 1" */
  sub?: string;
}

const SIZE_H: Record<string, string> = {
  xs: 'h-1',
  sm: 'h-1.5',
  md: 'h-2',
};

export function ProgressBar({
  value,
  color = 'bg-indigo-500',
  showLabel = true,
  size = 'sm',
  sub,
}: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value));

  return (
    <div className="min-w-[100px]">
      {showLabel && (
        <div className="flex items-center gap-2 mb-1">
          <div className={`flex-1 ${SIZE_H[size]} bg-slate-100 rounded-full overflow-hidden`}>
            <div
              className={`h-full ${color} rounded-full transition-all`}
              style={{ width: `${clamped}%` }}
            />
          </div>
          <span className="text-xs text-slate-600 tabular-nums w-8 text-right">{clamped}%</span>
        </div>
      )}
      {!showLabel && (
        <div className={`flex-1 ${SIZE_H[size]} bg-slate-100 rounded-full overflow-hidden`}>
          <div
            className={`h-full ${color} rounded-full transition-all`}
            style={{ width: `${clamped}%` }}
          />
        </div>
      )}
      {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}
