'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, RefreshCw, Mail, AlertTriangle, Ban, RotateCcw } from 'lucide-react';
import { emailAdminApi, type FailedEmail, type SuppressedEntry } from '@/lib/services/email-admin-api';
import { formatDateTime } from '@/lib/utils/datetime';

const STATUS_TABS = ['dead', 'pending', 'sent', 'sending'] as const;
type StatusTab = typeof STATUS_TABS[number];

export default function AdminEmailQueue() {
  const [stats, setStats] = useState<{ byStatus: Record<string, number>; suppressed: number } | null>(null);
  const [tab, setTab] = useState<StatusTab>('dead');
  const [emails, setEmails] = useState<FailedEmail[]>([]);
  const [suppressed, setSuppressed] = useState<SuppressedEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, l, sup] = await Promise.all([
        emailAdminApi.stats(),
        emailAdminApi.list(tab),
        emailAdminApi.suppressed(),
      ]);
      setStats(s.data ?? null);
      setEmails(l.data?.emails ?? []);
      setSuppressed(sup.data?.suppressed ?? []);
    } catch {
      toast.error('Could not load the email queue');
    } finally { setLoading(false); }
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  const retry = async (id: string) => {
    setBusy(id);
    try { await emailAdminApi.retry(id); toast.success('Requeued'); load(); }
    catch { toast.error('Could not requeue'); } finally { setBusy(null); }
  };
  const retryAll = async () => {
    setBusy('all');
    try { const r = await emailAdminApi.retryAllDead(); toast.success(`Requeued ${r.data?.requeued ?? ''} dead emails`); load(); }
    catch { toast.error('Could not requeue'); } finally { setBusy(null); }
  };
  const unsuppress = async (email: string) => {
    setBusy(email);
    try { await emailAdminApi.unsuppress(email); toast.success('Removed from suppression'); load(); }
    catch { toast.error('Could not update'); } finally { setBusy(null); }
  };

  const COUNT_CARDS: { key: string; label: string; cls: string }[] = [
    { key: 'pending', label: 'Pending', cls: 'text-amber-600 bg-amber-50' },
    { key: 'sent', label: 'Sent', cls: 'text-emerald-600 bg-emerald-50' },
    { key: 'sending', label: 'Sending', cls: 'text-sky-600 bg-sky-50' },
    { key: 'dead', label: 'Dead (DLQ)', cls: 'text-red-600 bg-red-50' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-slate-900 mb-1 flex items-center gap-2"><Mail className="w-5 h-5 text-brand-600" />Email queue</h1>
          <p className="text-slate-600">Delivery health, the dead-letter queue, and the suppression list.</p>
        </div>
        <button onClick={load} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-card px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"><RefreshCw className="w-4 h-4" />Refresh</button>
      </div>

      {/* Status counts */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {COUNT_CARDS.map((c) => (
          <div key={c.key} className="bg-card rounded-2xl border border-slate-200 p-4">
            <div className={`inline-flex w-8 h-8 rounded-lg items-center justify-center text-xs font-bold ${c.cls}`}>{stats?.byStatus?.[c.key] ?? 0}</div>
            <p className="mt-2 text-sm text-slate-500">{c.label}</p>
          </div>
        ))}
        <div className="bg-card rounded-2xl border border-slate-200 p-4">
          <div className="inline-flex w-8 h-8 rounded-lg items-center justify-center text-xs font-bold text-slate-600 bg-slate-100"><Ban className="w-4 h-4" /></div>
          <p className="mt-2 text-sm text-slate-500">{stats?.suppressed ?? 0} suppressed</p>
        </div>
      </div>

      {/* Queue rows */}
      <div className="bg-card rounded-2xl border border-slate-200">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
            {STATUS_TABS.map((s) => (
              <button key={s} onClick={() => setTab(s)} className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${tab === s ? 'bg-card text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>{s}</button>
            ))}
          </div>
          {tab === 'dead' && emails.length > 0 && (
            <button onClick={retryAll} disabled={busy === 'all'} className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
              {busy === 'all' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}Requeue all dead
            </button>
          )}
        </div>
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-brand-600" /></div>
        ) : emails.length === 0 ? (
          <div className="py-16 text-center text-slate-500 text-sm">Nothing in “{tab}”.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {emails.map((e) => (
              <div key={e.id} className="px-5 py-3 flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-slate-900 truncate">{e.recipientEmail}</p>
                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{e.emailType}</span>
                    {e.errorCategory && <span className={`text-[11px] px-1.5 py-0.5 rounded ${e.errorCategory === 'permanent' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700'}`}>{e.errorCategory}</span>}
                  </div>
                  <p className="text-xs text-slate-500 truncate">{e.subject}</p>
                  {e.lastError && <p className="mt-0.5 text-xs text-red-500 flex items-center gap-1"><AlertTriangle className="w-3 h-3 shrink-0" />{e.lastError}</p>}
                  <p className="mt-0.5 text-[11px] text-slate-400">attempt {e.attemptCount}/{e.maxAttempts} · {formatDateTime(e.failedAt || e.createdAt)}</p>
                </div>
                {(tab === 'dead' || tab === 'pending') && (
                  <button onClick={() => retry(e.id)} disabled={busy === e.id} className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-brand-300 disabled:opacity-50">
                    {busy === e.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}Requeue
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Suppression list */}
      <div className="bg-card rounded-2xl border border-slate-200">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
          <Ban className="w-4 h-4 text-slate-500" /><h3 className="text-slate-900 font-medium">Suppressed addresses</h3>
          <span className="text-xs text-slate-400">won’t be mailed (hard bounce / complaint)</span>
        </div>
        {suppressed.length === 0 ? (
          <div className="py-10 text-center text-slate-500 text-sm">No suppressed addresses.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {suppressed.map((s) => (
              <div key={s.id} className="px-5 py-3 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 truncate">{s.email}</p>
                  <p className="text-xs text-slate-500">{s.reason}{s.detail ? ` · ${s.detail}` : ''} · {s.source || 'manual'}</p>
                </div>
                <button onClick={() => unsuppress(s.email)} disabled={busy === s.email} className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-brand-300 disabled:opacity-50">
                  {busy === s.email ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
