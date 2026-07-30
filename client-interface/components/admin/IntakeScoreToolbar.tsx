'use client';

import { useRef, useState } from 'react';
import { Download, Upload, Sparkles, Loader2, X, AlertTriangle, Check, Send, MailCheck, Layers, Users2 } from 'lucide-react';
import { toast } from 'sonner';
import { applicationApi } from '@/lib/services/intake-api';
import { AssignToClansDrawer } from '@/components/admin/AssignToClansDrawer';
import { AiScoringPreflight } from '@/components/admin/AiScoringPreflight';

interface InviteResult { invited: { id: string; email?: string }[]; skipped: { id: string; email?: string; reason: string }[]; }

interface ImportChange {
  applicationId: string;
  name: string;
  email: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}
interface ImportPreview {
  summary: { totalRows: number; willUpdate: number; unchanged: number; errors: number };
  changes: ImportChange[];
  errors: { line: number; reason: string }[];
}

/**
 * Score tooling for a cohort's applications: Export to CSV, AI-score selected
 * applicants (batched with progress), and Import an edited sheet (preview →
 * confirm). Kept out of the big page so it stays low-risk and testable.
 */
export function IntakeScoreToolbar({
  cohortId, cohortName, selectedIds, visibleIds, onDone,
}: {
  cohortId: string;
  cohortName: string;
  selectedIds: string[];
  /** The rows currently matching the filters — what "Export CSV" writes out. */
  visibleIds?: string[];
  onDone: () => void;
}) {
  const [exporting, setExporting] = useState(false);
  const [aiProgress, setAiProgress] = useState<{ done: number; total: number } | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [pendingCsv, setPendingCsv] = useState<string>('');
  const [applying, setApplying] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // Invite flow: confirm gate → batched send with progress → result summary.
  const [confirmInvite, setConfirmInvite] = useState(false);
  const [inviteProgress, setInviteProgress] = useState<{ done: number; total: number } | null>(null);
  const [inviteResult, setInviteResult] = useState<InviteResult | null>(null);
  // AI scoring always goes through a pre-flight so it's never a black box.
  const [preflight, setPreflight] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [levelProgress, setLevelProgress] = useState<{ done: number; total: number } | null>(null);

  // Recommend levels for the selection — batched, resilient, same shape as AI scoring.
  const doRecommendLevels = async () => {
    if (!selectedIds.length) return;
    const CHUNK = 5;
    let done = 0, ok = 0, skipped = 0;
    setLevelProgress({ done: 0, total: selectedIds.length });
    try {
      for (let i = 0; i < selectedIds.length; i += CHUNK) {
        const batch = selectedIds.slice(i, i + CHUNK);
        try {
          const res = await applicationApi.recommendLevels(cohortId, batch) as { data?: { results?: { recommended: boolean }[] } };
          for (const r of (res?.data?.results || [])) r.recommended ? ok++ : skipped++;
        } catch { skipped += batch.length; }
        done += batch.length;
        setLevelProgress({ done, total: selectedIds.length });
      }
      toast.success(`Levels checked for ${ok}${skipped ? ` · ${skipped} skipped` : ''}`);
      onDone();
    } finally { setLevelProgress(null); }
  };

  const doExport = async () => {
    setExporting(true);
    try { await applicationApi.exportCsv(cohortId, cohortName, selectedIds.length ? selectedIds : visibleIds); }
    catch { toast.error('Export failed'); }
    finally { setExporting(false); }
  };

  // AI-score in small batches so a big cohort never times out; resilient + live progress.
  const doAiScore = async (opts: { applyScores: boolean; recommendLevels: boolean } = { applyScores: true, recommendLevels: true }) => {
    if (!selectedIds.length) return;
    const CHUNK = 5;
    let done = 0, graded = 0, skipped = 0, scored = 0, levelled = 0;
    setAiProgress({ done: 0, total: selectedIds.length });
    try {
      for (let i = 0; i < selectedIds.length; i += CHUNK) {
        const batch = selectedIds.slice(i, i + CHUNK);
        try {
          const res = await applicationApi.aiGrade(cohortId, batch, opts) as { data?: { results?: { graded: boolean; applied?: boolean; levelChecked?: boolean }[] } };
          for (const r of (res?.data?.results || [])) {
            r.graded ? graded++ : skipped++;
            if (r.applied) scored++;
            if (r.levelChecked) levelled++;
          }
        } catch { skipped += batch.length; }
        done += batch.length;
        setAiProgress({ done, total: selectedIds.length });
      }
      const bits = [`${graded} reviewed`];
      if (scored) bits.push(`${scored} scored`);
      if (levelled) bits.push(`${levelled} level-checked`);
      if (skipped) bits.push(`${skipped} skipped (no submission)`);
      toast.success(bits.join(' · '));
      onDone();
    } finally {
      setAiProgress(null);
    }
  };

  const onFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) { toast.error('Please choose the exported .csv'); return; }
    const reader = new FileReader();
    reader.onload = async (e) => {
      const csv = String(e.target?.result || '');
      setPendingCsv(csv);
      try {
        const res = await applicationApi.previewScoreImport(cohortId, csv) as { data?: ImportPreview };
        if (res?.data) setPreview(res.data);
      } catch { toast.error('Could not read that sheet'); }
    };
    reader.readAsText(file);
  };

  // Send invites in batches so a big selection can't time out; accumulate results.
  const sendInvites = async () => {
    setConfirmInvite(false);
    const CHUNK = 25;
    const invited: InviteResult['invited'] = [];
    const skipped: InviteResult['skipped'] = [];
    setInviteProgress({ done: 0, total: selectedIds.length });
    try {
      for (let i = 0; i < selectedIds.length; i += CHUNK) {
        const batch = selectedIds.slice(i, i + CHUNK);
        try {
          const res = await applicationApi.bulkAccept(cohortId, batch) as { data?: InviteResult };
          invited.push(...(res?.data?.invited || []));
          skipped.push(...(res?.data?.skipped || []));
        } catch {
          skipped.push(...batch.map((id) => ({ id, reason: 'request failed' })));
        }
        setInviteProgress({ done: Math.min(i + CHUNK, selectedIds.length), total: selectedIds.length });
      }
      setInviteResult({ invited, skipped });
      onDone();
    } finally {
      setInviteProgress(null);
    }
  };

  const applyImport = async () => {
    setApplying(true);
    try {
      const res = await applicationApi.applyScoreImport(cohortId, pendingCsv) as { data?: { updated: number; errors: unknown[] } };
      toast.success(`Updated ${res?.data?.updated ?? 0} applicant${(res?.data?.updated ?? 0) === 1 ? '' : 's'}`);
      setPreview(null); setPendingCsv(''); onDone();
    } catch { toast.error('Import failed'); }
    finally { setApplying(false); }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        {selectedIds.length > 0 && (
          <button
            onClick={() => setPreflight(true)}
            disabled={!!aiProgress}
            className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-medium text-violet-700 hover:bg-violet-100 disabled:opacity-60"
          >
            {aiProgress ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {aiProgress ? `AI reviewing ${aiProgress.done}/${aiProgress.total}…` : `AI review (${selectedIds.length})`}
          </button>
        )}
        {selectedIds.length > 0 && (
          <button
            onClick={doRecommendLevels}
            disabled={!!levelProgress}
            title="Check each applicant's level against your criteria, using evidence from their own answers"
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-60"
          >
            {levelProgress ? <Loader2 className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
            {levelProgress ? `Checking ${levelProgress.done}/${levelProgress.total}…` : `Check levels (${selectedIds.length})`}
          </button>
        )}
        <button onClick={doExport} disabled={exporting} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:border-brand-300 hover:text-brand-700 disabled:opacity-60">
          {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Export CSV{selectedIds.length ? ` (${selectedIds.length})` : visibleIds && visibleIds.length ? ` (${visibleIds.length})` : ''}
        </button>
        <button onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:border-brand-300 hover:text-brand-700">
          <Upload className="w-4 h-4" /> Import scores
        </button>
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); if (fileRef.current) fileRef.current.value = ''; }} />
        {selectedIds.length > 0 && (
          <button
            onClick={() => setAssignOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            <Users2 className="w-4 h-4" /> Assign to clans ({selectedIds.length})
          </button>
        )}
        {selectedIds.length > 0 && (
          <button
            onClick={() => setConfirmInvite(true)}
            disabled={!!inviteProgress}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {inviteProgress ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {inviteProgress ? `Sending ${inviteProgress.done}/${inviteProgress.total}…` : `Send invites (${selectedIds.length})`}
          </button>
        )}
      </div>

      {assignOpen && (
        <AssignToClansDrawer
          cohortId={cohortId}
          applicationIds={selectedIds}
          onClose={() => setAssignOpen(false)}
          onDone={() => { setAssignOpen(false); onDone(); }}
        />
      )}

      {preflight && (
        <AiScoringPreflight
          cohortId={cohortId}
          applicationIds={selectedIds}
          onClose={() => setPreflight(false)}
          onRun={(opts) => { setPreflight(false); doAiScore(opts); }}
        />
      )}

      {/* Irreversible action — always confirm, showing exactly how many emails. */}
      {confirmInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setConfirmInvite(false)}>
          <div className="w-full max-w-md rounded-2xl bg-card shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 text-emerald-700">
              <Send className="w-5 h-5" /><h3 className="font-semibold text-slate-900">Send {selectedIds.length} invite{selectedIds.length === 1 ? '' : 's'}?</h3>
            </div>
            <p className="mt-3 text-sm text-slate-600">
              This <strong>emails each selected applicant</strong> a magic link to join the program, marks them <strong>accepted</strong>, and <strong>cannot be undone</strong>.
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Anyone already accepted, already registered, or withdrawn is skipped automatically — so it's safe to run more than once.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setConfirmInvite(false)} className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-700">Cancel</button>
              <button onClick={sendInvites} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700">
                <Send className="w-4 h-4" /> Send {selectedIds.length} invite{selectedIds.length === 1 ? '' : 's'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Result summary after sending. */}
      {inviteResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setInviteResult(null)}>
          <div className="w-full max-w-lg max-h-[85vh] overflow-hidden rounded-2xl bg-card shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <div className="flex items-center gap-2 text-emerald-700"><MailCheck className="w-5 h-5" /><h3 className="font-semibold text-slate-900">Invites sent</h3></div>
              <button onClick={() => setInviteResult(null)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-5 py-3 flex flex-wrap gap-4 text-sm border-b border-slate-100">
              <span className="text-emerald-700 font-medium">{inviteResult.invited.length} invited</span>
              {inviteResult.skipped.length > 0 && <span className="text-slate-500">{inviteResult.skipped.length} skipped</span>}
            </div>
            {inviteResult.skipped.length > 0 && (
              <div className="overflow-y-auto p-5 space-y-1 text-xs">
                <p className="text-slate-500 mb-1">Skipped:</p>
                {inviteResult.skipped.slice(0, 40).map((s, i) => (
                  <p key={i} className="text-slate-600">{s.email || s.id} — <span className="text-slate-400">{s.reason}</span></p>
                ))}
                {inviteResult.skipped.length > 40 && <p className="text-slate-400">…and {inviteResult.skipped.length - 40} more</p>}
              </div>
            )}
            <div className="px-5 py-4 border-t border-slate-200 flex justify-end">
              <button onClick={() => setInviteResult(null)} className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700">Done</button>
            </div>
          </div>
        </div>
      )}

      {/* Import preview modal — nothing is written until "Apply". */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !applying && setPreview(null)}>
          <div className="w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-2xl bg-card shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h3 className="font-semibold text-slate-900">Review changes before applying</h3>
              <button onClick={() => !applying && setPreview(null)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>

            <div className="px-5 py-3 flex flex-wrap gap-4 text-sm border-b border-slate-100">
              <span className="text-slate-900 font-medium">{preview.summary.willUpdate} will update</span>
              <span className="text-slate-500">{preview.summary.unchanged} unchanged</span>
              {preview.summary.errors > 0 && <span className="text-rose-600 inline-flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> {preview.summary.errors} error{preview.summary.errors === 1 ? '' : 's'}</span>}
            </div>

            <div className="overflow-y-auto p-5 space-y-2">
              {preview.changes.length === 0 && preview.errors.length === 0 && (
                <p className="text-sm text-slate-500">Nothing to change — the sheet matches what's already saved.</p>
              )}
              {preview.changes.map((c) => (
                <div key={c.applicationId} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <p className="font-medium text-slate-900">{c.name} <span className="text-slate-400 font-normal">· {c.email}</span></p>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-600">
                    {Object.keys(c.after).map((k) => (
                      <span key={k}>
                        {k}: <span className="text-slate-400 line-through">{String(c.before[k] ?? '—')}</span> → <span className="text-slate-900 font-medium">{String(c.after[k])}</span>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              {preview.errors.length > 0 && (
                <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {preview.errors.slice(0, 12).map((e, i) => <p key={i}>Row {e.line}: {e.reason}</p>)}
                  {preview.errors.length > 12 && <p>…and {preview.errors.length - 12} more</p>}
                </div>
              )}
            </div>

            <div className="px-5 py-4 border-t border-slate-200 flex justify-end gap-2">
              <button onClick={() => setPreview(null)} disabled={applying} className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-700">Cancel</button>
              <button onClick={applyImport} disabled={applying || preview.summary.willUpdate === 0} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50">
                {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Apply {preview.summary.willUpdate} change{preview.summary.willUpdate === 1 ? '' : 's'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
