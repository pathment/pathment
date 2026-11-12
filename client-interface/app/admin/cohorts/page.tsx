'use client';

import { useEffect, useState } from 'react';
import { EntityCard, entityCardSecondaryBtn, formatDateRange } from '@/components/admin/EntityCard';
import { toast } from 'sonner';
import { Plus, Loader2, CalendarRange, Link2, Check, Inbox } from 'lucide-react';
import { Drawer } from '@/components/shared/Drawer';
import { SelectMenu } from '@/components/shared/SelectMenu';
import { useCohorts, type Cohort, type CohortStatus } from '@/lib/hooks/admin';
import { cohortApi } from '@/lib/services/intake-api';
import { programsApi } from '@/lib/services/program-api';
import { poolApi, type Pool } from '@/lib/services/pool-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';

const STATUS_META: Record<CohortStatus, { label: string; cls: string }> = {
  planning:  { label: 'Planning',  cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  open:      { label: 'Open',      cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  closed:    { label: 'Closed',    cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  running:   { label: 'Running',   cls: 'bg-brand-50 text-brand-700 border-brand-200' },
  completed: { label: 'Completed', cls: 'bg-slate-100 text-slate-500 border-slate-200' },
};

const NEW_POOL = '__new__';
const NO_POOL = '';

function CreateCohortDrawer({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [programs, setPrograms] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({ programId: '', name: '', status: 'planning' });
  const [saving, setSaving] = useState(false);
  // Where applicants go: straight into a selection pool unless the admin says not to.
  const [pools, setPools] = useState<Pool[]>([]);
  const [poolChoice, setPoolChoice] = useState<string | null>(null);

  useEffect(() => {
    if (!form.programId) { setPools([]); return; }
    let alive = true;
    poolApi.list({ programId: form.programId })
      .then((list) => { if (alive) setPools(list.filter((p) => p.status !== 'closed' && !p.archivedAt)); })
      .catch(() => { if (alive) setPools([]); });
    return () => { alive = false; };
  }, [form.programId]);
  // Default: the programme's one live pool, else a new pool for this intake.
  const poolTarget = poolChoice ?? (pools.length === 1 ? pools[0].id : NEW_POOL);

  useEffect(() => {
    programsApi.getAll()
      .then((r: any) => {
        const list = Array.isArray(r?.data) ? r.data : (r?.data?.programs ?? []);
        setPrograms(list.map((p: any) => ({ id: p.id, name: p.name })));
      })
      .catch(() => {});
  }, []);

  const field = 'w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500';

  const submit = async () => {
    if (!form.programId || !form.name.trim()) { toast.error('Pick a program and name the cohort'); return; }
    try {
      setSaving(true);
      const res = await cohortApi.create({
        programId: form.programId,
        name: form.name.trim(),
        status: form.status,
      });
      const cohortId = (res as { data?: { cohort?: { id?: string } } } | undefined)?.data?.cohort?.id;
      let poolNote = '';
      if (cohortId && poolTarget !== NO_POOL) {
        try {
          if (poolTarget === NEW_POOL) {
            await poolApi.create({
              programId: form.programId, name: `${form.name.trim()} selection`, cohortId, selectionQuota: 25,
              settings: { autoAddFromCohortIds: [cohortId], autoSelectAtProgress: 80 },
            });
            poolNote = ' with its own selection pool';
          } else {
            const pool = pools.find((p) => p.id === poolTarget);
            await poolApi.update(poolTarget, {
              settings: { autoAddFromCohortIds: [...(pool?.settings?.autoAddFromCohortIds || []), cohortId] },
            });
            poolNote = ` — applicants go to ${pool?.name || 'the selection pool'}`;
          }
        } catch (err) {
          toast.error(extractApiErrorMessage(err, 'Cohort created, but it could not be linked to a selection pool'));
        }
      }
      toast.success(`Cohort created${poolNote}`);
      onCreated();
      onClose();
    } catch (err) {
      toast.error(extractApiErrorMessage(err, 'Could not create cohort'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      open
      onClose={onClose}
      width="sm"
      title="New cohort"
      footer={(dismiss) => (
        <>
          <button onClick={dismiss} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg">Cancel</button>
          <button onClick={submit} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 text-white rounded-lg">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Create cohort
          </button>
        </>
      )}
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Program <span className="text-red-500">*</span></label>
          {/* The shared searchable select, not a native one: a workspace with
              thirty programmes made this a scroll-and-squint. */}
          <SelectMenu
            ariaLabel="Program"
            value={form.programId}
            onChange={(value) => setForm({ ...form, programId: value })}
            placeholder="Select a program…"
            options={programs.map((p) => ({ value: p.id, label: p.name }))}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Name <span className="text-red-500">*</span></label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. 2026 Spring intake" className={field} />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={field}>
            <option value="planning">Planning - not yet accepting</option>
            <option value="open">Open - accepting applications</option>
            <option value="closed">Closed - intake done</option>
            <option value="running">Running</option>
            <option value="completed">Completed</option>
          </select>
        </div>
        {form.programId && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Add applicants automatically to</label>
            <select value={poolTarget} onChange={(e) => setPoolChoice(e.target.value)} className={field}>
              <option value={NEW_POOL}>A new selection pool for this intake</option>
              {pools.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              <option value={NO_POOL}>Don&apos;t add them — I&apos;ll pick applicants myself</option>
            </select>
            <p className="text-xs text-slate-400 mt-1">
              Everyone who applies joins the pool and gets their level&apos;s Edorax guided labs.
              {poolTarget === NEW_POOL && ' The new pool selects candidates at 80% progress — change it in the pool’s settings.'}
            </p>
          </div>
        )}
        <p className="text-xs text-slate-400">
          Dates, capacity, the application window and assessments are set in the cohort&apos;s <span className="font-medium text-slate-500">Admissions settings</span> after you create it.
        </p>
      </div>
    </Drawer>
  );
}

/** Applications that are somebody's job right now, as opposed to decided. */
const waitingOn = (cohort: Cohort) =>
  (cohort.applicationsByStatus?.pending ?? 0)
  + (cohort.applicationsByStatus?.under_review ?? 0)
  + (cohort.applicationsByStatus?.assessment_sent ?? 0);

function CohortCard({ cohort }: { cohort: Cohort }) {
  const meta = STATUS_META[cohort.status] ?? STATUS_META.planning;
  const accepted = cohort.applicationsByStatus?.accepted ?? 0;
  const pending = waitingOn(cohort);
  const [copied, setCopied] = useState(false);
  const applyUrl = cohort.publicEnabled && cohort.publicSlug && typeof window !== 'undefined'
    ? `${window.location.origin}/apply/${cohort.publicSlug}`
    : null;
  return (
    <EntityCard
      href={`/admin/cohorts/${cohort.id}`}
      status={meta}
      title={cohort.name}
      description={cohort.program?.name || undefined}
      tags={applyUrl ? ['Apply link live'] : []}
      stats={[
        { label: 'Applicants', value: cohort.applicationCount ?? 0 },
        { label: 'In review', value: pending, tone: pending ? 'attention' : 'default' },
        { label: 'Accepted', value: accepted, tone: accepted ? 'good' : 'default' },
        { label: 'Seats', value: cohort.capacity ?? 'No limit' },
      ]}
      footer={formatDateRange(cohort.startDate, cohort.endDate) || 'No dates set'}
      primaryLabel={pending ? `Review ${pending}` : 'Open'}
      actions={applyUrl ? (
        /*
            The apply link is the entire point of an open intake and lived two
            clicks inside the cohort, so sharing one meant opening it, finding
            the settings panel and copying from there. It belongs on the card.
        */
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(applyUrl)
              .then(() => { setCopied(true); toast.success('Apply link copied'); setTimeout(() => setCopied(false), 2000); })
              .catch(() => toast.error('Could not copy the link'));
          }}
          className={entityCardSecondaryBtn}
        >
          {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Link2 className="w-4 h-4" />}
          {copied ? 'Copied' : 'Copy link'}
        </button>
      ) : undefined}
    />
  );
}

export default function AdminCohortsPage() {
  const { cohorts, loading, error, refetch } = useCohorts();
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const filtered = cohorts
    .filter(cohort => (statusFilter === 'all' || cohort.status === statusFilter)
      && `${cohort.name} ${cohort.program?.name || ''}`.toLowerCase().includes(search.toLowerCase()))
    /**
     * Worst first. The cards arrived in whatever order the API returned, so
     * the intake with forty people waiting could sit below three finished
     * ones — and an admissions admin opens this page to find exactly that.
     */
    .sort((a, b) => waitingOn(b) - waitingOn(a) || a.name.localeCompare(b.name));

  // What is waiting across everything, which is the question the page is
  // opened to answer and which it previously made you open each card to work out.
  const totalWaiting = cohorts.reduce((sum, c) => sum + waitingOn(c), 0);
  const openIntakes = cohorts.filter((c) => c.status === 'open').length;

  return (
    <div className="space-y-6">
      <div className="admin-page-heading flex items-start justify-between gap-4">
        <div>
          <h1 className="text-slate-900 mb-2">Intake</h1>
          <p className="text-slate-600">Run registration in cohorts. Import applicants, review them, and accept them into a program.</p>
        </div>
        <button onClick={() => setCreating(true)} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 shrink-0">
          <Plus className="w-4 h-4" /> New cohort
        </button>
      </div>

      {!loading && !error && cohorts.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border border-slate-200 bg-card px-5 py-4">
          <p className="inline-flex items-center gap-2 text-sm">
            <Inbox className={`h-4 w-4 ${totalWaiting ? 'text-amber-600' : 'text-slate-300'}`} aria-hidden />
            {totalWaiting
              ? <><strong className="text-slate-900">{totalWaiting}</strong> <span className="text-slate-600">{totalWaiting === 1 ? 'application is' : 'applications are'} waiting on a decision</span></>
              : <span className="text-slate-600">Nothing is waiting on a decision</span>}
          </p>
          <p className="text-sm text-slate-500">
            {openIntakes} of {cohorts.length} {cohorts.length === 1 ? 'intake' : 'intakes'} accepting applications
          </p>
          {totalWaiting > 0 && statusFilter !== 'all' && (
            <button onClick={() => { setStatusFilter('all'); setSearch(''); }} className="text-sm font-medium text-brand-700 hover:underline">
              Show everything
            </button>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <input
          aria-label="Search intakes"
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder="Find an intake or program…"
          className="min-w-48 flex-1 rounded-xl border bg-card px-4 py-3 text-sm"
        />
        <SelectMenu
          ariaLabel="Intake status"
          value={statusFilter}
          onChange={setStatusFilter}
          className="min-w-44"
          options={[
            { value: 'all', label: 'All statuses' },
            ...Object.entries(STATUS_META).map(([value, meta]) => ({ value, label: meta.label })),
          ]}
        />
      </div>
      {!loading && !error && cohorts.length > 0 && filtered.length === 0 && <p className="rounded-2xl border bg-card p-8 text-center text-muted-foreground">No intakes match these filters.</p>}
      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-600" /></div>
      ) : error ? (
        <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center">
          <p className="text-slate-600 mb-3">{error}</p>
          <button onClick={refetch} className="text-brand-600 hover:text-brand-700 text-sm font-medium">Try again</button>
        </div>
      ) : cohorts.length === 0 ? (
        <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center">
          <CalendarRange className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600">No cohorts yet. Create one to open an intake for a program.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c) => <CohortCard key={c.id} cohort={c} />)}
        </div>
      )}

      {creating && <CreateCohortDrawer onClose={() => setCreating(false)} onCreated={refetch} />}
    </div>
  );
}
