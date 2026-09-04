'use client';

import React from 'react';
import { Sparkles } from 'lucide-react';

export interface QueueProgressBannerProps {
  title: string;
  completed: number;
  total: number;
  active: boolean;
  icon?: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  lastRunAt?: string | null;
  count?: number;
  completedLabel?: string;
}

export function QueueProgressBanner({
  title,
  completed = 0,
  total = 0,
  active,
  icon: Icon = Sparkles,
  lastRunAt,
  count,
  completedLabel,
}: QueueProgressBannerProps) {
  if (active) {
    const validTotal = total > 0 ? total : 1;
    const percent = Math.min(100, Math.round((completed / validTotal) * 100));

    return (
      <div className="bg-brand-500/10 border border-brand-500/20 rounded-xl px-4 py-3 text-xs font-semibold space-y-2 mb-4 transition-all shadow-xs">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-brand-600 font-bold">
            <Icon className="w-3.5 h-3.5 animate-spin text-brand-600" style={{ animationDuration: '3s' }} />
            {title}
          </span>
          <span className="text-muted-foreground font-mono text-[10px] bg-brand-500/15 px-2 py-0.5 rounded-full font-bold">
            {total > 0 ? `${completed} / ${total} (${percent}%)` : 'Initializing queue...'}
          </span>
        </div>
        <div className="w-full bg-muted/40 rounded-full h-2 overflow-hidden">
          <div
            className="bg-brand-600 h-2 rounded-full transition-all duration-300 ease-out"
            style={{ width: `${total > 0 ? percent : 10}%` }}
          />
        </div>
      </div>
    );
  }

  if (!lastRunAt && count == null) return null;

  return (
    <div className="flex items-center justify-between bg-brand-500/5 border border-brand-500/20 rounded-xl px-3.5 py-2 text-[10px] text-muted-foreground font-semibold mb-4">
      <span className="flex items-center gap-1.5 text-brand-600 font-bold">
        <Icon className="w-3.5 h-3.5" />
        {completedLabel || `Completed for ${count ?? 0} item(s)`}
      </span>
      {lastRunAt && <span>Last run: {new Date(lastRunAt).toLocaleString()}</span>}
    </div>
  );
}
