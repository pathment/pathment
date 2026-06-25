'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Bug, Lightbulb, MessageSquarePlus, Loader2, ExternalLink, Paperclip } from 'lucide-react';
import { PageHeader } from '@/components/admin/ui';
import { Drawer } from '@/components/shared/Drawer';
import { SelectMenu } from '@/components/shared/SelectMenu';
import { TablePagination } from '@/components/shared/TablePagination';
import { usePagination } from '@/lib/hooks/shared/usePagination';
import { feedbackApi, type FeedbackReport, type FeedbackStatus } from '@/lib/services/feedback-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';

const STATUS_CLS: Record<string, string> = {
  open: 'bg-slate-100 text-slate-600', in_review: 'bg-blue-100 text-blue-700',
  planned: 'bg-violet-100 text-violet-700', fixed: 'bg-emerald-100 text-emerald-700',
  added: 'bg-emerald-100 text-emerald-700', declined: 'bg-rose-100 text-rose-700',
};
const STATUS_OPTS = [
  { value: 'open', label: 'Open' }, { value: 'in_review', label: 'In review' },
  { value: 'planned', label: 'Planned' }, { value: 'fixed', label: 'Fixed' },
  { value: 'added', label: 'Added' }, { value: 'declined', label: 'Declined' },
];
const TYPE_ICON: Record<string, typeof Bug> = { bug: Bug, suggestion: Lightbulb, other: MessageSquarePlus };

export default function AdminFeedbackPage() {
  const [reports, setReports] = useState<FeedbackReport[]>([]);
  const [openCount, setOpenCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [selected, setSelected] = useState<FeedbackReport | null>(null);
  const pagination = usePagination({ initialPage: 1, initialLimit: 25 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await feedbackApi.listAll({
        status: statusFilter === 'all' ? undefined : statusFilter,
        type: typeFilter === 'all' ? undefined : typeFilter,
        page: pagination.page, limit: pagination.limit,
      });
      setReports(r?.data?.reports ?? []);
      setOpenCount(r?.data?.openCount ?? 0);
      pagination.setTotal(r?.data?.total ?? 0);
    } catch (e) { toast.error(extractApiErrorMessage(e, 'Could not load feedback')); }
    finally { setLoading(false); }
  }, [statusFilter, typeFilter, pagination.page, pagination.limit]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  useEffect(() => { pagination.reset(); }, [statusFilter, typeFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6">
      <PageHeader title="Feedback" subtitle={`${openCount} open · user-reported bugs & suggestions`} backHref="/admin/dashboard" backLabel="Back to Dashboard" />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <SelectMenu value={statusFilter} onChange={setStatusFilter} ariaLabel="Filter by status" className="w-44"
          options={[{ value: 'all', label: 'All statuses' }, ...STATUS_OPTS]} />
        <SelectMenu value={typeFilter} onChange={setTypeFilter} ariaLabel="Filter by type" className="w-40"
          options={[{ value: 'all', label: 'All types' }, { value: 'bug', label: 'Bug' }, { value: 'suggestion', label: 'Suggestion' }, { value: 'other', label: 'Other' }]} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-600" /></div>
      ) : reports.length === 0 ? (
        <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center">
          <MessageSquarePlus className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600">No feedback {statusFilter !== 'all' || typeFilter !== 'all' ? 'matches these filters' : 'yet'}.</p>
        </div>
      ) : (
        <div className="bg-card rounded-2xl border border-slate-200 overflow-hidden">
          <div className="divide-y divide-slate-100">
            {reports.map((r) => {
              const Icon = TYPE_ICON[r.type] || MessageSquarePlus;
              return (
                <button key={r.id} onClick={() => setSelected(r)} className="w-full text-left flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors">
                  <Icon className="w-5 h-5 text-slate-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-900 truncate">{r.title}</p>
                      {r.attachmentUrl && <Paperclip className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                    </div>
                    <p className="text-xs text-slate-500 truncate">{r.reporter?.name || 'Unknown'}{r.reporter?.role ? ` (${r.reporter.role})` : ''} · {new Date(r.createdAt).toLocaleDateString()}</p>
                  </div>
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 ${STATUS_CLS[r.status] || ''}`}>{r.statusLabel}</span>
                </button>
              );
            })}
          </div>
          {pagination.total > pagination.limit && (
            <div className="px-5 py-3 border-t border-slate-100"><TablePagination pagination={pagination} /></div>
          )}
        </div>
      )}

      {selected && <FeedbackDetail report={selected} onClose={() => setSelected(null)} onSaved={() => { setSelected(null); load(); }} />}
    </div>
  );
}

function FeedbackDetail({ report, onClose, onSaved }: { report: FeedbackReport; onClose: () => void; onSaved: () => void }) {
  const [status, setStatus] = useState<FeedbackStatus>(report.status);
  const [note, setNote] = useState(report.resolutionNote ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await feedbackApi.update(report.id, { status, resolutionNote: note.trim() || undefined });
      toast.success('Feedback updated — the reporter has been notified');
      onSaved();
    } catch (e) { toast.error(extractApiErrorMessage(e, 'Could not update')); }
    finally { setSaving(false); }
  };

  return (
    <Drawer open onClose={onClose} width="lg" title={report.title} subtitle={`${report.typeLabel} · ${report.reporter?.name || 'Unknown'}`}
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm">Close</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium disabled:opacity-50 inline-flex items-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}Save & notify
          </button>
        </div>
      }>
      <div className="space-y-5">
        {report.description && <p className="text-sm text-slate-700 whitespace-pre-wrap">{report.description}</p>}

        {/* Attachment */}
        {report.attachmentUrl && (
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400 mb-1.5">Attachment</p>
            {report.attachmentType === 'image' ? (
              <a href={report.attachmentUrl} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={report.attachmentUrl} alt="attachment" className="max-h-72 rounded-xl border border-slate-200" />
              </a>
            ) : report.attachmentType === 'video' ? (
              <video src={report.attachmentUrl} controls className="max-h-72 w-full rounded-xl border border-slate-200 bg-black" />
            ) : (
              <a href={report.attachmentUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700">
                <Paperclip className="w-4 h-4" />{report.attachmentName || 'View attachment'}
              </a>
            )}
          </div>
        )}

        {/* Context */}
        <div className="rounded-xl bg-slate-50 border border-slate-100 px-3.5 py-3 space-y-1 text-xs text-slate-500">
          {report.pageUrl && <p><span className="font-medium text-slate-600">Page:</span> {report.pageUrl}</p>}
          {report.reporter?.email && <p><span className="font-medium text-slate-600">Reporter:</span> {report.reporter.email}</p>}
          {report.userAgent && <p className="truncate"><span className="font-medium text-slate-600">Browser:</span> {report.userAgent}</p>}
          <p><span className="font-medium text-slate-600">Submitted:</span> {new Date(report.createdAt).toLocaleString()}</p>
        </div>

        {/* Triage */}
        <div>
          <label className="block text-sm text-slate-700 mb-1.5">Status</label>
          <SelectMenu value={status} onChange={(v) => setStatus(v as FeedbackStatus)} options={STATUS_OPTS} ariaLabel="Set status" className="w-56" />
        </div>
        <div>
          <label className="block text-sm text-slate-700 mb-1.5">Reply to the reporter <span className="text-slate-400">(shown to them, sent by email)</span></label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3}
            placeholder="e.g. Fixed in the latest release — thanks for the report!"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
      </div>
    </Drawer>
  );
}
