'use client';

import { Search, Loader2, Users, Clock, CalendarCheck, Flame } from 'lucide-react';
import { Avatar } from '@/components/shared/Avatar';
import { useEffect } from 'react';
import { useAdminActivity } from '@/lib/hooks/admin';
import { usePagination } from '@/lib/hooks/shared/usePagination';
import { TablePagination } from '@/components/shared/TablePagination';
import { formatDistanceToNow } from 'date-fns';

function fmt(minutes: number): string {
  if (!minutes) return '0m';
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function MiniBar({ sessions }: { sessions: { date: string; activeMinutes: number }[] }) {
  if (!sessions.length) return <span className="text-slate-300 text-xs">No data</span>;
  const max = Math.max(...sessions.map((s) => s.activeMinutes || 0), 1);
  return (
    <div className="flex items-end gap-0.5 h-6">
      {sessions.slice(-14).map((s) => (
        <div
          key={s.date}
          title={`${s.date}: ${fmt(s.activeMinutes)}`}
          className="w-2 rounded-t-sm bg-brand-400"
          style={{ height: `${Math.max(Math.round(((s.activeMinutes || 0) / max) * 100), 4)}%` }}
        />
      ))}
    </div>
  );
}

export default function AdminActivityPage() {
  const {
    overview,
    loading,
    days,
    setDays,
    search,
    setSearch,
    filtered,
  } = useAdminActivity();

  // Client-side pagination: the list is already loaded and filtered in-memory,
  // so we just page the displayed slice (606 mentees was rendering as one wall).
  const pagination = usePagination({ initialPage: 1, initialLimit: 25 });
  useEffect(() => { pagination.setTotal(filtered.length); }, [filtered.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { pagination.reset(); }, [search, days]); // eslint-disable-line react-hooks/exhaustive-deps
  const pageItems = filtered.slice((pagination.page - 1) * pagination.limit, pagination.page * pagination.limit);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-slate-900 font-semibold mb-1">Activity Overview</h1>
          <p className="text-slate-500 text-sm">Track daily hours, sessions, and engagement across all mentees</p>
        </div>
        <div className="flex gap-1">
          {[7, 14, 30].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                days === d
                  ? 'bg-brand-600 text-white'
                  : 'text-slate-500 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {loading && !overview ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-7 h-7 animate-spin text-brand-500" />
        </div>
      ) : (
        <>
          {/* Platform stats bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-slate-200 rounded-2xl overflow-hidden">
            {[
              {
                icon: Users,
                label: 'Active today',
                value: overview?.platform.activeToday ?? 0,
                color: 'text-brand-600 bg-brand-50',
              },
              {
                icon: CalendarCheck,
                label: `Active this ${days}d`,
                value: overview?.platform.activeThisWeek ?? 0,
                color: 'text-emerald-600 bg-emerald-50',
              },
              {
                icon: Clock,
                label: 'Avg daily / mentee',
                value: fmt(overview?.platform.avgDailyMinutesPerMentee ?? 0),
                color: 'text-blue-600 bg-blue-50',
              },
              {
                icon: Flame,
                label: 'Total mentees tracked',
                value: overview?.menteeStats.length ?? 0,
                color: 'text-orange-600 bg-orange-50',
              },
            ].map(({ icon: Icon, label, value, color }) => (
              <div key={label} className="bg-card px-5 py-4 flex items-center gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">{label}</p>
                  <p className="text-xl font-semibold text-slate-900">{value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Search + table */}
          <div className="bg-card rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search mentees…"
                  className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <span className="text-xs text-slate-400">{filtered.length} mentees</span>
            </div>

            {filtered.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-sm">No activity recorded for this period.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <th className="text-left px-5 py-3 font-medium text-slate-600">Mentee</th>
                      <th className="text-right px-4 py-3 font-medium text-slate-600">Today</th>
                      <th className="text-right px-4 py-3 font-medium text-slate-600">Total ({days}d)</th>
                      <th className="text-right px-4 py-3 font-medium text-slate-600">Avg / day</th>
                      <th className="text-right px-4 py-3 font-medium text-slate-600">Active days</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">Last seen</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">Trend ({days}d)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pageItems.map((m) => (
                      <tr key={m.user.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar name={`${m.user.firstName} ${m.user.lastName}`} src={m.user.profilePictureUrl} size="sm" href={`/admin/mentees/${m.user.id}`} />
                            <div>
                              <p className="font-medium text-slate-900">
                                {m.user.firstName} {m.user.lastName}
                              </p>
                              <p className="text-xs text-slate-400">{m.user.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-slate-800">
                          {fmt(m.todayActiveMinutes)}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-700">
                          {fmt(m.totalActiveMinutes)}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-700">
                          {fmt(m.avgDailyMinutes)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              m.activeDays === 0
                                ? 'bg-red-50 text-red-600'
                                : m.activeDays < days / 2
                                ? 'bg-amber-50 text-amber-600'
                                : 'bg-emerald-50 text-emerald-700'
                            }`}
                          >
                            {m.activeDays} / {days}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-xs">
                          {m.lastActiveDate
                            ? formatDistanceToNow(new Date(m.lastActiveDate + 'T00:00:00'), {
                                addSuffix: true,
                              })
                            : 'Never'}
                        </td>
                        <td className="px-4 py-3">
                          <MiniBar sessions={m.sessions} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {filtered.length > pagination.limit && (
              <div className="px-5 py-3 border-t border-slate-100">
                <TablePagination pagination={pagination} />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
