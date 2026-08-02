'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, CalendarRange, Users, Clock, Video, Percent, X } from 'lucide-react';
import { PageHeader } from '@/components/admin/ui';
import { SelectMenu } from '@/components/shared/SelectMenu';
import { Drawer } from '@/components/shared/Drawer';
import { Avatar } from '@/components/shared/Avatar';
import { adminApi } from '@/lib/services/admin-api';
import { clanApi } from '@/lib/services/clan-api';
import { mentorApi } from '@/lib/services/mentor-api';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface SessionRow {
  id: string; sessionDate: string; scheduledAt: string | null; title: string | null;
  status: string; recurring: boolean; clanId: string | null; clanName: string | null;
  mentorId: string | null; mentorName: string | null;
  present: number; absent: number; excused: number; reviewed: number; total: number;
  talkSeconds: number; hadVideo: boolean; durationMin: number | null;
}
interface GroupRow {
  key: string; label: string; sessions: number; present: number; absent: number;
  excused: number; marked: number; talkSeconds: number; withVideo: number; attendanceRate: number;
}
interface Summary {
  sessions: number; present: number; absent: number; excused: number; reviewed: number;
  marked: number; talkSeconds: number; withVideo: number; attendanceRate: number;
}

const fmtDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const fmtMin = (secs: number) => {
  const m = Math.round(secs / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="bg-card rounded-2xl border border-slate-200 p-4">
      <div className="flex items-center gap-2 text-slate-500 text-xs font-medium">{icon}{label}</div>
      <div className="mt-1.5 text-2xl font-bold text-slate-900">{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function AttendanceBar({ present, absent, excused }: { present: number; absent: number; excused: number }) {
  const total = present + absent + excused || 1;
  return (
    <div className="flex h-2 w-28 rounded-full overflow-hidden bg-slate-100">
      <div className="bg-emerald-500" style={{ width: `${(present / total) * 100}%` }} />
      <div className="bg-red-400" style={{ width: `${(absent / total) * 100}%` }} />
      <div className="bg-amber-400" style={{ width: `${(excused / total) * 100}%` }} />
    </div>
  );
}

export default function AdminReviewRecords() {
  const [clans, setClans] = useState<{ id: string; name: string }[]>([]);
  const [mentors, setMentors] = useState<{ id: string; name: string }[]>([]);
  const [clanId, setClanId] = useState('');
  const [mentorId, setMentorId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [byClan, setByClan] = useState<GroupRow[]>([]);
  const [byMentor, setByMentor] = useState<GroupRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);

  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Filter option lists.
  useEffect(() => {
    clanApi.list().then((r: any) => setClans(((r.data?.clans) || r.data || []).map((c: any) => ({ id: c.id, name: c.name })))).catch(() => setClans([]));
    mentorApi.getAll().then((r: any) => {
      const list = (r.data?.mentors || r.data || []) as any[];
      setMentors(list.map((m) => ({ id: m.id, name: `${m.firstName || ''} ${m.lastName || ''}`.trim() || m.name || m.email })));
    }).catch(() => setMentors([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r: any = await adminApi.reviewRecords.list({ clanId: clanId || undefined, mentorId: mentorId || undefined, from: from || undefined, to: to || undefined });
      const d = r?.data ?? {};
      setSummary(d.summary ?? null);
      setByClan(d.byClan ?? []);
      setByMentor(d.byMentor ?? []);
      setSessions(d.sessions ?? []);
    } catch {
      setSummary(null); setByClan([]); setByMentor([]); setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [clanId, mentorId, from, to]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (id: string) => {
    setDetail({ id }); setDetailLoading(true);
    try {
      const r: any = await adminApi.reviewRecords.detail(id);
      setDetail(r?.data?.session ?? null);
    } catch { setDetail(null); }
    finally { setDetailLoading(false); }
  };

  const clanOptions = useMemo(() => [{ value: '', label: 'All clans' }, ...clans.map((c) => ({ value: c.id, label: c.name }))], [clans]);
  const mentorOptions = useMemo(() => [{ value: '', label: 'All mentors' }, ...mentors.map((m) => ({ value: m.id, label: m.name }))], [mentors]);
  const hasFilters = clanId || mentorId || from || to;

  return (
    <div className="space-y-6">
      <PageHeader title="Review records" subtitle="Cohort-review attendance and participation across the org — clan-wise and mentor-wise" />

      {/* Filters */}
      <div className="bg-card rounded-2xl border border-slate-200 p-4 flex flex-wrap items-end gap-3">
        <div className="w-44">
          <label className="block text-xs font-medium text-slate-600 mb-1">Clan</label>
          <SelectMenu value={clanId} onChange={setClanId} options={clanOptions} ariaLabel="Filter by clan" />
        </div>
        <div className="w-44">
          <label className="block text-xs font-medium text-slate-600 mb-1">Mentor</label>
          <SelectMenu value={mentorId} onChange={setMentorId} options={mentorOptions} ariaLabel="Filter by mentor" searchable />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
        {hasFilters && (
          <button onClick={() => { setClanId(''); setMentorId(''); setFrom(''); setTo(''); }} className="px-3 py-2 rounded-lg text-slate-500 text-sm hover:bg-slate-50 inline-flex items-center gap-1"><X className="w-4 h-4" />Clear</button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-brand-600" /></div>
      ) : !summary || summary.sessions === 0 ? (
        <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center">
          <p className="text-slate-600">No review records{hasFilters ? ' for these filters' : ' yet'}.</p>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat icon={<CalendarRange className="w-4 h-4" />} label="Sessions" value={String(summary.sessions)} sub={`${summary.withVideo} with live video`} />
            <Stat icon={<Percent className="w-4 h-4" />} label="Attendance" value={`${summary.attendanceRate}%`} sub={`${summary.present} present · ${summary.absent} absent · ${summary.excused} excused`} />
            <Stat icon={<Users className="w-4 h-4" />} label="Mentees reviewed" value={String(summary.reviewed)} />
            <Stat icon={<Clock className="w-4 h-4" />} label="Talk time" value={fmtMin(summary.talkSeconds)} sub="total across sessions" />
          </div>

          {/* Breakdowns */}
          <div className="grid lg:grid-cols-2 gap-6">
            <GroupTable title="By clan" rows={byClan} />
            <GroupTable title="By mentor" rows={byMentor} />
          </div>

          {/* Sessions */}
          <div className="bg-card rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100"><h3 className="text-sm font-semibold text-slate-900">Sessions ({sessions.length})</h3></div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                    <th className="px-5 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Clan</th>
                    <th className="px-3 py-2 font-medium">Mentor</th>
                    <th className="px-3 py-2 font-medium">Attendance</th>
                    <th className="px-3 py-2 font-medium">Reviewed</th>
                    <th className="px-3 py-2 font-medium">Video</th>
                    <th className="px-3 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => (
                    <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50/60 cursor-pointer" onClick={() => openDetail(s.id)}>
                      <td className="px-5 py-2.5 whitespace-nowrap">
                        <span className="text-slate-800">{fmtDate(s.sessionDate)}</span>
                        {s.recurring && <span className="ml-1.5 text-[10px] text-brand-600 bg-brand-50 rounded px-1 py-0.5 align-middle">recurring</span>}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{s.clanName || '—'}</td>
                      <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{s.mentorName || '—'}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <AttendanceBar present={s.present} absent={s.absent} excused={s.excused} />
                          <span className="text-xs text-slate-500 whitespace-nowrap">{s.present}/{s.present + s.absent + s.excused || '—'}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">{s.reviewed}/{s.total}</td>
                      <td className="px-3 py-2.5">
                        {s.hadVideo ? <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><Video className="w-3.5 h-3.5" />{s.durationMin != null ? `${s.durationMin}m` : 'yes'}</span> : <span className="text-xs text-slate-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right text-xs text-brand-600">View</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Session detail */}
      <Drawer open={!!detail} onClose={() => setDetail(null)} width="md" title="Review session" subtitle={detail?.sessionDate ? `${detail.clanName || 'Clan'} · ${fmtDate(detail.sessionDate)}` : ''}>
        {detailLoading || !detail?.entries ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-brand-600" /></div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="px-2 py-1 rounded-lg bg-slate-100 text-slate-600">{detail.mentorName || 'Mentor'}</span>
              <span className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700">{detail.present} present</span>
              <span className="px-2 py-1 rounded-lg bg-red-50 text-red-700">{detail.absent} absent</span>
              <span className="px-2 py-1 rounded-lg bg-amber-50 text-amber-700">{detail.excused} excused</span>
              {detail.hadVideo && <span className="px-2 py-1 rounded-lg bg-sky-50 text-sky-700 inline-flex items-center gap-1"><Video className="w-3 h-3" />{detail.durationMin != null ? `${detail.durationMin}m` : 'live'}</span>}
            </div>
            {detail.note && <p className="text-sm text-slate-600 bg-slate-50 rounded-lg px-3 py-2">{detail.note}</p>}
            <ul className="divide-y divide-slate-100">
              {detail.entries.map((e: any) => (
                <li key={e.menteeId} className="py-2.5 flex items-center gap-3">
                  <Avatar name={e.menteeName} src={e.profilePictureUrl} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-slate-800 truncate">{e.menteeName}</div>
                    <div className="text-xs text-slate-400">
                      {e.talkSeconds ? `${fmtMin(e.talkSeconds)} talk` : 'no talk time'}{e.contributionPoints ? ` · +${e.contributionPoints} pts` : ''}
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${
                    e.attendance === 'present' ? 'bg-emerald-50 text-emerald-700'
                      : e.attendance === 'absent' ? 'bg-red-50 text-red-700'
                      : e.attendance === 'excused' ? 'bg-amber-50 text-amber-700'
                      : 'bg-slate-100 text-slate-500'
                  }`}>{e.attendance || 'unmarked'}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Drawer>
    </div>
  );
}

function GroupTable({ title, rows }: { title: string; rows: GroupRow[] }) {
  return (
    <div className="bg-card rounded-2xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100"><h3 className="text-sm font-semibold text-slate-900">{title}</h3></div>
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-slate-400">No data.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
              <th className="px-5 py-2 font-medium">{title.replace('By ', '')}</th>
              <th className="px-3 py-2 font-medium text-right">Sessions</th>
              <th className="px-3 py-2 font-medium text-right">Attendance</th>
              <th className="px-3 py-2 font-medium text-right">Talk</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((g) => (
              <tr key={g.key} className="border-b border-slate-50">
                <td className="px-5 py-2.5 text-slate-800 truncate max-w-[180px]">{g.label}</td>
                <td className="px-3 py-2.5 text-right text-slate-600">{g.sessions}</td>
                <td className="px-3 py-2.5 text-right">
                  <span className={`font-medium ${g.attendanceRate >= 75 ? 'text-emerald-600' : g.attendanceRate >= 50 ? 'text-amber-600' : 'text-red-500'}`}>{g.attendanceRate}%</span>
                </td>
                <td className="px-3 py-2.5 text-right text-slate-500">{fmtMin(g.talkSeconds)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
