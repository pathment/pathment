'use client';

import { use, useMemo, useState } from 'react';
import Link from 'next/link';
import { workspacePath } from '@/lib/services/workspace-scope';
import { ClanAvatar } from '@/components/shared/ClanAvatar';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Archive, ArrowLeft, CalendarClock, ChevronRight, GraduationCap, History, LayoutGrid, ListOrdered, Lock, Settings2, SlidersHorizontal, Target, UsersRound } from 'lucide-react';
import { TabBar } from '@/components/admin/ui';
import { Drawer } from '@/components/shared/Drawer';
import { useApiQuery, useInvalidate } from '@/lib/query';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { useConfirm } from '@/lib/context/ConfirmContext';
import { poolApi, type PoolStatus } from '@/lib/services/pool-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { Chip, ErrorNote, POOL_STATUS, Spinner, fmtDate, secondaryBtn } from '@/components/admin/pools/poolUi';
import { OverviewTab } from '@/components/admin/pools/OverviewTab';
import { CandidatesTab } from '@/components/admin/pools/CandidatesTab';
import { WorkTab } from '@/components/admin/pools/WorkTab';
import { SelectionTab } from '@/components/admin/pools/SelectionTab';
import { SettingsTab } from '@/components/admin/pools/SettingsTab';
import { HistoryTab } from '@/components/admin/pools/HistoryTab';

// Where a pool may go next — mirrors the server's transition table.
const NEXT: Record<PoolStatus, { to: string; label: string }[]> = {
  draft: [{ to: 'open', label: 'Open the pool' }],
  open: [{ to: 'qualifying', label: 'Start qualifying' }, { to: 'reviewing', label: 'Move to reviewing' }],
  qualifying: [{ to: 'reviewing', label: 'Move to reviewing' }],
  reviewing: [{ to: 'qualifying', label: 'Back to qualifying' }, { to: 'placing', label: 'Move to placing' }],
  placing: [{ to: 'reviewing', label: 'Back to reviewing' }],
  closed: [],
};

// What each stage means, in a line, for the Manage pool drawer.
const STAGE_TEXT: Record<PoolStatus, string> = {
  draft: 'Being set up. Candidates cannot see it yet.',
  open: 'Candidates can be added and invited.',
  qualifying: 'Candidates are doing the work.',
  reviewing: 'Work is being reviewed and scored, ready for the shortlist.',
  placing: 'Selected candidates are being placed in clans.',
  closed: 'The round is over. Nothing more can change.',
};

export default function PoolDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const confirm = useConfirm();
  const invalidate = useInvalidate();
  const { can } = usePermissions();
  /**
   * The Manage pool drawer, and which panel of it is showing.
   *
   * Settings used to be a page you left the pool for, which is a strange
   * amount of ceremony for changing a date. It is a form, so it lives in the
   * drawer, one level in with a way back.
   */
  const wantsSettings = (search.get('tab') || '') === 'settings';
  const [manage, setManage] = useState<null | 'root' | 'settings'>(wantsSettings ? 'settings' : null);
  const { data, loading, error, refetch } = useApiQuery({
    queryKey: ['pools', id],
    queryFn: () => poolApi.get(id),
    errorMessage: 'Could not load this pool',
  });

  const live = data ? data.members.filter((m) => m.bucket !== 'withdrawn').length : undefined;
  const work = data ? data.assignments.filter((a) => !a.cancelledAt).length : undefined;
  const canPlace = can('pool.select');
  const canReview = can('pool.review');
  // Handed-in pieces waiting for a reviewer — the same count as the review queue.
  const toReview = data
    ? data.members.filter((m) => m.bucket !== 'withdrawn').reduce((n, m) => n + m.work.filter((w) => w.status === 'submitted').length, 0)
    : 0;

  /**
   * Three tabs, because a round is three questions: how is it going, who are
   * these people, and who gets in.
   *
   * Work used to be the fourth. It is a short list you set up once and then
   * barely touch, so standing it beside Candidates promised somewhere you
   * would live and delivered somewhere you would visit twice. It moved behind
   * Manage pool, next to the other set-it-once screens, and handing work out
   * happens where the people are.
   */
  const tabs = useMemo(() => [
    { key: 'overview', label: 'Overview', icon: LayoutGrid },
    // Candidates is where work is reviewed, so its badge points at what is waiting.
    { key: 'candidates', label: 'Candidates', icon: UsersRound, count: canReview && toReview ? toReview : live },
    { key: 'selection', label: 'Selection', icon: ListOrdered },
  ], [live, canReview, toReview]);

  // Older tab names still arrive in links (notifications and emails already
  // sent), so each maps onto where that screen lives now.
  const raw = search.get('tab') || 'overview';
  const LEGACY: Record<string, { tab: string; filter?: 'review' }> = {
    review: { tab: 'candidates', filter: 'review' },
    // Scoring and placing are one screen now; both old links land on it.
    shortlist: { tab: 'selection' },
    placement: { tab: 'selection' },
    // Settings is a drawer panel, so its old link opens the pool with it showing.
    settings: { tab: 'overview' },
  };
  // Review used to be a view of the Work tab (?tab=work&view=review); it lives in Candidates now.
  const oldWorkReview = raw === 'work' && search.get('view') === 'review';
  const resolved = oldWorkReview ? 'candidates' : (LEGACY[raw]?.tab || raw);
  const tab = ['overview', 'candidates', 'work', 'selection', 'history'].includes(resolved) ? resolved : 'overview';

  // Candidates can open already filtered to the work waiting for a reviewer.
  const candidateFilter = (LEGACY[raw]?.filter || (oldWorkReview ? 'review' : null) || (search.get('filter') === 'review' ? 'review' : undefined)) as 'review' | undefined;

  const go = (key: string) => {
    // Settings is not a destination any more; it is a panel of the drawer.
    if (key === 'settings') { setManage('settings'); return; }
    const legacy = LEGACY[key];
    const params = new URLSearchParams({ tab: legacy?.tab || key });
    if (legacy?.filter) params.set('filter', legacy.filter);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const reload = async () => {
    await refetch();
    invalidate(['pools', 'list']);
  };

  if (loading) return <Spinner />;
  if (error || !data) return <ErrorNote>{error || 'Pool not found'}</ErrorNote>;

  const { pool } = data;
  const meta = POOL_STATUS[pool.status];
  const transition = async (to: string, text: string) => {
    if (to === 'closed' || to === 'archived') {
      const ok = await confirm({
        title: to === 'closed' ? 'Close this pool?' : 'Archive this pool?',
        description: to === 'closed'
          ? 'Candidates can no longer hand in work, reviews stop, and no reminders go out. This cannot be undone.'
          : 'The pool disappears from the list. Its history is kept.',
        confirmLabel: to === 'closed' ? 'Close pool' : 'Archive',
      });
      if (!ok) return;
    }
    try {
      await poolApi.setStatus(pool.id, to);
      toast.success(text);
      await reload();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not change the pool status'));
    }
  };

  return (
    <div className="space-y-6">
      {/* A slim row instead of a header card: where you are, and one way in to
          everything about the pool itself (details, stage, settings, history). */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <Link href={workspacePath('/admin/pools')} className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 transition-colors hover:text-brand-700">
            <ArrowLeft className="h-3.5 w-3.5" /> Selection pools
          </Link>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2.5">
            {/* The pool's photo, as a clan carries its own. */}
            <ClanAvatar name={pool.name} src={pool.avatarUrl} size="md" />
            {/* Sized here on purpose: the global h1 style is a page-hero size. */}
            <h1 className="truncate text-2xl! font-semibold! leading-tight! text-slate-900">{pool.name}</h1>
            <Chip cls={meta.cls}>{meta.label}</Chip>
            {pool.archivedAt && <Chip cls="bg-slate-100 text-slate-500 border-slate-200">Archived</Chip>}
          </div>
        </div>
        <button onClick={() => setManage('root')} className={`${secondaryBtn} shrink-0`} aria-haspopup="dialog">
          <SlidersHorizontal className="h-4 w-4" /> Manage pool
        </button>
      </div>

      {manage && (
        <Drawer
          open
          onClose={() => setManage(null)}
          title={manage === 'settings' ? 'Settings' : 'Manage pool'}
          subtitle={pool.name}
          width={manage === 'settings' ? 'lg' : 'md'}
        >
          {manage === 'settings' ? (
            <div className="space-y-4">
              <button onClick={() => setManage('root')} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:text-brand-800">
                <ArrowLeft className="h-4 w-4" /> Manage pool
              </button>
              <SettingsTab data={data} onChange={reload} canManage={can('pool.manage')} />
            </div>
          ) : (
          <div className="space-y-6">
            {/* What the pool is: moved here from the old header card. */}
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">About</h3>
              <div className="mt-2 rounded-xl border border-slate-200 p-4">
                {pool.description && <p className="text-sm text-slate-700">{pool.description}</p>}
                <dl className={`space-y-2.5 text-sm ${pool.description ? 'mt-3 border-t border-slate-200 pt-3' : ''}`}>
                  {([
                    [GraduationCap, 'Programme', pool.program?.name || '-'],
                    [Target, 'Selects', `${pool.selectionQuota}${pool.capacity ? ` of up to ${pool.capacity}` : ''}`],
                    [CalendarClock, 'Deadline', fmtDate(pool.qualificationDueAt)],
                  ] as const).map(([Icon, text, value]) => (
                    <div key={text} className="flex items-center justify-between gap-3">
                      <dt className="inline-flex items-center gap-2 text-slate-500"><Icon className="h-4 w-4" />{text}</dt>
                      <dd className="truncate font-medium text-slate-800">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </section>

            {/* Stage: where the round is, and where it can go next. */}
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Stage</h3>
              <div className="mt-2 rounded-xl border border-slate-200 p-4">
                <div className="flex items-center gap-2">
                  <Chip cls={meta.cls}>{meta.label}</Chip>
                  {pool.archivedAt && <Chip cls="bg-slate-100 text-slate-500 border-slate-200">Archived</Chip>}
                </div>
                <p className="mt-2 text-sm text-slate-600">{STAGE_TEXT[pool.status]}</p>
                {can('pool.manage') && !pool.archivedAt && NEXT[pool.status].length > 0 && (
                  <div className="mt-4 space-y-2">
                    {NEXT[pool.status].map((n, i) => (
                      <button
                        key={n.to}
                        onClick={() => { setManage(null); transition(n.to, `Pool moved to ${POOL_STATUS[n.to as PoolStatus]?.label || n.to}`); }}
                        className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${i === 0 ? 'border-brand-300 bg-brand-50 hover:bg-brand-100 dark:bg-brand-500/10' : 'border-slate-200 hover:border-slate-300'}`}
                      >
                        <span className="min-w-0">
                          <span className={`block text-sm font-medium ${i === 0 ? 'text-brand-700' : 'text-slate-800'}`}>{n.label}</span>
                          <span className="block text-xs text-slate-500">{STAGE_TEXT[n.to as PoolStatus]}</span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* Set up once, looked back on rarely. Work is deliberately NOT
                here: it is the round's content, not its configuration, and
                filing it beside Settings made it read as a thing you tune
                rather than a thing you hand to people. It opens from
                Candidates, where handing it out happens. */}
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Pool</h3>
              <div className="mt-2 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200">
                {([
                  ['settings', Settings2, 'Settings', can('pool.manage') ? 'Name, dates, scoring, reminders and placement' : 'View the name, dates, scoring and reminders'],
                  ['history', History, 'History', 'Everything that happened, who did it and why'],
                ] as const).map(([key, Icon, text, hint]) => (
                  <button key={key} onClick={() => { if (key !== 'settings') setManage(null); go(key); }} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <span className="rounded-lg bg-slate-100 p-2 text-slate-600 dark:bg-slate-800"><Icon className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-slate-800">{text}</span>
                      <span className="block text-xs text-slate-500">{hint}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                  </button>
                ))}
              </div>
            </section>

            {/* Ending the round — kept apart, because it cannot be undone. */}
            {can('pool.manage') && !pool.archivedAt && (
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">End the round</h3>
                <div className="mt-2 space-y-2">
                  {pool.status !== 'closed' && (
                    <button onClick={() => { setManage(null); transition('closed', 'Pool closed'); }} className="flex w-full items-start gap-3 rounded-xl border border-rose-200 px-4 py-3 text-left transition-colors hover:bg-rose-50 dark:border-rose-900/50 dark:hover:bg-rose-950/30">
                      <Lock className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                      <span>
                        <span className="block text-sm font-medium text-rose-700 dark:text-rose-400">Close the pool</span>
                        <span className="block text-xs text-slate-500">Stops work, reviews and reminders. This cannot be undone.</span>
                      </span>
                    </button>
                  )}
                  {(pool.status === 'closed' || pool.status === 'draft') && (
                    <button onClick={() => { setManage(null); transition('archived', 'Pool archived'); }} className="flex w-full items-start gap-3 rounded-xl border border-slate-200 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <Archive className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                      <span>
                        <span className="block text-sm font-medium text-slate-800">Archive</span>
                        <span className="block text-xs text-slate-500">Hide it from the pools list. Its history is kept.</span>
                      </span>
                    </button>
                  )}
                </div>
              </section>
            )}
          </div>
          )}
        </Drawer>
      )}

      {tab === 'work' || tab === 'history' ? (
        <button onClick={() => go('overview')} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:text-brand-800">
          <ArrowLeft className="h-4 w-4" /> Back to the pool
        </button>
      ) : (
        <TabBar
          tabs={tabs.map((t) => ({ id: t.key, label: t.label, icon: t.icon, count: t.count }))}
          activeTab={tab}
          onChange={go}
          className="overflow-x-auto *:shrink-0 *:whitespace-nowrap"
        />
      )}

      {tab === 'overview' && <OverviewTab data={data} onGo={go} />}
      {tab === 'candidates' && <CandidatesTab data={data} onChange={reload} canManage={can('pool.members')} canSelect={can('pool.select')} canReview={canReview} canAssign={can('pool.assign')} initialFilter={candidateFilter} workCount={work ?? 0} onOpenWork={() => go('work')} />}

      {/* Work: what candidates are given. Reached from Manage pool, because it
          is set up once; handing it out happens where the people are. */}
      {tab === 'work' && <WorkTab data={data} onChange={reload} canAssign={can('pool.assign')} />}

      {/* Selection: rank, decide and place, in that order, on one screen. The
          same screen serves a selection round that is a clan; it is given the
          round's terms and an api rather than this pool. */}
      {tab === 'selection' && (
        <SelectionTab
          round={{
            id: pool.id,
            scope: 'pools',
            quota: pool.selectionQuota,
            closed: pool.status === 'closed',
            members: data.members,
          }}
          api={poolApi}
          onChange={reload}
          canSelect={can('pool.select')}
          canPlace={canPlace}
        />
      )}

      {tab === 'history' && <HistoryTab poolId={pool.id} data={data} />}
    </div>
  );
}
