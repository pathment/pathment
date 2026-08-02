'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CalendarClock, Loader2, Trash2, Plus, Repeat, Clock } from 'lucide-react';
import { Drawer } from '@/components/shared/Drawer';
import { SelectMenu } from '@/components/shared/SelectMenu';
import { mentorApi } from '@/lib/services/mentor-api';
import { useConfirm } from '@/lib/context/ConfirmContext';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import type { ClanLite } from '@/lib/context/ClanContext';

interface ReviewSchedule {
  id: string;
  clanId: string;
  title: string | null;
  dayOfWeek: number;
  timeLocal: string;
  timezone: string;
  intervalWeeks: number;
  durationMinutes: number;
  startsOn: string;
  endsOn: string | null;
  active: boolean;
  clan?: { id: string; name: string } | null;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_OPTIONS = DAYS.map((d, i) => ({ value: String(i), label: d }));
const INTERVAL_OPTIONS = [
  { value: '1', label: 'Every week' },
  { value: '2', label: 'Every other week' },
];
const DURATION_OPTIONS = [30, 45, 60, 90, 120].map((m) => ({ value: String(m), label: `${m} min` }));

const browserTz = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
};
// Local YYYY-MM-DD for "today" (default start date), no UTC shift.
const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const to12h = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  const ap = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ap}`;
};

interface Props {
  open: boolean;
  onClose: () => void;
  clans: ClanLite[];
  defaultClanId: string | null;
}

/**
 * ReviewScheduleDrawer — set up and manage recurring cohort reviews. A mentor
 * picks a clan, weekday, local time and cadence; the backend materialises each
 * occurrence as a session (room auto-opens at the time) and emails everyone a
 * timezone-correct invite + reminders with a calendar attachment.
 */
export function ReviewScheduleDrawer({ open, onClose, clans, defaultClanId }: Props) {
  const confirm = useConfirm();
  const [loading, setLoading] = useState(true);
  const [schedules, setSchedules] = useState<ReviewSchedule[]>([]);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Form state.
  const [clanId, setClanId] = useState(defaultClanId || clans[0]?.id || '');
  const [title, setTitle] = useState('');
  const [dayOfWeek, setDayOfWeek] = useState('1'); // Monday
  const [timeLocal, setTimeLocal] = useState('17:00');
  const [intervalWeeks, setIntervalWeeks] = useState('1');
  const [durationMinutes, setDurationMinutes] = useState('60');
  const [startsOn, setStartsOn] = useState(todayLocal());
  const [endsOn, setEndsOn] = useState('');
  const tz = useMemo(browserTz, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r: any = await mentorApi.listReviewSchedules(); // eslint-disable-line @typescript-eslint/no-explicit-any
      setSchedules(r?.data ?? r?.data?.schedules ?? []);
    } catch {
      setSchedules([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    // Reset the create form each open.
    setClanId(defaultClanId || clans[0]?.id || '');
    setTitle(''); setDayOfWeek('1'); setTimeLocal('17:00');
    setIntervalWeeks('1'); setDurationMinutes('60'); setStartsOn(todayLocal()); setEndsOn('');
  }, [open, load, defaultClanId, clans]);

  const clanName = (id: string) => clans.find((c) => c.id === id)?.name || 'Clan';

  const submit = async () => {
    if (!clanId) { toast.error('Pick a clan'); return; }
    if (!/^\d{2}:\d{2}$/.test(timeLocal)) { toast.error('Pick a time'); return; }
    if (!startsOn) { toast.error('Pick a start date'); return; }
    if (endsOn && endsOn < startsOn) { toast.error('End date must be after the start date'); return; }
    try {
      setCreating(true);
      await mentorApi.createReviewSchedule({
        clanId,
        title: title.trim() || undefined,
        dayOfWeek: Number(dayOfWeek),
        timeLocal,
        timezone: tz,
        intervalWeeks: Number(intervalWeeks) as 1 | 2,
        durationMinutes: Number(durationMinutes),
        startsOn,
        endsOn: endsOn || null,
      });
      toast.success('Recurring review scheduled — invites are on their way');
      setTitle('');
      await load();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not create the schedule'));
    } finally {
      setCreating(false);
    }
  };

  const cancel = async (s: ReviewSchedule) => {
    const ok = await confirm({
      title: 'Cancel this recurring review?',
      description: `New occurrences of "${s.title || `${clanName(s.clanId)} cohort review`}" will stop. Upcoming, not-yet-started sessions are removed; past ones stay.`,
      variant: 'danger',
      confirmLabel: 'Cancel schedule',
    });
    if (!ok) return;
    try {
      setBusyId(s.id);
      await mentorApi.cancelReviewSchedule(s.id);
      setSchedules((prev) => prev.map((x) => (x.id === s.id ? { ...x, active: false } : x)));
      toast.success('Schedule cancelled');
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not cancel the schedule'));
    } finally {
      setBusyId(null);
    }
  };

  const active = schedules.filter((s) => s.active);
  const multiClan = clans.length >= 2;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Recurring reviews"
      subtitle="Schedule a review that repeats — everyone gets a calendar invite and reminders."
      width="md"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm hover:bg-slate-50">Close</button>
          <button
            onClick={submit}
            disabled={creating}
            className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-60 inline-flex items-center gap-1.5"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Schedule review
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Existing schedules */}
        <div>
          <h3 className="text-sm font-semibold text-slate-900 mb-2">Active schedules</h3>
          {loading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-brand-600" /></div>
          ) : active.length === 0 ? (
            <p className="text-sm text-slate-500 bg-slate-50 dark:bg-slate-800/40 rounded-xl px-4 py-3">No recurring reviews yet. Set one up below.</p>
          ) : (
            <ul className="space-y-2">
              {active.map((s) => (
                <li key={s.id} className="rounded-xl border border-slate-200 px-4 py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900 truncate">{s.title || `${clanName(s.clanId)} cohort review`}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                      {multiClan && <span>{clanName(s.clanId)}</span>}
                      <span className="inline-flex items-center gap-1"><Repeat className="w-3 h-3" />{s.intervalWeeks === 2 ? 'Biweekly' : 'Weekly'}</span>
                      <span className="inline-flex items-center gap-1"><CalendarClock className="w-3 h-3" />{DAYS[s.dayOfWeek]}s</span>
                      <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{to12h(s.timeLocal)} · {s.durationMinutes}m</span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-400">{s.timezone}{s.endsOn ? ` · until ${s.endsOn}` : ''}</div>
                  </div>
                  <button
                    onClick={() => cancel(s)}
                    disabled={busyId === s.id}
                    className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50"
                    title="Cancel this recurring review"
                  >
                    {busyId === s.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Create form */}
        <div className="border-t border-slate-200 pt-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900">New recurring review</h3>

          {multiClan && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Clan</label>
              <SelectMenu
                value={clanId}
                onChange={setClanId}
                options={clans.map((c) => ({ value: c.id, label: c.name }))}
                placeholder="Pick a clan"
                ariaLabel="Clan"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Title <span className="text-slate-400 font-normal">(optional)</span></label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={`${clanName(clanId)} cohort review`}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Day</label>
              <SelectMenu value={dayOfWeek} onChange={setDayOfWeek} options={DAY_OPTIONS} ariaLabel="Day of week" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Time</label>
              <input
                type="time"
                value={timeLocal}
                onChange={(e) => setTimeLocal(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Repeats</label>
              <SelectMenu value={intervalWeeks} onChange={setIntervalWeeks} options={INTERVAL_OPTIONS} ariaLabel="Cadence" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Duration</label>
              <SelectMenu value={durationMinutes} onChange={setDurationMinutes} options={DURATION_OPTIONS} ariaLabel="Duration" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Starts on</label>
              <input
                type="date"
                value={startsOn}
                min={todayLocal()}
                onChange={(e) => setStartsOn(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Ends on <span className="text-slate-400 font-normal">(optional)</span></label>
              <input
                type="date"
                value={endsOn}
                min={startsOn}
                onChange={(e) => setEndsOn(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>

          <p className="text-xs text-slate-400 inline-flex items-center gap-1">
            <Clock className="w-3 h-3" /> Times are in your timezone ({tz}). Each person sees the invite in their own.
          </p>
        </div>
      </div>
    </Drawer>
  );
}

export default ReviewScheduleDrawer;
