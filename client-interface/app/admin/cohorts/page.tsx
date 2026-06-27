'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Plus, X, Loader2, Users, ChevronRight, CalendarRange } from 'lucide-react';
import { useCohorts, type Cohort, type CohortStatus } from '@/lib/hooks/admin';
import { cohortApi } from '@/lib/services/intake-api';
import { programsApi } from '@/lib/services/program-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';

const STATUS_META: Record<CohortStatus, { label: string; cls: string }> = {
  planning:  { label: 'Planning',  cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  open:      { label: 'Open',      cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  closed:    { label: 'Closed',    cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  running:   { label: 'Running',   cls: 'bg-brand-50 text-brand-700 border-brand-200' },
  completed: { label: 'Completed', cls: 'bg-slate-100 text-slate-500 border-slate-200' },
};

function CreateCohortDrawer({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [programs, setPrograms] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({ programId: '', name: '', status: 'planning' });
  const [saving, setSaving] = useState(false);

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
      await cohortApi.create({
        programId: form.programId,
        name: form.name.trim(),
        status: form.status,
      });
      toast.success('Cohort created');
      onCreated();
      onClose();
    } catch (err) {
      toast.error(extractApiErrorMessage(err, 'Failed to create cohort'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30 dark:bg-black/70" onClick={onClose}>
      <div role="dialog" aria-modal="true" className="relative w-full max-w-md h-full bg-card border-l border-slate-200 dark:border-slate-700 shadow-2xl dark:shadow-[-8px_0_30px_rgba(0,0,0,0.6)] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-slate-900 font-medium">New cohort</h2>
          <button onClick={onClose} aria-label="Close" className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Program <span className="text-red-500">*</span></label>
            <select value={form.programId} onChange={(e) => setForm({ ...form, programId: e.target.value })} className={field}>
              <option value="">Select a program…</option>
              {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
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
          <p className="text-xs text-slate-400">
            Dates, capacity, the application window and assessments are set in the cohort&apos;s <span className="font-medium text-slate-500">Admissions settings</span> after you create it.
          </p>
        </div>
        <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg">Cancel</button>
          <button onClick={submit} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 text-white rounded-lg">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Create cohort
          </button>
        </div>
      </div>
    </div>
  );
}

function CohortCard({ cohort }: { cohort: Cohort }) {
  const meta = STATUS_META[cohort.status] ?? STATUS_META.planning;
  const accepted = cohort.applicationsByStatus?.accepted ?? 0;
  const pending = (cohort.applicationsByStatus?.pending ?? 0) + (cohort.applicationsByStatus?.under_review ?? 0) + (cohort.applicationsByStatus?.assessment_sent ?? 0);
  return (
    <Link href={`/admin/cohorts/${cohort.id}`} className="group block rounded-2xl border border-slate-200 bg-card p-5 hover:border-brand-300 hover:shadow-sm transition-all">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-slate-900 truncate">{cohort.name}</p>
          <p className="mt-0.5 text-xs text-slate-500 truncate">{cohort.program?.name || '-'}</p>
        </div>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium shrink-0 ${meta.cls}`}>{meta.label}</span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-slate-50 py-2">
          <p className="text-sm font-semibold text-slate-900">{cohort.applicationCount ?? 0}</p>
          <p className="text-[11px] text-slate-500">applicants</p>
        </div>
        <div className="rounded-lg bg-slate-50 py-2">
          <p className="text-sm font-semibold text-slate-900">{pending}</p>
          <p className="text-[11px] text-slate-500">in review</p>
        </div>
        <div className="rounded-lg bg-emerald-50 py-2">
          <p className="text-sm font-semibold text-emerald-700">{accepted}</p>
          <p className="text-[11px] text-slate-500">accepted</p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-end text-xs font-medium text-brand-600 opacity-0 group-hover:opacity-100 transition-opacity">
        Review applications <ChevronRight className="ml-0.5 w-3.5 h-3.5" />
      </div>
    </Link>
  );
}

export default function AdminCohortsPage() {
  const { cohorts, loading, error, refetch } = useCohorts();
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-slate-900 mb-2">Intake</h1>
          <p className="text-slate-600">Run registration in cohorts - import applicants, review, and accept into a program.</p>
        </div>
        <button onClick={() => setCreating(true)} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 shrink-0">
          <Plus className="w-4 h-4" /> New cohort
        </button>
      </div>

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
          <p className="text-slate-600">No cohorts yet - create one to open an intake for a program.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {cohorts.map((c) => <CohortCard key={c.id} cohort={c} />)}
        </div>
      )}

      {creating && <CreateCohortDrawer onClose={() => setCreating(false)} onCreated={refetch} />}
    </div>
  );
}
