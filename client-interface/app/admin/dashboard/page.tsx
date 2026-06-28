'use client';

import Link from 'next/link';
import {
  Plus, Loader2, Users, Users2, AlertTriangle, Gauge, Clock,
  BookOpen, ArrowUpRight,
} from 'lucide-react';
import { StatsCard } from '@/components/admin/ui';
import { AnnouncementsCard } from '@/components/shared/AnnouncementsCard';
import { Avatar } from '@/components/shared/Avatar';
import {
  useClanHealth,
  type ClanHealthCard,
  type ProgramHealth,
  type ClanStatus,
} from '@/lib/hooks/admin';

const STATUS_META: Record<ClanStatus, { dot: string; border: string; chip: string; bar: string }> = {
  red:   { dot: 'bg-rose-500',    border: 'border-l-rose-400',    chip: 'bg-rose-50 text-rose-700 border-rose-200',       bar: 'bg-rose-500' },
  amber: { dot: 'bg-amber-500',   border: 'border-l-amber-400',   chip: 'bg-amber-50 text-amber-700 border-amber-200',    bar: 'bg-amber-500' },
  green: { dot: 'bg-emerald-500', border: 'border-l-emerald-400', chip: 'bg-emerald-50 text-emerald-700 border-emerald-200', bar: 'bg-emerald-500' },
};

function ClanCard({ clan }: { clan: ClanHealthCard }) {
  const meta = STATUS_META[clan.status];
  return (
    <Link
      href={`/admin/clans?clan=${clan.id}`}
      className={`group block rounded-2xl border border-slate-200 border-l-4 ${meta.border} bg-card p-5 hover:shadow-sm hover:border-brand-300 transition-all`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-slate-900 truncate">{clan.name}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {clan.leadMentor?.name ? `Led by ${clan.leadMentor.name}` : 'No lead mentor'}
            {clan.mentorCount > 1 ? ` · ${clan.mentorCount} mentors` : ''}
          </p>
        </div>
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-medium shrink-0 ${meta.chip}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
          {clan.statusLabel}
        </span>
      </div>

      {/* Completion bar */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
          <span>Avg completion</span>
          <span className="font-medium text-slate-700">{clan.avgCompletion}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
          <div className={`h-full rounded-full ${meta.bar}`} style={{ width: `${clan.avgCompletion}%` }} />
        </div>
      </div>

      {/* Metric grid */}
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-slate-50 py-2">
          <p className="text-sm font-semibold text-slate-900">{clan.memberCount}</p>
          <p className="text-[11px] text-slate-500">mentees</p>
        </div>
        <div className="rounded-lg bg-slate-50 py-2">
          <p className="text-sm font-semibold text-slate-900">{clan.avgOnTime}%</p>
          <p className="text-[11px] text-slate-500">on-time</p>
        </div>
        <div className={`rounded-lg py-2 ${clan.atRisk > 0 ? 'bg-rose-50 dark:bg-rose-500/10' : 'bg-slate-50'}`}>
          <p className={`text-sm font-semibold ${clan.atRisk > 0 ? 'text-rose-700 dark:text-rose-300' : 'text-slate-900'}`}>{clan.atRisk}</p>
          <p className="text-[11px] text-slate-500">at risk</p>
        </div>
      </div>

      <p className="mt-3 text-xs text-slate-500">{clan.statusReason}</p>
    </Link>
  );
}

function ProgramGroup({ program }: { program: ProgramHealth }) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
            <BookOpen className="w-4 h-4 text-brand-600" />
          </div>
          <div className="min-w-0">
            <h2 className="text-slate-900 font-medium truncate">{program.name}</h2>
            <p className="text-xs text-slate-500">
              {program.clanCount} clan{program.clanCount === 1 ? '' : 's'} · {program.memberCount} mentee{program.memberCount === 1 ? '' : 's'}
              {program.atRisk > 0 ? (
                <span className="text-rose-600"> · {program.atRisk} at risk</span>
              ) : ''}
            </p>
          </div>
        </div>
        <Link
          href={program.id === 'unassigned' ? '/admin/clans' : `/admin/programs/${program.id}`}
          className="text-sm text-brand-600 hover:text-brand-700 flex items-center gap-1 shrink-0"
        >
          View <ArrowUpRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {program.clans.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-card py-8 text-center text-sm text-slate-500">
          No clans in this program yet.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {program.clans.map((c) => <ClanCard key={c.id} clan={c} />)}
        </div>
      )}
    </section>
  );
}

export default function AdminDashboardPage() {
  const { kpis, programs, atRiskMentees, loading, error, refetch } = useClanHealth();

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-slate-900 font-semibold mb-2">Clan health</h1>
          <p className="text-slate-600">How every clan is tracking, program by program.</p>
        </div>
        <Link href="/admin/programs/list?create=1">
          <button className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-5 py-2.5 rounded-xl transition-colors">
            <Plus className="w-4 h-4" />
            Create program
          </button>
        </Link>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <StatsCard icon={Users} label="Active mentees" value={kpis?.activeMentees ?? '…'} colorClass="text-brand-600 bg-brand-50" />
        <StatsCard icon={Gauge} label="Avg completion" value={kpis ? `${kpis.avgCompletion}%` : '…'} colorClass="text-emerald-600 bg-emerald-50" />
        <StatsCard icon={Clock} label="Avg on-time" value={kpis ? `${kpis.avgOnTime}%` : '…'} colorClass="text-sky-600 bg-sky-50" />
        <StatsCard icon={AlertTriangle} label="At risk" value={kpis?.atRisk ?? '…'} colorClass="text-rose-600 bg-rose-50" />
      </div>

      <AnnouncementsCard href="/admin/announcements" />

      {/* Org-wide at-risk rollup */}
      {atRiskMentees.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-card">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-500" />
            <h2 className="text-slate-900 font-medium">Needs attention</h2>
            <span className="text-xs text-slate-500">({atRiskMentees.length})</span>
          </div>
          <div className="divide-y divide-slate-100">
            {atRiskMentees.map((m) => (
              <div key={m.id} className="flex items-center gap-3 px-6 py-3">
                <Avatar name={m.name} src={m.avatarUrl} initials={m.avatar} size="md" href={`/admin/mentees/${m.id}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 truncate">{m.name}</p>
                  <p className="text-xs text-slate-500 truncate">{m.program} · {m.riskReason}</p>
                </div>
                <span className={`hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-medium ${
                  m.risk === 'high' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}>
                  {m.risk === 'high' ? 'At risk' : 'Watch'}
                </span>
                <span className="text-xs text-slate-500 w-12 text-right shrink-0">{m.absoluteProgress}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Programs → clans */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
        </div>
      ) : error ? (
        <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center">
          <p className="text-slate-600 mb-3">{error}</p>
          <button onClick={refetch} className="text-brand-600 hover:text-brand-700 text-sm font-medium">Try again</button>
        </div>
      ) : programs.length === 0 ? (
        <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center">
          <Users2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600">No clans yet - create a program and form clans to see their health here.</p>
          <Link href="/admin/clans" className="mt-3 inline-block text-brand-600 hover:text-brand-700 text-sm font-medium">
            Go to Clans
          </Link>
        </div>
      ) : (
        <div className="space-y-10">
          {programs.map((p) => <ProgramGroup key={p.id} program={p} />)}
        </div>
      )}
    </div>
  );
}
