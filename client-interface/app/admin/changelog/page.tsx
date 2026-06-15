'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import dynamic from 'next/dynamic';
import { PackageOpen, Plus, Pencil, Trash2, Eye, EyeOff, Rocket, ArrowUpCircle, Wrench, Search, X, Upload } from 'lucide-react';
import { Drawer } from '@/components/shared/Drawer';
import { SelectMenu } from '@/components/shared/SelectMenu';
import { TablePagination } from '@/components/shared/TablePagination';
import { usePagination } from '@/lib/hooks/shared/usePagination';
import { useDebounce } from '@/lib/hooks/shared/useDebounce';
import { changelogApi, type ChangelogAdminEntry, type ChangelogInput, type ChangelogRole, type ChangelogType } from '@/lib/services/changelog-api';
import { isBlankHtml, stripHtml } from '@/lib/utils/html';

const RichTextEditor = dynamic(() => import('@/components/shared/RichTextEditor'), { ssr: false });

const TYPE_OPTS = [
  { value: 'feature', label: 'New feature' },
  { value: 'improvement', label: 'Improvement' },
  { value: 'fix', label: 'Bug fix' },
];
const TYPE_FILTER_OPTS = [{ value: '', label: 'All types' }, ...TYPE_OPTS];
const STATUS_FILTER_OPTS = [
  { value: '', label: 'All statuses' },
  { value: 'published', label: 'Published' },
  { value: 'draft', label: 'Drafts' },
];
const ROLES: ChangelogRole[] = ['admin', 'mentor', 'mentee'];
const TYPE_ICON: Record<string, typeof Rocket> = { feature: Rocket, improvement: ArrowUpCircle, fix: Wrench };

const EMPTY: ChangelogInput = { title: '', body: '', type: 'feature', audience: ['admin', 'mentor', 'mentee'], isMajor: false, actionUrl: '', actionLabel: '' };

export default function AdminChangelogPage() {
  const [entries, setEntries] = useState<ChangelogAdminEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ChangelogInput>(EMPTY);
  const [saving, setSaving] = useState(false);
  // JSON bulk-import (paste a JSON array, optionally publish on import).
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importPublish, setImportPublish] = useState(false);
  const [importing, setImporting] = useState(false);

  // Server-side search + filters + pagination (capped on the backend).
  const pagination = usePagination({ initialPage: 1, initialLimit: 10 });
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 400);
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const { setTotal, reset } = pagination;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await changelogApi.listAll({
        page: pagination.page,
        limit: pagination.limit,
        ...(debouncedSearch.trim() && { search: debouncedSearch.trim() }),
        ...(typeFilter && { type: typeFilter }),
        ...(statusFilter && { status: statusFilter }),
      });
      setEntries(res.updates);
      setTotal(res.total);
    } catch {
      toast.error('Failed to load updates');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.page, pagination.limit, debouncedSearch, typeFilter, statusFilter]);

  useEffect(() => { load(); }, [load]);

  // Any filter change returns to page 1.
  useEffect(() => { reset(); }, [debouncedSearch, typeFilter, statusFilter, reset]);

  const hasFilters = !!search.trim() || !!typeFilter || !!statusFilter;
  const clearFilters = () => { setSearch(''); setTypeFilter(''); setStatusFilter(''); };

  const openNew = () => { setEditingId(null); setForm(EMPTY); setDrawerOpen(true); };

  const runImport = async () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(importText);
    } catch {
      toast.error('That isn\'t valid JSON — check for a missing comma or quote.');
      return;
    }
    const payload = Array.isArray(parsed)
      ? { updates: parsed as ChangelogInput[], publish: importPublish }
      : { ...(parsed as { updates: ChangelogInput[] }), publish: importPublish };
    if (!Array.isArray(payload.updates) || !payload.updates.length) {
      toast.error('Expected a JSON array of updates (or { "updates": [...] }).');
      return;
    }
    setImporting(true);
    try {
      const res = await changelogApi.importMany(payload);
      if (res.created > 0) {
        toast.success(`Imported ${res.created} of ${res.total}${importPublish ? ' (published)' : ' as drafts'}.`);
      }
      if (res.errors?.length) {
        toast.error(`${res.errors.length} skipped: ${res.errors.slice(0, 3).map((e) => `#${e.index + 1} ${e.message}`).join('; ')}`);
      }
      if (res.created > 0) { setImportOpen(false); setImportText(''); setImportPublish(false); await load(); }
    } catch (e: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      toast.error(e?.response?.data?.message || 'Could not import the updates.');
    } finally {
      setImporting(false);
    }
  };
  const openEdit = (e: ChangelogAdminEntry) => {
    setEditingId(e.id);
    setForm({ title: e.title, body: e.body, type: e.type, audience: e.audience, isMajor: e.isMajor, actionUrl: e.actionUrl || '', actionLabel: e.actionLabel || '' });
    setDrawerOpen(true);
  };

  const toggleAudience = (role: ChangelogRole) => {
    setForm((f) => ({ ...f, audience: f.audience.includes(role) ? f.audience.filter((r) => r !== role) : [...f.audience, role] }));
  };

  const save = async (publish: boolean) => {
    if (!form.title.trim()) return toast.error('Title is required');
    if (isBlankHtml(form.body)) return toast.error('Body is required');
    if (!form.audience.length) return toast.error('Pick at least one audience');
    setSaving(true);
    try {
      const payload: ChangelogInput = { ...form, publish };
      if (editingId) {
        await changelogApi.update(editingId, payload);
        toast.success(publish ? 'Published' : 'Saved');
      } else {
        await changelogApi.create(payload);
        toast.success(publish ? 'Published' : 'Draft saved');
      }
      setDrawerOpen(false);
      load();
    } catch {
      toast.error('Could not save');
    } finally {
      setSaving(false);
    }
  };

  const togglePublish = async (e: ChangelogAdminEntry) => {
    try {
      await changelogApi.update(e.id, { publish: e.isDraft });
      toast.success(e.isDraft ? 'Published' : 'Unpublished');
      load();
    } catch {
      toast.error('Could not update');
    }
  };

  const remove = async (e: ChangelogAdminEntry) => {
    if (!confirm(`Delete "${e.title}"? This can't be undone.`)) return;
    try {
      await changelogApi.remove(e.id);
      toast.success('Deleted');
      setEntries((prev) => prev.filter((x) => x.id !== e.id));
    } catch {
      toast.error('Could not delete');
    }
  };

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <PackageOpen className="w-6 h-6 text-brand-600" /> What's New
          </h1>
          <p className="text-slate-500 mt-1">Post product updates. Users see a role-filtered feed with an unread badge; major items pop a one-time modal.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => setImportOpen(true)} className="inline-flex items-center gap-2 px-4 py-2.5 border border-slate-200 hover:border-brand-300 text-slate-700 text-sm font-semibold rounded-xl transition-colors">
            <Upload className="w-4 h-4" /> Import JSON
          </button>
          <button onClick={openNew} className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl transition-colors">
            <Plus className="w-4 h-4" /> New update
          </button>
        </div>
      </div>

      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search updates by title…"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-card text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
          />
        </div>
        <div className="w-full sm:w-44">
          <SelectMenu value={typeFilter} onChange={setTypeFilter} options={TYPE_FILTER_OPTS} ariaLabel="Filter by type" />
        </div>
        <div className="w-full sm:w-44">
          <SelectMenu value={statusFilter} onChange={setStatusFilter} options={STATUS_FILTER_OPTS} ariaLabel="Filter by status" />
        </div>
        {hasFilters && (
          <button onClick={clearFilters} className="inline-flex items-center gap-1 px-3 py-2.5 text-sm text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl shrink-0">
            <X className="w-4 h-4" /> Clear
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-slate-400 text-sm py-12 text-center">Loading…</div>
      ) : entries.length === 0 ? (
        <div className="border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl py-16 text-center">
          <PackageOpen className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-slate-500">{hasFilters ? 'No updates match your filters.' : 'No updates yet. Post your first one so users know what shipped.'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((e) => {
            const Icon = TYPE_ICON[e.type] || Rocket;
            return (
              <div key={e.id} className="flex items-start gap-3 p-4 bg-card border border-slate-200 dark:border-slate-700 rounded-xl">
                <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center shrink-0 text-slate-500">
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-slate-900 dark:text-slate-100">{e.title}</p>
                    {e.isMajor && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">Major</span>}
                    {e.isDraft
                      ? <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">Draft</span>
                      : <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">Published</span>}
                  </div>
                  <p className="text-sm text-slate-500 mt-0.5 line-clamp-1">{stripHtml(e.body)}</p>
                  <p className="text-xs text-slate-400 mt-1">{e.audience.join(' · ')}{e.author ? ` — ${e.author}` : ''}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => togglePublish(e)} title={e.isDraft ? 'Publish' : 'Unpublish'} className="p-2 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg">
                    {e.isDraft ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                  <button onClick={() => openEdit(e)} title="Edit" className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => remove(e)} title="Delete" className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && pagination.total > pagination.limit && (
        <TablePagination pagination={pagination} isLoading={loading} className="pt-4" />
      )}

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editingId ? 'Edit update' : 'New update'}
        subtitle="Write it for users — a benefit, not a commit message."
        width="lg"
        footer={
          <div className="flex items-center justify-end gap-2">
            <button onClick={() => save(false)} disabled={saving} className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 rounded-lg disabled:opacity-50">
              Save draft
            </button>
            <button onClick={() => save(true)} disabled={saving} className="px-4 py-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg disabled:opacity-50">
              {saving ? 'Saving…' : 'Publish'}
            </button>
          </div>
        }
      >
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Title</label>
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Customize a task for one mentee"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-card text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">What changed</label>
            <RichTextEditor content={form.body} onChange={(html) => setForm((f) => ({ ...f, body: html }))} placeholder="Describe the benefit to the user…" minHeight="160px" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Type</label>
              <SelectMenu value={form.type} onChange={(v) => setForm((f) => ({ ...f, type: v as ChangelogType }))} options={TYPE_OPTS} ariaLabel="Update type" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Show to</label>
              <div className="flex flex-wrap gap-1.5">
                {ROLES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => toggleAudience(r)}
                    className={`px-3 py-1.5 text-sm rounded-lg border capitalize transition-colors ${
                      form.audience.includes(r)
                        ? 'bg-brand-50 border-brand-300 text-brand-700 dark:bg-brand-500/15 dark:border-brand-500/40 dark:text-brand-300'
                        : 'bg-card border-slate-200 dark:border-slate-600 text-slate-500'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <label className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-600 cursor-pointer">
            <input type="checkbox" checked={!!form.isMajor} onChange={(e) => setForm((f) => ({ ...f, isMajor: e.target.checked }))} className="w-4 h-4 rounded accent-brand-600" />
            <span className="text-sm">
              <span className="font-medium text-slate-800 dark:text-slate-100">Major update</span>
              <span className="text-slate-500"> — pops a one-time modal for users on their next visit. Reserve for real features.</span>
            </span>
          </label>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Action link <span className="text-slate-400 font-normal">(optional)</span></label>
              <input
                value={form.actionUrl || ''}
                onChange={(e) => setForm((f) => ({ ...f, actionUrl: e.target.value }))}
                placeholder="/mentor/roadmaps"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-card text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-brand-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Link label</label>
              <input
                value={form.actionLabel || ''}
                onChange={(e) => setForm((f) => ({ ...f, actionLabel: e.target.value }))}
                placeholder="Try it"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-card text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-brand-500 outline-none"
              />
            </div>
          </div>
        </div>
      </Drawer>

      {/* Import JSON drawer */}
      <Drawer
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import updates from JSON"
        subtitle="Paste a JSON array of updates. They import as drafts unless you tick publish."
        width="lg"
        footer={
          <div className="flex items-center justify-between gap-2 w-full">
            <label className="inline-flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={importPublish} onChange={(e) => setImportPublish(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
              Publish on import
            </label>
            <div className="flex gap-2">
              <button onClick={() => setImportOpen(false)} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm">Cancel</button>
              <button onClick={runImport} disabled={importing || !importText.trim()} className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium disabled:opacity-50 inline-flex items-center gap-2">
                {importing && <Upload className="w-4 h-4 animate-pulse" />}Import
              </button>
            </div>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 dark:bg-slate-800/40 p-3 text-xs text-slate-500">
            <p className="font-medium text-slate-600 mb-1">Format — an array of:</p>
            <pre className="whitespace-pre-wrap text-[11px] leading-relaxed">{`[
  {
    "title": "Required",
    "body": "Required. Plain text or simple HTML.",
    "type": "feature | improvement | fix",   // default: feature
    "audience": ["admin","mentor","mentee"],  // default: all
    "isMajor": false,                          // pops the one-time modal
    "actionUrl": "/mentor/roadmaps",           // optional
    "actionLabel": "Open",                     // optional
    "publish": true                            // optional, per-item
  }
]`}</pre>
          </div>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            rows={16}
            spellCheck={false}
            placeholder='Paste your JSON here…'
            className="w-full border border-slate-300 rounded-xl p-3 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-brand-500 resize-y"
          />
        </div>
      </Drawer>
    </div>
  );
}
