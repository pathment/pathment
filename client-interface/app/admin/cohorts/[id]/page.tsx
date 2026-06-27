'use client';

import { use, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ArrowLeft, Upload, Loader2, X, CheckCircle2, XCircle, FileSpreadsheet,
  Mail, Phone, Check, Link2, Copy, Power, ClipboardCheck, Pencil, Eye, CopyPlus, FormInput, Plus,
  Trash2, CalendarRange, Layers,
} from 'lucide-react';
import {
  useCohortApplications,
  type Application,
  type ApplicationStatus,
} from '@/lib/hooks/admin';
import { cohortApi, applicationApi } from '@/lib/services/intake-api';
import { assessmentApi, type Assessment } from '@/lib/services/assessment-api';
import { IntakeFormBuilder } from '@/components/admin/IntakeFormBuilder';
import { AssessmentDrawer } from '@/components/admin/AssessmentDrawer';
import { Drawer } from '@/components/shared/Drawer';
import { getBrowserTimeZone } from '@/lib/utils/datetime';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import type { IntakeFormField } from '@/lib/config/intakeFields';

/** Same level-key normalization the server uses, so locally-derived keys match
 *  what the server stores (and the assessment pool's level tags line up). */
function normLevels(labels: string[]): { key: string; label: string }[] {
  const seen = new Set<string>();
  const out: { key: string; label: string }[] = [];
  for (const raw of labels) {
    const label = String(raw || '').trim();
    if (!label) continue;
    let key = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `level-${out.length + 1}`;
    if (seen.has(key)) { let n = 2; while (seen.has(`${key}-${n}`)) n += 1; key = `${key}-${n}`; }
    seen.add(key);
    out.push({ key, label });
  }
  return out;
}

const STATUS_TABS: { key: ApplicationStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'under_review', label: 'Under review' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'waitlisted', label: 'Waitlisted' },
];

const STATUS_CHIP: Record<ApplicationStatus, string> = {
  pending:         'bg-slate-100 text-slate-600',
  assessment_sent: 'bg-blue-50 text-blue-700',
  under_review:    'bg-amber-50 text-amber-700',
  accepted:        'bg-emerald-50 text-emerald-700',
  rejected:        'bg-rose-50 text-rose-700',
  waitlisted:      'bg-purple-50 text-purple-700',
};

/** Minimal CSV → array of header→value objects (parses every column). */
function parseCsvToRows(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = (cols[idx] ?? '').trim(); });
    rows.push(row);
  }
  return rows;
}

function fullName(a: Application) {
  return `${a.firstName ?? ''} ${a.lastName ?? ''}`.trim() || a.email;
}

function ApplicationDrawer({
  app, onClose, onUpdate, onAccept, onReject,
}: {
  app: Application;
  onClose: () => void;
  onUpdate: (id: string, data: { status?: string; assessmentScore?: number; reviewerNotes?: string }) => Promise<void>;
  onAccept: (id: string) => Promise<void>;
  onReject: (id: string, reason?: string) => Promise<void>;
}) {
  const [score, setScore] = useState(app.assessmentScore != null ? String(app.assessmentScore) : '');
  const [notes, setNotes] = useState(app.reviewerNotes ?? '');
  const [busy, setBusy] = useState(false);
  const decided = app.status === 'accepted' || app.status === 'rejected';

  // Load the assessment submission (if any) for this application.
  const [detail, setDetail] = useState<any>(null);
  useEffect(() => {
    let active = true;
    applicationApi.get(app.id).then((res: any) => { if (active) setDetail(res?.data || null); }).catch(() => {});
    return () => { active = false; };
  }, [app.id]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };

  const responses = app.responses ?? {};
  const entries = Object.entries(responses).filter(([k]) => !['email', 'role'].includes(k.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30 dark:bg-black/70" onClick={onClose}>
      <div role="dialog" aria-modal="true" className="relative w-full max-w-lg h-full bg-card border-l border-slate-200 dark:border-slate-700 shadow-2xl dark:shadow-[-8px_0_30px_rgba(0,0,0,0.6)] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-slate-900 font-medium">{fullName(app)}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1"><Mail className="w-3 h-3" />{app.email}</span>
              {app.phone && <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{app.phone}</span>}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CHIP[app.status]}`}>{app.status.replace(/_/g, ' ')}</span>
            {app.level && <span className="inline-flex items-center gap-1 text-xs text-slate-500"><Layers className="w-3 h-3" />{app.level.replace(/-/g, ' ')}</span>}
            {app.programPreference && <span className="text-xs text-slate-500">wants: {app.programPreference}</span>}
            {app.user && <span className="text-xs text-emerald-600">· registered</span>}
          </div>

          {/* Review */}
          {!decided && (
            <div className="space-y-3 rounded-xl border border-slate-200 p-4">
              <p className="text-sm font-medium text-slate-700">Review</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Assessment score</label>
                  <input type="number" min={0} max={100} step="0.5" value={score} onChange={(e) => setScore(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
                <div className="flex items-end">
                  <select value={app.status} onChange={(e) => run(() => onUpdate(app.id, { status: e.target.value }))} disabled={busy} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                    <option value="pending">Pending</option>
                    <option value="assessment_sent">Assessment sent</option>
                    <option value="under_review">Under review</option>
                    <option value="waitlisted">Waitlisted</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Reviewer notes</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <button
                onClick={() => run(() => onUpdate(app.id, { assessmentScore: score === '' ? undefined : Number(score), reviewerNotes: notes }))}
                disabled={busy}
                className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700"
              >
                <Check className="w-4 h-4" /> Save review
              </button>
            </div>
          )}

          {/* Intake answers */}
          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">Application details</p>
            {entries.length === 0 ? (
              <p className="text-sm text-slate-400">No additional fields.</p>
            ) : (
              <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {entries.map(([k, v]) => (
                  <div key={k} className="flex gap-3 px-3 py-2">
                    <dt className="w-40 shrink-0 text-xs font-medium text-slate-500 capitalize">{k.replace(/_/g, ' ')}</dt>
                    <dd className="text-sm text-slate-700 break-words">{String(v ?? '') || '-'}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          {/* Assessment submission */}
          {detail?.submission && detail?.assessment && (
            <AssessmentSubmissionView assessment={detail.assessment} submission={detail.submission} />
          )}
        </div>

        {!decided && (
          <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-2">
            <button onClick={() => run(() => onReject(app.id))} disabled={busy} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm border border-rose-200 text-rose-700 hover:bg-rose-50 rounded-lg">
              <XCircle className="w-4 h-4" /> Reject
            </button>
            <button onClick={() => run(() => onAccept(app.id))} disabled={busy} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Accept & invite
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Admissions settings: program schedule + capacity, the public link + apply
 *  window, applicant levels, the form, and the level-aware assessment pool. */
function IntakePanel({ cohortId, cohort, onChange }: { cohortId: string; cohort: any; onChange: () => void }) {
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [otherCohorts, setOtherCohorts] = useState<{ id: string; name: string }[]>([]);
  const [required, setRequired] = useState<boolean>(Boolean(cohort?.assessmentRequired));
  const [seats, setSeats] = useState<string>(cohort?.capacity != null ? String(cohort.capacity) : '');
  const [maxApps, setMaxApps] = useState<string>(cohort?.maxApplications != null ? String(cohort.maxApplications) : '');
  const [opensDate, setOpensDate] = useState<string>(cohort?.applyOpensAt ? String(cohort.applyOpensAt).slice(0, 10) : '');
  const [closesDate, setClosesDate] = useState<string>(cohort?.applyClosesAt ? String(cohort.applyClosesAt).slice(0, 10) : '');
  const [levelLabels, setLevelLabels] = useState<string[]>((cohort?.levels || []).map((l: any) => l.label));
  const [pool, setPool] = useState<{ assessmentId: string; level: string | null }[]>([]);
  const [formFields, setFormFields] = useState<IntakeFormField[]>(cohort?.intakeFormSchema || []);
  const [showPreview, setShowPreview] = useState(false);
  const [cloneFrom, setCloneFrom] = useState('');
  const [busy, setBusy] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [builderTarget, setBuilderTarget] = useState<string | null>(null);

  const tz = getBrowserTimeZone();
  const levelOptions = normLevels(levelLabels);
  const publishedAssessments = assessments.filter((a) => a.status === 'published');
  const titleById = (id: string) => assessments.find((a) => a.id === id)?.title || 'assessment';

  const reloadPool = () => cohortApi.getAssessments(cohortId)
    .then((res) => setPool((res?.data?.pool || []).map((p) => ({ assessmentId: p.assessmentId, level: p.level }))))
    .catch(() => {});

  useEffect(() => { assessmentApi.list().then(setAssessments).catch(() => {}); }, []);
  useEffect(() => { reloadPool(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [cohortId]);
  useEffect(() => {
    cohortApi.list().then((res: any) => {
      const list = (res?.data?.cohorts || []).filter((c: any) => c.id !== cohortId).map((c: any) => ({ id: c.id, name: c.name }));
      setOtherCohorts(list);
    }).catch(() => {});
  }, [cohortId]);
  useEffect(() => {
    setRequired(Boolean(cohort?.assessmentRequired));
    setSeats(cohort?.capacity != null ? String(cohort.capacity) : '');
    setMaxApps(cohort?.maxApplications != null ? String(cohort.maxApplications) : '');
    setOpensDate(cohort?.applyOpensAt ? String(cohort.applyOpensAt).slice(0, 10) : '');
    setClosesDate(cohort?.applyClosesAt ? String(cohort.applyClosesAt).slice(0, 10) : '');
    setLevelLabels((cohort?.levels || []).map((l: any) => l.label));
    setFormFields(cohort?.intakeFormSchema || []);
  }, [cohort?.assessmentRequired, cohort?.capacity, cohort?.maxApplications, cohort?.applyOpensAt, cohort?.applyClosesAt, cohort?.levels, cohort?.intakeFormSchema]);

  const enabled = Boolean(cohort?.publicEnabled && cohort?.publicSlug);
  const applyUrl = cohort?.publicSlug && typeof window !== 'undefined' ? `${window.location.origin}/apply/${cohort.publicSlug}` : '';
  const isOpen = cohort?.status === 'open';

  const toggleLink = async () => {
    setBusy(true);
    try {
      if (enabled) { await cohortApi.disablePublicLink(cohortId); toast.success('Public link disabled'); }
      else { await cohortApi.enablePublicLink(cohortId); toast.success('Public link enabled'); }
      onChange();
    } catch { toast.error('Could not update the link'); }
    finally { setBusy(false); }
  };

  const updatePool = (i: number, patch: Partial<{ assessmentId: string; level: string | null }>) =>
    setPool((prev) => prev.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));

  const saveSettings = async () => {
    setBusy(true);
    try {
      await cohortApi.update(cohortId, {
        capacity: seats === '' ? null : Number(seats),
        maxApplications: maxApps === '' ? null : Number(maxApps),
        timezone: tz,
        // Send the calendar dates + zone; the server stores start/end-of-day instants.
        applyOpensDate: opensDate || null,
        applyClosesDate: closesDate || null,
        assessmentRequired: required,
        levels: levelLabels.map((l) => ({ label: l })).filter((l) => l.label.trim()),
        // Drop blank options so empty choices never reach the apply form.
        intakeFormSchema: formFields.map((f) => (
          f.options ? { ...f, options: f.options.map((o) => o.trim()).filter(Boolean) } : f
        )),
      });
      // Save the assessment pool (level tags dropped if their level no longer exists).
      const validKeys = new Set(levelOptions.map((o) => o.key));
      const items = pool
        .filter((p) => p.assessmentId)
        .map((p) => ({ assessmentId: p.assessmentId, level: p.level && validKeys.has(p.level) ? p.level : null }));
      await cohortApi.setAssessments(cohortId, items);
      toast.success('Admissions settings saved');
      onChange();
      reloadPool();
    } catch (e) { toast.error(extractApiErrorMessage(e, 'Could not save settings')); }
    finally { setBusy(false); }
  };

  // Build a brand-new assessment (added to the pool) or edit one in the pool.
  const openNewBuilder = () => { setBuilderTarget(null); setBuilderOpen(true); };
  const openEditBuilder = (id: string) => { setBuilderTarget(id); setBuilderOpen(true); };

  const onAssessmentSaved = async (a: Assessment) => {
    await assessmentApi.list().then(setAssessments).catch(() => {});
    // A freshly-built assessment joins the pool (level-less) so it's not lost.
    setPool((prev) => prev.some((p) => p.assessmentId === a.id) ? prev : [...prev, { assessmentId: a.id, level: null }]);
  };

  const onAssessmentDeleted = async () => {
    if (builderTarget) setPool((prev) => prev.filter((p) => p.assessmentId !== builderTarget));
    await assessmentApi.list().then(setAssessments).catch(() => {});
  };

  const doClone = async () => {
    if (!cloneFrom) return;
    setBusy(true);
    try {
      await cohortApi.cloneIntake(cohortId, cloneFrom);
      toast.success('Copied form + assessment from the selected cohort');
      setCloneFrom('');
      onChange();
    } catch { toast.error('Could not copy intake'); }
    finally { setBusy(false); }
  };

  const field = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500';

  return (
    <div className="rounded-2xl border border-slate-200 bg-card p-5 space-y-5">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="w-4 h-4 text-brand-600" />
        <h2 className="font-medium text-slate-900">Admissions settings</h2>
      </div>

      {/* Capacity (the application window itself is set below) */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Seats <span className="text-slate-400 font-normal">— how many you&apos;ll enroll</span></label>
          <input type="number" min={1} value={seats} onChange={(e) => setSeats(e.target.value)} placeholder="Unlimited" className={field} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Application limit <span className="text-slate-400 font-normal">— blank = unlimited</span></label>
          <input type="number" min={1} value={maxApps} onChange={(e) => setMaxApps(e.target.value)} placeholder="Unlimited" className={field} />
        </div>
      </div>

      {/* Public link */}
      <div className="border-t border-slate-100 pt-4">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-brand-600" />
            <h3 className="text-sm font-medium text-slate-900">Public application link</h3>
          </div>
          <button
            onClick={toggleLink}
            disabled={busy}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${enabled ? 'border border-slate-200 text-slate-700 hover:bg-slate-100' : 'bg-brand-600 text-white hover:bg-brand-700'}`}
          >
            <Power className="w-4 h-4" /> {enabled ? 'Disable' : 'Enable link'}
          </button>
        </div>

        {enabled ? (
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-700">{applyUrl}</code>
            <button onClick={() => { navigator.clipboard?.writeText(applyUrl); toast.success('Link copied'); }} className="p-2 rounded-lg border border-slate-200 hover:bg-slate-100" aria-label="Copy link"><Copy className="w-4 h-4" /></button>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Enable to mint a shareable link anyone can apply through.</p>
        )}

        {enabled && !isOpen && (
          <p className="mt-2 text-xs rounded-lg bg-amber-50 text-amber-800 px-3 py-2">
            The link only accepts applications while the cohort status is <strong>Open</strong> (currently {cohort?.status}).
          </p>
        )}

        <div className="grid sm:grid-cols-2 gap-4 pt-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Apply opens</label>
            <input type="date" value={opensDate} onChange={(e) => setOpensDate(e.target.value)} className={`${field} [color-scheme:light] dark:[color-scheme:dark]`} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Apply closes</label>
            <input type="date" value={closesDate} onChange={(e) => setClosesDate(e.target.value)} className={`${field} [color-scheme:light] dark:[color-scheme:dark]`} />
          </div>
        </div>
        <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-slate-400"><CalendarRange className="w-3 h-3" /> Closes at end-of-day in <strong className="font-medium">{tz}</strong>.</p>
      </div>

      {/* Clone from another cohort */}
      {otherCohorts.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
          <CopyPlus className="w-4 h-4 text-slate-400" />
          <span className="text-xs text-slate-600">Reuse setup from</span>
          <select value={cloneFrom} onChange={(e) => setCloneFrom(e.target.value)} className="flex-1 min-w-40 border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500">
            <option value="">another cohort…</option>
            {otherCohorts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button onClick={doClone} disabled={!cloneFrom || busy} className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50">Copy</button>
        </div>
      )}

      {/* Levels */}
      <div className="border-t border-slate-100 pt-4">
        <div className="flex items-center gap-2 mb-2">
          <Layers className="w-4 h-4 text-brand-600" />
          <h3 className="text-sm font-medium text-slate-900">Applicant levels <span className="text-slate-400 font-normal">(optional)</span></h3>
        </div>
        <p className="text-xs text-slate-500 mb-2">Add levels (e.g. Beginner, Level 1) and the apply form asks applicants to pick one — used to give the right assessment. Leave empty for no level question.</p>
        <div className="space-y-2">
          {levelLabels.map((label, i) => (
            <div key={i} className="flex items-center gap-2">
              <input value={label} onChange={(e) => setLevelLabels((prev) => prev.map((l, idx) => (idx === i ? e.target.value : l)))} placeholder={`Level ${i + 1}`} className={field} />
              <button onClick={() => setLevelLabels((prev) => prev.filter((_, idx) => idx !== i))} aria-label="Remove level" className="p-2 text-slate-400 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
          <button onClick={() => setLevelLabels((prev) => [...prev, ''])} className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-700 hover:text-brand-800"><Plus className="w-3.5 h-3.5" /> Add level</button>
        </div>
      </div>

      {/* Application form builder */}
      <div className="border-t border-slate-100 pt-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <FormInput className="w-4 h-4 text-brand-600" />
            <h3 className="text-sm font-medium text-slate-900">Application form</h3>
          </div>
          <button onClick={() => setShowPreview(true)} className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800">
            <Eye className="w-3.5 h-3.5" /> Preview
          </button>
        </div>
        <IntakeFormBuilder value={formFields} onChange={setFormFields} />
      </div>

      {/* Assessment pool */}
      <div className="border-t border-slate-100 pt-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-brand-600" />
            <h3 className="text-sm font-medium text-slate-900">Assessments</h3>
          </div>
          <button onClick={openNewBuilder} disabled={busy} className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-700 hover:text-brand-800">
            <Plus className="w-3.5 h-3.5" /> Create &amp; build
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-2">Attach one or more <em>published</em> assessments. Applicants get <strong>one at random</strong> from the pool matching their level (or the “Everyone” pool when they have no level).</p>
        <div className="space-y-2">
          {pool.map((row, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <select value={row.assessmentId} onChange={(e) => updatePool(i, { assessmentId: e.target.value })} className={`${field} flex-1 min-w-48`}>
                <option value="">Pick an assessment…</option>
                {publishedAssessments.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
                {/* Keep an already-selected, now-unpublished one visible. */}
                {row.assessmentId && !publishedAssessments.some((a) => a.id === row.assessmentId) && <option value={row.assessmentId}>{titleById(row.assessmentId)} (unpublished)</option>}
              </select>
              {levelOptions.length > 0 && (
                <select value={row.level ?? ''} onChange={(e) => updatePool(i, { level: e.target.value || null })} className={`${field} w-40`}>
                  <option value="">Everyone</option>
                  {levelOptions.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
                </select>
              )}
              {row.assessmentId && <button onClick={() => openEditBuilder(row.assessmentId)} aria-label="Edit assessment" className="p-2 text-slate-400 hover:text-brand-600"><Pencil className="w-4 h-4" /></button>}
              <button onClick={() => setPool((prev) => prev.filter((_, idx) => idx !== i))} aria-label="Remove" className="p-2 text-slate-400 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
          <button onClick={() => setPool((prev) => [...prev, { assessmentId: '', level: null }])} className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-700 hover:text-brand-800"><Plus className="w-3.5 h-3.5" /> Add assessment</button>
        </div>
        <label className="mt-3 inline-flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} disabled={pool.length === 0} className="accent-brand-600" />
          Required before review
        </label>
        <p className="mt-1 text-xs text-slate-400">Build reusable assessments in the <Link href="/admin/assessments" className="text-brand-600">Assessments library</Link>.</p>
      </div>

      <div className="flex justify-end">
        <button onClick={saveSettings} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} Save admissions settings
        </button>
      </div>

      <AssessmentDrawer
        open={builderOpen}
        assessmentId={builderTarget}
        onClose={() => setBuilderOpen(false)}
        onSaved={onAssessmentSaved}
        onDeleted={onAssessmentDeleted}
      />

      <Drawer
        open={showPreview}
        onClose={() => setShowPreview(false)}
        width="md"
        title="Application preview"
        subtitle="Exactly what an applicant sees on the apply page."
      >
        <ApplyFormPreview
          fields={formFields}
          levels={levelOptions}
          hasAssessment={pool.some((p) => p.assessmentId)}
          required={required}
        />
      </Drawer>
    </div>
  );
}

/** Read-only mock of exactly what an applicant will see on the apply page. */
function ApplyFormPreview({ fields, levels, hasAssessment, required }: { fields: IntakeFormField[]; levels: { key: string; label: string }[]; hasAssessment: boolean; required: boolean }) {
  const Row = ({ label, req, children }: { label: string; req?: boolean; children: React.ReactNode }) => (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}{req && <span className="text-rose-500"> *</span>}</label>
      {children}
    </div>
  );
  const Box = () => <div className="h-8 rounded-lg border border-slate-200 bg-slate-50" />;

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-canvas p-4 space-y-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-400">Applicant sees</p>
      <div className="grid grid-cols-2 gap-3">
        <Row label="First name"><Box /></Row>
        <Row label="Last name"><Box /></Row>
      </div>
      <Row label="Email" req><Box /></Row>
      {levels.length > 0 && (
        <Row label="Your level" req>
          <div className="h-8 rounded-lg border border-slate-200 bg-slate-50 flex items-center px-2 text-xs text-slate-400">{levels.map((l) => l.label).join(' / ')}</div>
        </Row>
      )}
      {fields.map((f) => (
        <Row key={f.key} label={f.label || '(untitled)'} req={f.required}>
          {f.type === 'textarea' ? <div className="h-14 rounded-lg border border-slate-200 bg-slate-50" />
            : f.type === 'checkboxes' ? <div className="text-xs text-slate-500">{(f.options || []).map((o) => `☐ ${o}`).join('   ') || '☐ option'}</div>
            : f.type === 'select' ? <div className="h-8 rounded-lg border border-slate-200 bg-slate-50 flex items-center px-2 text-xs text-slate-400">{(f.options || [])[0] || 'Select…'}</div>
            : f.type === 'yes_no' ? <div className="text-xs text-slate-500">○ Yes &nbsp; ○ No</div>
            : <Box />}
        </Row>
      ))}
      {hasAssessment && (
        <p className="text-xs rounded-lg bg-brand-50 dark:bg-brand-500/15 text-brand-800 px-3 py-2">
          + {required ? 'Required' : 'Optional'} assessment (one assigned at random after submitting)
        </p>
      )}
    </div>
  );
}

/** Read-only view of an applicant's assessment answers + manual grading. */
function AssessmentSubmissionView({ assessment, submission }: { assessment: any; submission: any }) {
  const [total, setTotal] = useState(submission.totalScore != null ? String(submission.totalScore) : '');
  const [busy, setBusy] = useState(false);
  const questions = (assessment.questions || []).slice().sort((a: any, b: any) => a.position - b.position);
  const answers = submission.answers || {};

  const renderAnswer = (q: any) => {
    const a = answers[q.id] || {};
    if (q.type === 'mcq' || q.type === 'multi_select') {
      const picked = (a.optionIds || []).map((oid: string) => (q.options || []).find((o: any) => o.id === oid)?.label).filter(Boolean);
      const correct = (q.correctOptionIds || []);
      const isRight = correct.length && a.optionIds && correct.length === a.optionIds.length && correct.every((c: string) => a.optionIds.includes(c));
      return (
        <span className={isRight ? 'text-emerald-700' : 'text-slate-700'}>
          {picked.length ? picked.join(', ') : '-'}{correct.length ? (isRight ? ' ✓' : ' ✗') : ''}
        </span>
      );
    }
    if (q.type === 'file_upload') return a.fileUrl ? <a href={a.fileUrl} target="_blank" rel="noreferrer" className="text-brand-600 underline">{a.fileName || 'View file'}</a> : <span className="text-slate-400">-</span>;
    if (q.type === 'external_link') return a.link ? <a href={a.link} target="_blank" rel="noreferrer" className="text-brand-600 underline break-all">{a.link}</a> : <span className="text-slate-400">-</span>;
    return <span className="text-slate-700 whitespace-pre-wrap">{a.text || '-'}</span>;
  };

  const saveGrade = async () => {
    setBusy(true);
    try {
      await applicationApi.gradeSubmission(submission.id, { totalScore: total === '' ? undefined : Number(total) });
      toast.success('Score saved');
    } catch { toast.error('Could not save score'); }
    finally { setBusy(false); }
  };

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-700">Assessment submission</p>
        <span className="text-xs text-slate-500">
          Auto {submission.autoScore ?? 0}/{submission.maxScore ?? 0}
          {submission.totalScore != null ? ` · Final ${submission.totalScore}` : ''}
        </span>
      </div>
      <div className="mt-3 space-y-3">
        {questions.map((q: any, i: number) => (
          <div key={q.id} className="text-sm">
            <p className="text-slate-500">{i + 1}. {q.prompt}</p>
            <div className="mt-0.5">{renderAnswer(q)}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-end gap-2">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Final score (override)</label>
          <input type="number" value={total} onChange={(e) => setTotal(e.target.value)} className="w-28 px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
        <button onClick={saveGrade} disabled={busy} className="px-3 py-1.5 rounded-lg bg-brand-600 text-white text-sm font-medium disabled:opacity-50 inline-flex items-center gap-1.5">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} Save score
        </button>
      </div>
    </div>
  );
}

export default function CohortReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const {
    cohort, applications, loading, statusFilter, setStatusFilter,
    refetch, importRows, updateApplication, acceptApplication, rejectApplication,
  } = useCohortApplications(id);

  const [open, setOpen] = useState<Application | null>(null);
  const [importing, setImporting] = useState(false);
  // Rows held back by the application cap — offer a one-click "import anyway".
  const [capHeld, setCapHeld] = useState<{ rows: Record<string, string>[]; skipped: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const runImport = async (rows: Record<string, string>[], allowExceed = false) => {
    setImporting(true);
    const report = await importRows(rows, allowExceed);
    setImporting(false);
    const capSkips = (report?.skipped || []).filter((s) => /application cap/i.test(s.reason)).length;
    if (!allowExceed && capSkips > 0) setCapHeld({ rows, skipped: capSkips });
    else setCapHeld(null);
  };

  const handleFile = (file: File) => {
    if (!file.name.endsWith('.csv')) { toast.error('Please upload a .csv file'); return; }
    const reader = new FileReader();
    reader.onload = async (e) => {
      const rows = parseCsvToRows(e.target?.result as string);
      if (rows.length === 0) { toast.error('No rows found. Ensure the CSV has a header row with an "email" column.'); return; }
      await runImport(rows);
    };
    reader.readAsText(file);
  };

  // Level key → label, for the applications table.
  const levelLabel = (key?: string | null) => (cohort?.levels || []).find((l) => l.key === key)?.label || key || '—';

  // Keep the open drawer in sync with refetched data.
  const liveOpen = open ? applications.find((a) => a.id === open.id) ?? open : null;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/cohorts" className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-4">
          <ArrowLeft className="w-5 h-5" /> Back to cohorts
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-slate-900">{cohort?.name ?? 'Cohort'}</h1>
            <p className="text-slate-600 text-sm">{cohort?.program?.name ?? ''}</p>
          </div>
          <div className="flex items-center gap-2">
            {cohort && (
              <select
                value={cohort.status}
                onChange={(e) => cohortApi.update(id, { status: e.target.value }).then(refetch).catch(() => toast.error('Failed to update status'))}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="planning">Planning</option>
                <option value="open">Open</option>
                <option value="closed">Closed</option>
                <option value="running">Running</option>
                <option value="completed">Completed</option>
              </select>
            )}
            <button onClick={() => fileRef.current?.click()} disabled={importing} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:bg-brand-400">
              {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Import CSV
            </button>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); if (fileRef.current) fileRef.current.value = ''; }} />
          </div>
        </div>
      </div>

      {/* Public intake link + assessment */}
      {cohort && <IntakePanel cohortId={id} cohort={cohort} onChange={refetch} />}

      {capHeld && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
          <span className="text-amber-800">{capHeld.skipped} row{capHeld.skipped === 1 ? '' : 's'} skipped — the cohort is at its application cap.</span>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => setCapHeld(null)} className="px-3 py-1.5 rounded-lg text-amber-800 hover:bg-amber-100 text-xs font-medium">Dismiss</button>
            <button onClick={() => runImport(capHeld.rows, true)} disabled={importing} className="px-3 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700 text-xs font-medium disabled:opacity-50 inline-flex items-center gap-1.5">
              {importing && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Import anyway (exceed cap)
            </button>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex flex-wrap items-center gap-0 border-b border-slate-200">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setStatusFilter(t.key)}
            className={`-mb-px border-b-2 px-3.5 py-2 text-sm font-medium transition-colors ${statusFilter === t.key ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-600" /></div>
      ) : applications.length === 0 ? (
        <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center">
          <FileSpreadsheet className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600">No applications here yet - import a CSV to bring applicants in.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-card">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="text-left font-medium px-4 py-3">Applicant</th>
                <th className="text-left font-medium px-4 py-3 hidden md:table-cell">Wants</th>
                {(cohort?.levels?.length ?? 0) > 0 && <th className="text-left font-medium px-4 py-3 hidden lg:table-cell">Level</th>}
                <th className="text-left font-medium px-4 py-3">Status</th>
                <th className="text-left font-medium px-4 py-3 hidden sm:table-cell">Score</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {applications.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setOpen(a)}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{fullName(a)}</p>
                    <p className="text-xs text-slate-500">{a.email}</p>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-slate-600">{a.programPreference || '-'}</td>
                  {(cohort?.levels?.length ?? 0) > 0 && <td className="px-4 py-3 hidden lg:table-cell text-slate-600">{a.level ? levelLabel(a.level) : '—'}</td>}
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CHIP[a.status]}`}>{a.status.replace(/_/g, ' ')}</span>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell text-slate-600">{a.assessmentScore != null ? a.assessmentScore : '-'}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-brand-600 text-xs font-medium">Review</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {liveOpen && (
        <ApplicationDrawer
          app={liveOpen}
          onClose={() => setOpen(null)}
          onUpdate={updateApplication}
          onAccept={acceptApplication}
          onReject={rejectApplication}
        />
      )}
    </div>
  );
}
