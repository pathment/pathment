'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Video, Plus, Play, Square, Trash2, Users, CalendarClock, Radio } from 'lucide-react';
import { PageHeader } from '@/components/admin/ui';
import { SelectMenu } from '@/components/shared/SelectMenu';
import { LiveMeetingOverlay } from '@/components/shared/LiveMeetingOverlay';
import { adminApi } from '@/lib/services/admin-api';
import { clanApi } from '@/lib/services/clan-api';
import { useConfirm } from '@/lib/context/ConfirmContext';
import { extractApiErrorMessage } from '@/lib/utils/api-error';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Meeting {
  id: string; title: string; description: string | null; scheduledAt: string;
  durationMinutes: number; audienceType: 'mentors' | 'clan' | 'both'; clanId: string | null;
  status: 'scheduled' | 'live' | 'ended' | 'cancelled';
  host?: { firstName?: string; lastName?: string } | null;
  clan?: { name?: string } | null;
}

const AUDIENCE_OPTIONS = [
  { value: 'mentors', label: 'All mentors' },
  { value: 'clan', label: 'A specific clan' },
  { value: 'both', label: 'All mentors + a clan' },
];
const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120].map((m) => ({ value: String(m), label: `${m} min` }));

const audienceLabel = (m: Meeting) =>
  m.audienceType === 'mentors' ? 'All mentors'
    : m.audienceType === 'clan' ? (m.clan?.name || 'Clan')
      : `All mentors + ${m.clan?.name || 'clan'}`;

const STATUS_PILL: Record<string, string> = {
  scheduled: 'bg-slate-100 text-slate-600',
  live: 'bg-red-50 text-red-700',
  ended: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-slate-100 text-slate-400',
};

const fmtWhen = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
// Combine a local date + time input into an ISO instant.
const toIso = (date: string, time: string) => (date && time ? new Date(`${date}T${time}`).toISOString() : '');

export default function AdminMeetings() {
  const confirm = useConfirm();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [clans, setClans] = useState<{ id: string; name: string }[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [hostingId, setHostingId] = useState<string | null>(null);

  // Create form.
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [audienceType, setAudienceType] = useState('mentors');
  const [clanId, setClanId] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('60');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r: any = await adminApi.meetings.list();
      setMeetings(r?.data?.meetings ?? []);
    } catch { setMeetings([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    clanApi.list().then((r: any) => setClans(((r.data?.clans) || r.data || []).map((c: any) => ({ id: c.id, name: c.name })))).catch(() => setClans([]));
  }, [load]);

  const needsClan = audienceType === 'clan' || audienceType === 'both';

  const create = async () => {
    if (!title.trim()) { toast.error('Add a title'); return; }
    if (!date || !time) { toast.error('Pick a date and time'); return; }
    if (needsClan && !clanId) { toast.error('Pick a clan for this audience'); return; }
    try {
      setCreating(true);
      await adminApi.meetings.create({
        title: title.trim(),
        description: description.trim() || undefined,
        scheduledAt: toIso(date, time),
        durationMinutes: Number(durationMinutes),
        audienceType: audienceType as 'mentors' | 'clan' | 'both',
        clanId: needsClan ? clanId : null,
      });
      toast.success('Meeting scheduled — invites are on their way');
      setTitle(''); setDescription(''); setDate(''); setTime('');
      await load();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not schedule the meeting'));
    } finally { setCreating(false); }
  };

  const start = async (m: Meeting) => {
    try {
      setBusyId(m.id);
      await adminApi.meetings.start(m.id);
      setMeetings((prev) => prev.map((x) => (x.id === m.id ? { ...x, status: 'live' } : x)));
      setHostingId(m.id); // drop the host straight into the room
    } catch (e) { toast.error(extractApiErrorMessage(e, 'Could not start the meeting')); }
    finally { setBusyId(null); }
  };

  const end = async (m: Meeting) => {
    if (!(await confirm({ title: 'End this meeting for everyone?', description: 'Attendees will be disconnected.', variant: 'danger', confirmLabel: 'End meeting' }))) return;
    try {
      setBusyId(m.id);
      await adminApi.meetings.end(m.id);
      setMeetings((prev) => prev.map((x) => (x.id === m.id ? { ...x, status: 'ended' } : x)));
      toast.success('Meeting ended');
    } catch (e) { toast.error(extractApiErrorMessage(e, 'Could not end the meeting')); }
    finally { setBusyId(null); }
  };

  const cancel = async (m: Meeting) => {
    if (!(await confirm({ title: 'Cancel this meeting?', description: `"${m.title}" will be cancelled${m.status === 'scheduled' ? '' : ' and ended'}.`, variant: 'danger', confirmLabel: 'Cancel meeting' }))) return;
    try {
      setBusyId(m.id);
      await adminApi.meetings.cancel(m.id);
      setMeetings((prev) => prev.filter((x) => x.id !== m.id));
      toast.success('Meeting cancelled');
    } catch (e) { toast.error(extractApiErrorMessage(e, 'Could not cancel the meeting')); }
    finally { setBusyId(null); }
  };

  const clanOptions = useMemo(() => clans.map((c) => ({ value: c.id, label: c.name })), [clans]);
  const upcoming = meetings.filter((m) => m.status === 'scheduled' || m.status === 'live');
  const past = meetings.filter((m) => m.status === 'ended');

  return (
    <div className="space-y-6">
      <PageHeader title="Live meetings" subtitle="Host an org broadcast — pick who's invited, and they get a calendar invite plus a live join banner" />

      {/* Create */}
      <div className="bg-card rounded-2xl border border-slate-200 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-slate-900 inline-flex items-center gap-1.5"><Plus className="w-4 h-4" />Schedule a meeting</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1">Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Monthly all-hands" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1">Description <span className="text-slate-400 font-normal">(optional)</span></label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="What's this about?" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-card resize-none focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Audience</label>
            <SelectMenu value={audienceType} onChange={setAudienceType} options={AUDIENCE_OPTIONS} ariaLabel="Audience" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Clan {needsClan ? '' : <span className="text-slate-400 font-normal">(n/a)</span>}</label>
            <SelectMenu value={clanId} onChange={setClanId} options={clanOptions} placeholder={needsClan ? 'Pick a clan' : 'Not needed'} ariaLabel="Clan" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Time</label>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Duration</label>
              <SelectMenu value={durationMinutes} onChange={setDurationMinutes} options={DURATION_OPTIONS} ariaLabel="Duration" />
            </div>
          </div>
        </div>
        <div className="flex justify-end">
          <button onClick={create} disabled={creating} className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-60 inline-flex items-center gap-1.5">
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarClock className="w-4 h-4" />}Schedule & invite
          </button>
        </div>
      </div>

      {/* Lists */}
      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-brand-600" /></div>
      ) : (
        <>
          <MeetingList title="Upcoming & live" rows={upcoming} empty="No upcoming meetings." busyId={busyId}
            renderActions={(m) => (
              <>
                {m.status === 'live' ? (
                  <>
                    <button onClick={() => setHostingId(m.id)} className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 inline-flex items-center gap-1"><Radio className="w-3.5 h-3.5" />Join</button>
                    <button onClick={() => end(m)} disabled={busyId === m.id} className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 text-xs hover:bg-slate-50 inline-flex items-center gap-1"><Square className="w-3.5 h-3.5" />End</button>
                  </>
                ) : (
                  <button onClick={() => start(m)} disabled={busyId === m.id} className="px-3 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-medium hover:bg-brand-700 inline-flex items-center gap-1"><Play className="w-3.5 h-3.5" />Start</button>
                )}
                <button onClick={() => cancel(m)} disabled={busyId === m.id} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50" title="Cancel"><Trash2 className="w-4 h-4" /></button>
              </>
            )}
          />
          {past.length > 0 && <MeetingList title="Past" rows={past} empty="" busyId={busyId} renderActions={() => null} />}
        </>
      )}

      {hostingId && <LiveMeetingOverlay meetingId={hostingId} onClose={() => setHostingId(null)} />}
    </div>
  );
}

function MeetingList({ title, rows, empty, busyId, renderActions }: {
  title: string; rows: Meeting[]; empty: string; busyId: string | null; renderActions: (m: Meeting) => React.ReactNode;
}) {
  return (
    <div className="bg-card rounded-2xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100"><h3 className="text-sm font-semibold text-slate-900">{title}</h3></div>
      {rows.length === 0 ? (
        empty ? <p className="px-5 py-6 text-sm text-slate-400">{empty}</p> : null
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((m) => (
            <li key={m.id} className="px-5 py-3 flex items-center gap-3">
              <span className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0"><Video className="w-4.5 h-4.5 text-slate-500" /></span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-900 truncate">{m.title}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full capitalize ${STATUS_PILL[m.status]}`}>{m.status}</span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1"><CalendarClock className="w-3 h-3" />{fmtWhen(m.scheduledAt)} · {m.durationMinutes}m</span>
                  <span className="inline-flex items-center gap-1"><Users className="w-3 h-3" />{audienceLabel(m)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">{renderActions(m)}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
