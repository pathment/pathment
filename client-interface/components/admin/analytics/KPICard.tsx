'use client';

import React from 'react';
import { type LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  iconColor: 'indigo' | 'green' | 'blue' | 'purple' | 'orange' | 'rose';
  trend?: {
    value: number;
    isPositive: boolean;
  };
  onClick?: () => void;
}

const colorMap: Record<string, string> = {
  indigo: 'text-indigo-600 bg-indigo-50',
  green: 'text-emerald-600 bg-emerald-50',
  blue: 'text-blue-600 bg-blue-50',
  purple: 'text-purple-600 bg-purple-50',
  orange: 'text-amber-600 bg-amber-50',
  rose: 'text-rose-600 bg-rose-50'
};

const iconBorderMap: Record<string, string> = {
  indigo: 'border-indigo-100',
  green: 'border-emerald-100',
  blue: 'border-blue-100',
  purple: 'border-purple-100',
  orange: 'border-amber-100',
  rose: 'border-rose-100'
};

export function KPICard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconColor,
  trend,
  onClick
}: KPICardProps) {
  return (
    <div
      onClick={onClick}
      className={`group relative bg-white rounded-2xl border border-slate-200 p-6 transition-all duration-200 hover:shadow-lg hover:shadow-slate-100 hover:-translate-y-0.5 ${
        onClick ? 'cursor-pointer' : ''
      }`}
    >
      <div className="flex items-start justify-between mb-4">
        <div className={`p-3 rounded-xl border ${colorMap[iconColor]} ${iconBorderMap[iconColor]}`}>
          <Icon className="w-5 h-5" />
        </div>
        {trend && (
          <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
            trend.isPositive
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-rose-50 text-rose-700'
          }`}>
            {trend.isPositive ? (
              <TrendingUp className="w-3 h-3" />
            ) : (
              <TrendingDown className="w-3 h-3" />
            )}
            {trend.value}%
          </div>
        )}
      </div>

      <p className="text-sm font-medium text-slate-500 mb-1">{title}</p>
      <p className="text-3xl font-bold text-slate-900 tracking-tight">{value}</p>

      {subtitle && (
        <p className="text-xs text-slate-400 mt-2">{subtitle}</p>
      )}
    </div>
  );
}
