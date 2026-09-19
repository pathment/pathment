'use client';

import { useEffect, useState } from 'react';
import { Repeat, Sun, Moon, Clock } from 'lucide-react';
import { useClan } from '@/lib/context/ClanContext';
import { scheduleApi, type ScheduleSlot } from '@/lib/services/schedule-api';

const RECUR_LABEL: Record<string, string> = { daily: 'Daily', weekly: 'Weekly', once: '' };

/**
 * Recurring rituals for the mentee's This-Week view - the repeating, no-approval
 * habits from their schedule (journaling, standup, reading). Lightweight: shows
 * what recurs and when; ticking happens in the Daily Log.
 */
export function RecurringRitualsCard() {
  const { menteeActiveClanId } = useClan();
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    scheduleApi.getMySchedule().then((res: any) => {
      if (!active) return;
      const all: ScheduleSlot[] = res?.data?.schedule?.schedule ?? res?.data?.schedule ?? [];
      setSlots((Array.isArray(all) ? all : []).filter((s) => s.kind === 'recurring' && s.recurring));
    }).catch(() => setSlots([])).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [menteeActiveClanId]);

  if (loading || slots.length === 0) return null;

  return (
    <div className="bg-card rounded-2xl border border-slate-200">
      <div className="px-6 py-5 border-b border-slate-200 flex items-center gap-2">
        <Repeat className="w-4 h-4 text-brand-600" />
        <h2 className="text-slate-900">Your rituals</h2>
        <span className="text-xs text-slate-400 ml-auto">tick them off in your Daily Log</span>
      </div>
      <div className="p-4 grid gap-2 sm:grid-cols-2">
        {slots.map((s) => {
          const Icon = /night|dinner|evening/i.test(s.label) ? Moon : /morning|sunrise|journal/i.test(s.label) ? Sun : Clock;
          return (
            <div key={s.id} className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-50 text-brand-600 shrink-0"><Icon className="w-4 h-4" /></span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-slate-800 truncate">{s.recurring?.title || s.label}</div>
                <div className="text-xs text-slate-500 truncate">
                  {s.time || 'Flexible'}{s.days && s.days !== 'everyday' ? ` · ${s.days}` : ''}
                </div>
              </div>
              {s.recurring?.recurrence && RECUR_LABEL[s.recurring.recurrence] && (
                <span className="shrink-0 px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 text-[11px] font-medium">
                  {RECUR_LABEL[s.recurring.recurrence]}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
