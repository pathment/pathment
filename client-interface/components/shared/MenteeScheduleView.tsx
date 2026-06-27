'use client';

import { useEffect, useState } from 'react';
import { CalendarClock, Route, Repeat, Check, Loader2, Clock } from 'lucide-react';
import { scheduleApi, type MenteeScheduleResult, type ScheduleSlot } from '@/lib/services/schedule-api';

/**
 * Read-only "this mentee's week" — the same per-mentee schedule the mentor fills,
 * shown without editing on the mentee detail page (mentor + admin). Roadmap slots
 * surface live progress (started? x/N steps done) so a finished roadmap reads as
 * finished instead of looking like fresh, unassigned work.
 */
function RoadmapChain({ slot }: { slot: ScheduleSlot }) {
  const details = slot.chainDetails ?? [];
  if (!details.length) {
    // No enrichment (shouldn't happen) — fall back to a plain count.
    return <p className="text-xs text-slate-500">{slot.roadmapChain?.length || 0} roadmap(s) linked</p>;
  }
  return (
    <div className="space-y-2">
      {details.map((r, i) => (
        <div key={r.id || `rm-${i}`} className="rounded-lg border border-slate-200 bg-white dark:bg-slate-900/40 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-slate-800 truncate">{i + 1}. {r.name}</span>
            {r.completed ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 shrink-0"><Check className="w-3.5 h-3.5" />Done</span>
            ) : r.started ? (
              <span className="text-xs text-slate-500 shrink-0">{r.currentStep}/{r.totalSteps} steps</span>
            ) : (
              <span className="text-xs text-slate-400 shrink-0">Not started</span>
            )}
          </div>
          {r.totalSteps > 0 && (
            <div className="mt-1.5 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
              <div className={`h-full rounded-full ${r.completed ? 'bg-emerald-500' : 'bg-brand-500'}`} style={{ width: `${r.percent}%` }} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function MenteeScheduleView({ menteeId, className = '' }: { menteeId: string; className?: string }) {
  const [data, setData] = useState<MenteeScheduleResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    scheduleApi.getMenteeSchedule(menteeId)
      .then((r) => { if (active) setData((r?.data?.schedule as MenteeScheduleResult) ?? null); })
      .catch(() => { if (active) setData(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [menteeId]);

  const slots = data?.schedule ?? [];

  return (
    <div className={`bg-card rounded-2xl border border-slate-200 ${className}`}>
      <div className="px-6 py-5 border-b border-slate-200 flex items-center gap-2">
        <CalendarClock className="w-4 h-4 text-brand-500" />
        <h2 className="text-slate-900">Weekly schedule</h2>
        {data?.templateName && <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded-full">{data.templateName}</span>}
      </div>
      <div className="p-6">
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-brand-600" /></div>
        ) : slots.length === 0 ? (
          <p className="text-sm text-slate-500">No schedule assigned yet — the mentor assigns a template, then fills each slot.</p>
        ) : (
          <div className="space-y-3">
            {slots.map((s, i) => (
              <div key={s.id || `slot-${i}`} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="font-medium text-slate-900">{s.label}</p>
                  <span className="inline-flex items-center gap-1 text-xs text-slate-500 shrink-0"><Clock className="w-3 h-3" />{s.time} · {s.days}</span>
                </div>
                {s.kind === 'roadmap' ? (
                  <div className="mt-2">
                    <div className="flex items-center gap-1.5 mb-1.5 text-xs font-medium text-slate-600"><Route className="w-3.5 h-3.5 text-brand-500" />Roadmap chain</div>
                    <RoadmapChain slot={s} />
                  </div>
                ) : s.kind === 'recurring' ? (
                  <div className="mt-1 inline-flex items-center gap-1.5 text-sm text-slate-600">
                    <Repeat className="w-3.5 h-3.5 text-brand-500" />
                    <span className="font-medium text-slate-800">{s.recurring?.title || 'Ritual'}</span>
                    {s.recurring && <span className="text-xs text-slate-400 capitalize">· {s.recurring.type} · {s.recurring.recurrence}</span>}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">Open time — nothing scheduled</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
