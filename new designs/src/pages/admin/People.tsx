import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  ArrowUpRight,
  MapPin,
  Clock,
  Flag,
  Users,
} from 'lucide-react';
import { Page, PageHeader } from '@/components/Page';
import { useStore } from '@/store/AppStore';
import { DualProgress } from '@/components/DualProgress';
import {
  Avatar,
  Badge,
  Card,
  MomentumIcon,
  RISK_META,
  RiskDot,
  cx,
} from '@/lib/ui';
import type { Mentee, Risk } from '@/lib/types';

/* ----------------------------------------------------------------
   risk filter chips
----------------------------------------------------------------- */
type RiskFilter = 'all' | Risk;

const RISK_FILTERS: { key: RiskFilter; label: string }[] = [
  { key: 'all', label: 'Everyone' },
  { key: 'low', label: 'On track' },
  { key: 'watch', label: 'Watch' },
  { key: 'high', label: 'At risk' },
];

type Segment = 'mentees' | 'mentors';

const SEGMENTS: { key: Segment; label: string }[] = [
  { key: 'mentees', label: 'Mentees' },
  { key: 'mentors', label: 'Mentors' },
];

export function People() {
  const navigate = useNavigate();
  const { mentees, mentor } = useStore();
  const [segment, setSegment] = useState<Segment>('mentees');
  const [query, setQuery] = useState('');
  const [risk, setRisk] = useState<RiskFilter>('all');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return mentees.filter((m) => {
      if (risk !== 'all' && m.risk !== risk) return false;
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.program.toLowerCase().includes(q) ||
        m.location.toLowerCase().includes(q)
      );
    });
  }, [mentees, query, risk]);

  // mentor roster - at least the current mentor, with a live load read.
  const mentorRows = useMemo(() => {
    const load = mentees.filter((m) => m.program === 'Full-Stack Web Development').length;
    return [{ ...mentor, load }];
  }, [mentees, mentor]);

  return (
    <Page>
      <PageHeader
        title="People"
        subtitle="Everyone across your programs"
      />

      {/* segment toggle - mentees | mentors */}
      <div className="mb-4 inline-flex rounded-r border border-hairline bg-white p-0.5">
        {SEGMENTS.map((s) => {
          const active = segment === s.key;
          return (
            <button
              key={s.key}
              onClick={() => setSegment(s.key)}
              className={cx(
                'rounded-r px-3.5 py-1.5 text-sm font-medium transition-colors',
                active ? 'bg-ink text-white' : 'text-ink-soft hover:text-ink',
              )}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      {segment === 'mentees' ? (
        <>
          {/* search + filters */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, program, location…"
                className="h-10 w-full rounded-r border border-neutral-200 bg-white pl-9 pr-3 text-sm text-ink placeholder:text-ink-faint focus:border-brand-300"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {RISK_FILTERS.map((f) => {
                const active = risk === f.key;
                return (
                  <button
                    key={f.key}
                    onClick={() => setRisk(f.key)}
                    className={cx(
                      'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                      active
                        ? 'bg-ink text-white'
                        : 'bg-white text-ink-soft ring-1 ring-neutral-200/70 hover:bg-neutral-50',
                    )}
                  >
                    {f.key !== 'all' && (
                      <span className={cx('h-2 w-2 rounded-full', RISK_META[f.key].dot)} />
                    )}
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4 text-xs text-ink-mute">
            Showing {filtered.length} of {mentees.length} mentees
          </div>

          {/* directory grid */}
          {filtered.length === 0 ? (
            <Card className="mt-4 grid place-items-center py-20 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-r bg-neutral-100 text-ink-faint">
                <Users className="h-6 w-6" />
              </span>
              <p className="mt-4 text-base font-medium text-ink">No one matches that search.</p>
              <p className="mt-1 text-sm text-ink-mute">
                Try a different name, program, or location.
              </p>
            </Card>
          ) : (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {filtered.map((m) => (
                <PersonCard
                  key={m.id}
                  m={m}
                  onOpen={() => navigate(`/admin/people/${m.id}`)}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="mb-4 text-xs text-ink-mute">
            {mentorRows.length} mentor{mentorRows.length > 1 ? 's' : ''} across your programs
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {mentorRows.map((mt) => (
              <MentorCard key={mt.avatar} m={mt} />
            ))}
          </div>
        </>
      )}
    </Page>
  );
}

/* ----------------------------------------------------------------
   one mentor card
----------------------------------------------------------------- */
function MentorCard({
  m,
}: {
  m: { name: string; avatar: string; role: string; program: string; maxMentees: number; load: number };
}) {
  return (
    <Card className="animate-slide-in p-5">
      <div className="flex items-start gap-3">
        <Avatar initials={m.avatar} name={m.name} size="lg" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold text-ink">{m.name}</h3>
          <div className="mt-0.5 truncate text-xs text-ink-mute">
            {m.role} · {m.program}
          </div>
        </div>
        <Badge tone={m.load >= m.maxMentees ? 'rose' : 'emerald'}>
          {m.load >= m.maxMentees ? 'At capacity' : 'Has room'}
        </Badge>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-neutral-100 pt-3 text-xs text-ink-mute">
        <span className="inline-flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5 text-ink-faint" />
          <span className="font-mono font-medium text-ink tnum">{m.load}</span>
          <span>of {m.maxMentees} mentees</span>
        </span>
        <span className="font-mono tnum text-ink-faint">
          {Math.round((m.load / m.maxMentees) * 100)}% load
        </span>
      </div>
    </Card>
  );
}

/* ----------------------------------------------------------------
   one person card
----------------------------------------------------------------- */
function PersonCard({ m, onOpen }: { m: Mentee; onOpen: () => void }) {
  const r = RISK_META[m.risk];

  return (
    <Card hover onClick={onOpen} className="animate-slide-in group p-5">
      <div className="flex items-start gap-3">
        <Avatar initials={m.avatar} name={m.name} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold text-ink">{m.name}</h3>
            <MomentumIcon momentum={m.momentum} />
          </div>
          <div className="mt-0.5 truncate text-xs text-ink-mute">
            {m.program} · {m.level} · Wk {m.week}/{m.totalWeeks}
          </div>
          <div className="mt-1 flex items-center gap-1 text-xs text-ink-faint">
            <MapPin className="h-3 w-3" />
            {m.location}
          </div>
        </div>
        <Badge tone={r.tone}>
          <RiskDot risk={m.risk} />
          {r.label}
        </Badge>
      </div>

      <div className="my-4">
        <DualProgress absolute={m.absoluteProgress} relative={m.relativeProgress} compact />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-neutral-100 pt-3 text-xs text-ink-mute">
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3.5 w-3.5 text-ink-faint" />
          {m.onTimeRate}% on-time
        </span>
        {m.openBlockers > 0 && (
          <span className="inline-flex items-center gap-1 text-rose-600">
            <Flag className="h-3.5 w-3.5" />
            {m.openBlockers} open blocker{m.openBlockers > 1 ? 's' : ''}
          </span>
        )}
        <span className="text-ink-faint">Active {m.lastActive}</span>
        <span className="ml-auto inline-flex items-center gap-1 font-medium text-brand-600 opacity-0 transition-opacity group-hover:opacity-100">
          Open profile <ArrowUpRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </Card>
  );
}
