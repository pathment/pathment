import React from 'react';

interface StatsCardProps {
  /** Lucide icon component */
  icon: React.ElementType;
  label: string;
  value: string | number;
  /** Optional small sub-text below the value */
  sub?: string;
  /**
   * Tailwind classes for the icon container background + icon colour.
   * e.g. 'text-brand-600 bg-brand-50'  (default)
   */
  colorClass?: string;
  valueClassName?: string;
}

export function StatsCard({
  icon: Icon,
  label,
  value,
  sub,
  colorClass = 'text-brand-600 bg-brand-50',
}: StatsCardProps) {
  return (
    <div className="bg-card rounded-2xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-slate-500">{label}</p>
        <div className={`p-2 rounded-xl ${colorClass}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p className="text-3xl font-bold text-slate-900">{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}
