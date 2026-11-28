'use client';

import { use, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ChevronRight, GraduationCap, LayoutGrid, ListOrdered, Settings2, SlidersHorizontal, Target, UsersRound, Waypoints } from 'lucide-react';
import { TabBar } from '@/components/admin/ui';
import { Drawer } from '@/components/shared/Drawer';
import { ClanAvatar } from '@/components/shared/ClanAvatar';
import { qk, useApiQuery, useInvalidate } from '@/lib/query';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { workspacePath } from '@/lib/services/workspace-scope';
import { roundApi } from '@/lib/services/round-api';
import { Chip, ErrorNote, Spinner, fmtDate, secondaryBtn } from '@/components/admin/pools/poolUi';
import { SelectionTab } from '@/components/admin/pools/SelectionTab';
import { RoundOverview } from '@/components/admin/rounds/RoundOverview';
import { RoundCandidates } from '@/components/admin/rounds/RoundCandidates';
import { RoundLevelWork } from '@/components/admin/rounds/RoundLevelWork';
import { RoundSettings } from '@/components/admin/rounds/RoundSettings';

/**
 * A selection round that is a clan.
 *
 * Deliberately the same screen as a pool: the same header, the same three
 * tabs, the same Manage drawer, and literally the same Selection tab — which
 * takes the round and an api rather than a pool, so there is one ranking
 * screen rather than two that must be kept in step.
 *
 * What is NOT here is everything a clan already does. The roster, the chat,
 * the work and reviewing it are the clan's own screens, reached from
 * Candidates. Rebuilding them here is exactly what making a round a clan was
 * meant to stop.
 */

const TABS = [
  { key: 'overview', label: 'Overview', icon: LayoutGrid },
  { key: 'candidates', label: 'Candidates', icon: UsersRound },
  { key: 'selection', label: 'Selection', icon: ListOrdered },
];

type ManagePanel = 'root' | 'work' | 'settings';

export default function RoundDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const invalidate = useInvalidate();
  const { can } = usePermissions();

  const [manage, setManage] = useState<ManagePanel | null>(null);

  const { data, loading, error, refetch } = useApiQuery({
    queryKey: qk.round.detail(id),
    queryFn: () => roundApi.get(id),
    errorMessage: 'Could not load this round',
  });

  const raw = search.get('tab') || 'overview';
  const tab = TABS.some((t) => t.key === raw) ? raw : 'overview';
  const go = (key: string) => router.replace(`${pathname}?tab=${key}`, { scroll: false });

  const reload = async () => {
    await refetch();
    invalidate(qk.round.all);
  };

  const tabs = useMemo(() => TABS.map((t) => ({
    id: t.key,
    label: t.label,
    icon: t.icon,
    count: t.key === 'candidates' && data
      ? (data.awaitingReview || data.candidates.length)
      : undefined,
  })), [data]);

  if (loading && !data) return <Spinner />;
  if (error || !data) return <ErrorNote>{error || 'Round not found'}</ErrorNote>;

  const { round, candidates } = data;
  const closed = round.status === 'archived' || Boolean(round.frozenAt);
  const canManage = can('pool.manage');
  const canAssign = can('pool.assign');
  const canSelect = can('pool.select');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <Link href={workspacePath('/admin/pools')} className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 transition-colors hover:text-brand-700">
            <ArrowLeft className="h-3.5 w-3.5" /> Selection pools
          </Link>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2.5">
            <ClanAvatar name={round.name} src={round.avatarUrl} size="md" />
            <h1 className="truncate text-2xl! font-semibold! leading-tight! text-slate-900">{round.name}</h1>
            {/* A round is a clan, and saying so is the point — somebody
                looking for its chat or its roster knows where to go. */}
            <Chip cls="bg-brand-50 text-brand-700 border-brand-200">Selection round</Chip>
            {closed && <Chip cls="bg-slate-100 text-slate-500 border-slate-200">{round.frozenAt ? 'Frozen' : 'Archived'}</Chip>}
          </div>
        </div>
        <button onClick={() => setManage('root')} className={`${secondaryBtn} shrink-0`} aria-haspopup="dialog">
          <SlidersHorizontal className="h-4 w-4" /> Manage round
        </button>
      </div>

      {manage && (
        <Drawer
          open
          onClose={() => setManage(null)}
          title={manage === 'work' ? 'Work by level' : manage === 'settings' ? 'Settings' : 'Manage round'}
          subtitle={round.name}
          width={manage === 'root' ? 'md' : 'lg'}
        >
          {manage !== 'root' && (
            <button onClick={() => setManage('root')} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:text-brand-800">
              <ArrowLeft className="h-4 w-4" /> Manage round
            </button>
          )}

          {manage === 'work' && <RoundLevelWork data={data} onChange={reload} canAssign={canAssign} />}
          {manage === 'settings' && <RoundSettings data={data} onChange={reload} canManage={canManage} />}

          {manage === 'root' && (
            <div className="space-y-6">
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">About</h3>
                <div className="mt-2 rounded-xl border border-border p-4">
                  {round.description && <p className="text-sm text-slate-700">{round.description}</p>}
                  <dl className={`space-y-2.5 text-sm ${round.description ? 'mt-3 border-t border-border pt-3' : ''}`}>
                    {([
                      [GraduationCap, 'Intake', round.cohort?.name || 'Not attached'],
                      [Target, 'Selects', `${round.settings.quota}${round.settings.waitlistSize ? ` · ${round.settings.waitlistSize} waitlisted` : ''}`],
                      [Waypoints, 'Levels with work', String(round.levelRules.length)],
                      [UsersRound, 'Deadline', fmtDate(round.settings.qualificationDueAt)],
                    ] as const).map(([Icon, text, value]) => (
                      <div key={text} className="flex items-center justify-between gap-3">
                        <dt className="inline-flex items-center gap-2 text-slate-500"><Icon className="h-4 w-4" />{text}</dt>
                        <dd className="truncate font-medium text-slate-800">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </section>

              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Set up</h3>
                <div className="mt-2 divide-y divide-border overflow-hidden rounded-xl border border-border">
                  {([
                    ['work', Waypoints, 'Work by level', 'What each level does, handed out the moment somebody joins'],
                    ['settings', Settings2, 'Settings', 'Places, what work is worth, the intake and where people are placed'],
                  ] as const).map(([key, Icon, text, hint]) => (
                    <button key={key} onClick={() => setManage(key)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted">
                      <span className="rounded-lg bg-muted p-2 text-slate-600"><Icon className="h-4 w-4" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-slate-800">{text}</span>
                        <span className="block text-xs text-muted-foreground">{hint}</span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                    </button>
                  ))}
                </div>
              </section>

              {/* The clan half. Not rebuilt here — pointed at. */}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">The clan</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  A round is a clan, so its mentors, its roster and its group chat are the clan&apos;s own screens, and
                  work handed in here is reviewed in the ordinary review queue.
                </p>
                <Link
                  href={workspacePath(`/admin/clans?clan=${round.id}`)}
                  className="mt-3 flex w-full items-center gap-3 rounded-xl border border-border px-4 py-3 text-left transition-colors hover:bg-muted"
                >
                  <span className="rounded-lg bg-muted p-2 text-slate-600"><UsersRound className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-slate-800">Open the clan</span>
                    <span className="block text-xs text-muted-foreground">Mentors, members and the group chat</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                </Link>
              </section>
            </div>
          )}
        </Drawer>
      )}

      <TabBar
        tabs={tabs}
        activeTab={tab}
        onChange={go}
        className="overflow-x-auto *:shrink-0 *:whitespace-nowrap"
      />

      {tab === 'overview' && (
        <RoundOverview
          data={data}
          onGo={go}
          onManage={(p) => setManage(p === 'intake' ? 'settings' : p)}
        />
      )}
      {tab === 'candidates' && <RoundCandidates data={data} onChange={reload} canAssign={canAssign} canReview={can('pool.review')} />}
      {tab === 'selection' && (
        <SelectionTab
          round={{
            id: round.id,
            scope: 'rounds',
            quota: round.settings.quota,
            closed,
            members: candidates.map((c) => ({
              id: c.memberId,
              placementStatus: c.placementStatus,
              placedClan: c.placedClan,
            })),
            workHint: 'Set the work for each level from Manage round.',
          }}
          api={roundApi}
          onChange={reload}
          canSelect={canSelect}
          canPlace={canSelect}
        />
      )}
    </div>
  );
}
