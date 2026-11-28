'use client';

import { useState } from 'react';
import Link from 'next/link';
import { workspacePath } from '@/lib/services/workspace-scope';
import { ClanAvatar } from '@/components/shared/ClanAvatar';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Plus, Settings2, UsersRound } from 'lucide-react';
import { EntityCard, entityCardSecondaryBtn, formatDateRange } from '@/components/admin/EntityCard';
import { Drawer } from '@/components/shared/Drawer';
import { qk, useApiQuery } from '@/lib/query';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { poolApi, type Pool } from '@/lib/services/pool-api';
import { roundApi, type RoundSummary } from '@/lib/services/round-api';
import { mentorApi } from '@/lib/services/mentor-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { EmptyState, ErrorNote, POOL_STATUS, Spinner, field, fmtDate, fromLocalInput, label, panel, primaryBtn, secondaryBtn } from '@/components/admin/pools/poolUi';
import { byLifecycle } from '@/lib/utils/lifecycleOrder';

/**
 * A selection round that is a clan.
 *
 * The new shape of this screen's one idea: a round IS a clan, so it comes with
 * mentors, a roster, work, review and a group chat rather than rebuilding
 * them. The pools below are the older shape and are on their way out; both are
 * listed here until the live ones have moved.
 */
function CreateRoundDrawer({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [form, setForm] = useState({ programId: '', name: '', description: '', leadMentorId: '', cohortId: '' });
  const [saving, setSaving] = useState(false);
  const { data: options } = useApiQuery({
    queryKey: ['pools', 'options', form.programId || 'none'],
    queryFn: () => poolApi.options(form.programId || undefined),
  });
  const { data: mentors } = useApiQuery({
    queryKey: ['mentors', 'all'],
    queryFn: () => mentorApi.getAll().then((r: { data?: { mentors?: { id: string; firstName: string; lastName: string }[] } }) => r?.data?.mentors ?? []),
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    if (!form.programId || !form.name.trim()) {
      toast.error('Choose a programme and give the round a name');
      return;
    }
    setSaving(true);
    try {
      const round = await roundApi.create({
        programId: form.programId,
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        leadMentorId: form.leadMentorId || null,
        cohortId: form.cohortId || null,
      });
      toast.success('Round created. Set the work for each level next.');
      router.push(workspacePath(`/admin/pools/rounds/${round.id}`));
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not create the round'));
      setSaving(false);
    }
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title="New selection round"
      subtitle="A trial clan: candidates do work and are reviewed in it, and nobody is a mentee of the programme until they are selected."
      footer={(dismiss) => (
        <div className="flex justify-end gap-2">
          <button onClick={dismiss} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-muted">Cancel</button>
          <button onClick={submit} disabled={saving} className={primaryBtn}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create round
          </button>
        </div>
      )}
    >
      <div className="space-y-4">
        <div>
          <label className={label} htmlFor="round-program">Programme</label>
          <select id="round-program" value={form.programId} onChange={set('programId')} className={field}>
            <option value="">Choose a programme</option>
            {(options?.programs || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="round-name">Name</label>
          <input id="round-name" value={form.name} onChange={set('name')} placeholder="Spring 2027 selection" className={field} />
        </div>
        <div>
          <label className={label} htmlFor="round-desc">Description</label>
          <textarea id="round-desc" value={form.description} onChange={set('description')} rows={2} className={field} />
        </div>
        <div>
          <label className={label} htmlFor="round-lead">Lead mentor</label>
          <select id="round-lead" value={form.leadMentorId} onChange={set('leadMentorId')} className={field}>
            <option value="">Choose later</option>
            {(mentors || []).map((m) => <option key={m.id} value={m.id}>{`${m.firstName} ${m.lastName}`.trim()}</option>)}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">Whoever reviews the work candidates hand in. You can add more mentors from the clan.</p>
        </div>
        <div>
          <label className={label} htmlFor="round-intake">Intake</label>
          <select id="round-intake" value={form.cohortId} onChange={set('cohortId')} disabled={!form.programId} className={field}>
            <option value="">Not attached — add candidates by hand</option>
            {(options?.cohorts || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">
            Applicants to this intake arrive in the round once their level is confirmed, and are given that level&apos;s work.
          </p>
        </div>
      </div>
    </Drawer>
  );
}

function RoundCard({ round }: { round: RoundSummary }) {
  const href = `/admin/pools/rounds/${round.id}`;
  return (
    <EntityCard
      href={href}
      status={round.status === 'archived' || round.frozenAt
        ? { label: 'Closed', cls: 'bg-slate-100 text-slate-500 border-slate-200' }
        : { label: 'Round', cls: 'bg-brand-50 text-brand-700 border-brand-200' }}
      icon={<ClanAvatar name={round.name} src={round.avatarUrl} size="md" />}
      title={round.name}
      description={round.description || round.program?.name}
      tags={[round.description ? round.program?.name : null, round.cohort?.name].filter(Boolean) as string[]}
      stats={[
        { label: 'Candidates', value: round.memberCount },
        { label: 'To select', value: round.quota },
        { label: 'Selected', value: round.selectedCount, tone: round.selectedCount ? 'good' : 'default' },
        { label: 'Deadline', value: round.qualificationDueAt ? fmtDate(round.qualificationDueAt) : 'Not set' },
      ]}
      footer={round.levelRules
        ? `Work set for ${round.levelRules} level${round.levelRules === 1 ? '' : 's'}`
        : 'No work set yet — nobody is being given anything'}
      actions={(
        <Link href={workspacePath(`/admin/clans?clan=${round.id}`)} className={entityCardSecondaryBtn}>
          <UsersRound className="h-4 w-4" /> The clan
        </Link>
      )}
    />
  );
}

function CreatePoolDrawer({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [form, setForm] = useState({
    programId: '', name: '', description: '', selectionQuota: '', capacity: '',
    opensAt: '', closesAt: '', qualificationDueAt: '',
  });
  const [saving, setSaving] = useState(false);
  // Only the programme list is needed here.
  const { data: options } = useApiQuery({
    queryKey: ['pools', 'options', 'none'],
    queryFn: () => poolApi.options(),
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    if (!form.programId || !form.name.trim() || !form.selectionQuota) {
      toast.error('Choose a programme, give the pool a name, and say how many to select');
      return;
    }
    setSaving(true);
    try {
      const pool = await poolApi.create({
        programId: form.programId,
        name: form.name.trim(),
        description: form.description.trim() || null,
        selectionQuota: Number(form.selectionQuota),
        capacity: form.capacity ? Number(form.capacity) : null,
        opensAt: fromLocalInput(form.opensAt),
        closesAt: fromLocalInput(form.closesAt),
        qualificationDueAt: fromLocalInput(form.qualificationDueAt),
      });
      toast.success('Pool created. Set up its scoring and work next');
      router.push(workspacePath(`/admin/pools/${pool.id}?tab=settings`));
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not create the pool'));
      setSaving(false);
    }
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title="New selection pool"
      subtitle="Candidates qualify here before anyone is placed in a clan."
      footer={(dismiss) => (
        <div className="flex justify-end gap-2">
          <button onClick={dismiss} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg">Cancel</button>
          <button onClick={submit} disabled={saving} className={primaryBtn}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Create pool
          </button>
        </div>
      )}
    >
      <div className="space-y-4">
        <div>
          <label className={label}>Programme <span className="text-red-500">*</span></label>
          <select value={form.programId} onChange={set('programId')} className={field}>
            <option value="">Choose a programme…</option>
            {(options?.programs || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <p className="mt-1 text-xs text-slate-400">Selected candidates are placed in this programme&apos;s clans, and pool permissions are checked against it. Applicants can come from any cohort.</p>
        </div>
        <div>
          <label className={label}>Name <span className="text-red-500">*</span></label>
          <input value={form.name} onChange={set('name')} placeholder="e.g. Spring 2027 selection" className={field} />
        </div>
        <div>
          <label className={label}>Description</label>
          <textarea value={form.description} onChange={set('description')} rows={2} className={field} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Select how many <span className="text-red-500">*</span></label>
            <input type="number" min={1} value={form.selectionQuota} onChange={set('selectionQuota')} placeholder="e.g. 50" className={field} />
          </div>
          <div>
            <label className={label}>Pool capacity</label>
            <input type="number" min={1} value={form.capacity} onChange={set('capacity')} placeholder="No limit" className={field} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Opens</label>
            <input type="datetime-local" value={form.opensAt} onChange={set('opensAt')} className={field} />
          </div>
          <div>
            <label className={label}>Closes</label>
            <input type="datetime-local" value={form.closesAt} onChange={set('closesAt')} className={field} />
          </div>
        </div>
        <div>
          <label className={label}>Qualification deadline</label>
          <input type="datetime-local" value={form.qualificationDueAt} onChange={set('qualificationDueAt')} className={field} />
          <p className="mt-1 text-xs text-slate-400">The default due date for the pool&apos;s work.</p>
        </div>
      </div>
    </Drawer>
  );
}

function PoolCard({ pool }: { pool: Pool }) {
  const meta = POOL_STATUS[pool.status];
  const selected = pool.selectedCount ?? 0;
  const href = `/admin/pools/${pool.id}`;
  const dates = formatDateRange(pool.opensAt, pool.closesAt);
  return (
    <EntityCard
      href={href}
      status={meta}
      icon={<ClanAvatar name={pool.name} src={pool.avatarUrl} size="md" />}
      title={pool.name}
      description={pool.description || pool.program?.name}
      tags={pool.description && pool.program?.name ? [pool.program.name] : []}
      stats={[
        { label: 'Candidates', value: pool.capacity ? `${pool.memberCount ?? 0} / ${pool.capacity}` : pool.memberCount ?? 0 },
        { label: 'To select', value: pool.selectionQuota },
        { label: 'Selected', value: selected, tone: selected ? 'good' : 'default' },
        { label: 'Deadline', value: pool.qualificationDueAt ? fmtDate(pool.qualificationDueAt) : 'Not set' },
      ]}
      footer={dates || 'No dates set'}
      actions={<Link href={workspacePath(`${href}?tab=settings`)} className={entityCardSecondaryBtn}><Settings2 className="h-4 w-4" /> Settings</Link>}
    />
  );
}

const FILTERS: [string, string][] = [['', 'All live'], ...Object.entries(POOL_STATUS).map(([k, v]) => [k, v.label] as [string, string]), ['archived', 'Archived']];

export default function PoolsPage() {
  const { can } = usePermissions();
  /** 'round' is the current shape; 'pool' is the older one, kept until the live pools move. */
  const [creating, setCreating] = useState<null | 'round' | 'pool'>(null);
  const [status, setStatus] = useState('');
  const { data: pools, loading, error } = useApiQuery({
    queryKey: ['pools', 'list', status],
    queryFn: () => poolApi.list(status ? { status } : undefined),
    errorMessage: 'Could not load pools',
  });
  const { data: rounds, loading: roundsLoading } = useApiQuery({
    queryKey: qk.round.list(),
    queryFn: () => roundApi.list(),
    errorMessage: 'Could not load the selection rounds',
  });
  // A pool's statuses are not a round's, so filtering by one hides the other
  // rather than pretending a round has a stage it does not have.
  const shownRounds = status ? [] : (rounds || []);
  const nothing = !(pools || []).length && !shownRounds.length;

  return (
    <div className="space-y-6">
      <div className="admin-page-heading flex items-start justify-between gap-4">
        <div>
          <h1 className="text-slate-900 mb-2">Selection pools</h1>
          <p className="text-slate-600">
            Test candidates before they join a clan: give them work, review it, shortlist the strongest and place them.
          </p>
        </div>
        {can('pool.manage') && (
          <div className="flex shrink-0 items-center gap-2">
            <button onClick={() => setCreating('pool')} className={secondaryBtn}>
              New pool
            </button>
            <button onClick={() => setCreating('round')} className={primaryBtn}>
              <Plus className="w-4 h-4" /> New round
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter pools by status">
        {FILTERS.map(([key, text]) => (
          <button
            key={key || 'all'}
            aria-pressed={status === key}
            onClick={() => setStatus(key)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${status === key ? 'bg-brand-600 text-white' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
          >
            {text}
          </button>
        ))}
      </div>

      {(loading || roundsLoading) && <Spinner />}
      {error && <ErrorNote>{error}</ErrorNote>}
      {!loading && !roundsLoading && !error && nothing && (
        <div className={panel}>
          <EmptyState
            icon={UsersRound}
            title={status ? 'Nothing with this status' : 'No selection rounds yet'}
            text={status
              ? 'Choose another filter to see the rest.'
              : 'A round is a trial clan: candidates do its work and are reviewed in it, and nobody joins the programme until they are selected.'}
            action={!status && can('pool.manage') && (
              <button onClick={() => setCreating('round')} className={primaryBtn}><Plus className="w-4 h-4" /> New round</button>
            )}
          />
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {shownRounds.map((round) => <RoundCard key={round.id} round={round} />)}
        {/* Live pools first, closed ones last. */}
        {[...(pools || [])].sort(byLifecycle((p) => p.status)).map((pool) => <PoolCard key={pool.id} pool={pool} />)}
      </div>

      {creating === 'pool' && <CreatePoolDrawer onClose={() => setCreating(null)} />}
      {creating === 'round' && <CreateRoundDrawer onClose={() => setCreating(null)} />}
    </div>
  );
}
