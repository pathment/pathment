'use client';

import { Clock } from 'lucide-react';
import { type TimeLeft } from '@/lib/hooks/useCountdown';

interface CountdownTickerProps {
  timeLeft: TimeLeft;
  showIcon?: boolean;
  className?: string;
}

export function CountdownTicker({ timeLeft, showIcon = true, className = '' }: CountdownTickerProps) {
  if (timeLeft.isExpired) {
    return null;
  }

  return (
    <div className={`flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-3 ${className}`}>
      {showIcon && (
        <div className="flex items-center justify-center p-2 text-brand-600 dark:text-brand-400">
          <Clock className="h-5 w-5 animate-spin-slow" />
        </div>
      )}

      <div className="flex items-center gap-2 text-center tabular-nums">
        {timeLeft.days > 0 && (
          <>
            <div className="flex flex-col">
              <span className="text-lg font-extrabold text-slate-900 dark:text-white">
                {String(timeLeft.days).padStart(2, '0')}
              </span>
              <span className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                days
              </span>
            </div>
            <span className="text-lg font-bold text-slate-400 dark:text-slate-600">:</span>
          </>
        )}

        <div className="flex flex-col">
          <span className="text-lg font-extrabold text-slate-900 dark:text-white">
            {String(timeLeft.hours).padStart(2, '0')}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
            hrs
          </span>
        </div>
        <span className="text-lg font-bold text-slate-400 dark:text-slate-600">:</span>

        <div className="flex flex-col">
          <span className="text-lg font-extrabold text-slate-900 dark:text-white">
            {String(timeLeft.minutes).padStart(2, '0')}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
            mins
          </span>
        </div>
        <span className="text-lg font-bold text-slate-400 dark:text-slate-600">:</span>

        <div className="flex flex-col">
          <span className="text-lg font-extrabold text-brand-600 dark:text-brand-400">
            {String(timeLeft.seconds).padStart(2, '0')}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
            secs
          </span>
        </div>
      </div>
    </div>
  );
}
