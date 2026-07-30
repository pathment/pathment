'use client';

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ArrowLeft, Upload, Loader2, X, CheckCircle2, XCircle, FileSpreadsheet,
  Mail, Phone, Check, Link2, Copy, Power, ClipboardCheck, Pencil, Eye, CopyPlus, FormInput, Plus,
  Trash2, CalendarRange, Layers, RefreshCw, CheckSquare, Square, Sparkles, Search, Settings, ChevronDown, Columns3,
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
import { IntakeScoreToolbar } from '@/components/admin/IntakeScoreToolbar';
import { LevelCriteriaEditor } from '@/components/admin/LevelCriteriaEditor';
import { Drawer } from '@/components/shared/Drawer';
import { getBrowserTimeZone } from '@/lib/utils/datetime';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import type { IntakeFormField } from '@/lib/config/intakeFields';

/** Same level-key normalization the server uses, so locally-derived keys match
 *  what the server stores (and the assessment pool's level tags line up). */
/** Split a stored UTC instant into local date + time (HH:MM) for the date/time inputs. */
function splitLocal(iso?: string | null): { date: string; time: string } {
  if (!iso) return { date: '', time: '' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: '', time: '' };
  const p = (n: number) => String(n).padStart(2, '0');
  return { date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, time: `${p(d.getHours())}:${p(d.getMinutes())}` };
}

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
  // Assigned an assessment but NOT submitted yet (was missing — rows showed this
  // status with no way to filter to them).
  { key: 'assessment_sent', label: 'Assessment sent' },
  { key: 'under_review', label: 'Submitted · to score' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'waitlisted', label: 'Waitlisted' },
  { key: 'withdrawn', label: 'Withdrawn' },
];

const STATUS_CHIP: Record<ApplicationStatus, string> = {
  pending:         'bg-slate-100 text-slate-600',
  assessment_sent: 'bg-blue-50 text-blue-700',
  under_review:    'bg-amber-50 text-amber-700',
  accepted:        'bg-emerald-50 text-emerald-700',
  rejected:        'bg-rose-50 text-rose-700',
  waitlisted:      'bg-purple-50 text-purple-700',
  withdrawn:       'bg-slate-200 text-slate-500',
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
  app, onClose, onUpdate, onAccept, onReject, levelLabel,
}: {
  app: Application;
  onClose: () => void;
  /** Level key → the admin's own label, for the placement panel. */
  levelLabel: (k: string) => string;
  onUpdate: (id: string, data: { status?: string; assessmentScore?: number; reviewerNotes?: string; decisionReason?: string }) => Promise<void>;
  onAccept: (id: string) => Promise<void>;
  onReject: (id: string, reason?: string) => Promise<void>;
}) {
  const [score, setScore] = useState(app.assessmentScore != null ? String(app.assessmentScore) : '');
  const [notes, setNotes] = useState(app.reviewerNotes ?? '');
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [decReason, setDecReason] = useState(app.decisionReason ?? '');
  const decided = app.status === 'accepted' || app.status === 'rejected';

  // Load the assessment submission (if any) for this application.
  const [detail, setDetail] = useState<any>(null);
  const reloadDetail = useCallback(() => {
    applicationApi.get(app.id).then((res: any) => setDetail(res?.data || null)).catch(() => {});
  }, [app.id]);
  useEffect(() => { reloadDetail(); }, [reloadDetail]);

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

          {/* Rejection reason — editable after a decision; shown to the applicant. */}
          {app.status === 'rejected' && (
            <div className="rounded-xl border border-rose-200 bg-rose-50/60 dark:bg-rose-500/10 p-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">Rejection reason <span className="text-slate-400 font-normal">(shown to the applicant)</span></label>
              <textarea value={decReason} onChange={(e) => setDecReason(e.target.value)} rows={3} placeholder="Add or edit the note the applicant sees." className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-rose-500 bg-card" />
              <div className="mt-2 flex justify-end">
                <button onClick={() => run(() => onUpdate(app.id, { decisionReason: decReason.trim() }))} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-rose-600 hover:bg-rose-700 text-white rounded-lg disabled:opacity-50">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}Save reason</button>
              </div>
            </div>
          )}

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

          {/* Level placement — evidence-backed, with the proof for each criterion */}
          {app.levelEvidence && (
            <LevelEvidencePanel app={app} levelLabel={levelLabel} onApplied={onClose} />
          )}

          {/* Assessment submission */}
          {detail?.submission && detail?.assessment && (
            <AssessmentSubmissionView assessment={detail.assessment} submission={detail.submission} onChanged={reloadDetail} />
          )}
        </div>

        {!decided && (
          <div className="px-6 py-4 border-t border-slate-200">
            {rejecting ? (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700">Reason for rejection <span className="text-slate-400 font-normal">(shown to the applicant)</span></label>
                <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} placeholder="e.g. A strong application, but we filled every spot at this level for this round." className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-rose-500" />
                <div className="flex justify-end gap-2">
                  <button onClick={() => setRejecting(false)} disabled={busy} className="px-4 py-2 text-sm border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50">Cancel</button>
                  <button onClick={() => run(() => onReject(app.id, rejectReason.trim() || undefined))} disabled={busy} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-rose-600 hover:bg-rose-700 text-white rounded-lg disabled:opacity-50">
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />} Confirm rejection
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex justify-end gap-2">
                <button onClick={() => setRejecting(true)} disabled={busy} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm border border-rose-200 text-rose-700 hover:bg-rose-50 rounded-lg">
                  <XCircle className="w-4 h-4" /> Reject
                </button>
                <button onClick={() => run(() => onAccept(app.id))} disabled={busy} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Accept & invite
                </button>
              </div>
            )}
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
  const [opensDate, setOpensDate] = useState<string>(splitLocal(cohort?.applyOpensAt).date);
  const [opensTime, setOpensTime] = useState<string>(splitLocal(cohort?.applyOpensAt).time);
  const [closesDate, setClosesDate] = useState<string>(splitLocal(cohort?.applyClosesAt).date);
  const [closesTime, setClosesTime] = useState<string>(splitLocal(cohort?.applyClosesAt).time);
  const [assessDeadlineDate, setAssessDeadlineDate] = useState<string>(splitLocal(cohort?.assessmentDeadline).date);
  const [assessDeadlineTime, setAssessDeadlineTime] = useState<string>(splitLocal(cohort?.assessmentDeadline).time);
  const [levelLabels, setLevelLabels] = useState<string[]>((cohort?.levels || []).map((l: any) => l.label));
  const [criteriaOpen, setCriteriaOpen] = useState(false);
  const [pool, setPool] = useState<{ assessmentId: string; level: string | null }[]>([]);
  const [formFields, setFormFields] = useState<IntakeFormField[]>(cohort?.intakeFormSchema || []);
  const [showPreview, setShowPreview] = useState(false);
  const [cloneFrom, setCloneFrom] = useState('');
  const [busy, setBusy] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [builderTarget, setBuilderTarget] = useState<string | null>(null);

  const tz = getBrowserTimeZone();
  // Today (local) as YYYY-MM-DD — the floor for the apply window. You can't open
  // applications in the past, and close must be today-or-later and on/after open.
  const todayStr = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
  const closesMin = [opensDate, todayStr].filter(Boolean).sort().pop() as string;
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
    setOpensDate(splitLocal(cohort?.applyOpensAt).date); setOpensTime(splitLocal(cohort?.applyOpensAt).time);
    setClosesDate(splitLocal(cohort?.applyClosesAt).date); setClosesTime(splitLocal(cohort?.applyClosesAt).time);
    setAssessDeadlineDate(splitLocal(cohort?.assessmentDeadline).date); setAssessDeadlineTime(splitLocal(cohort?.assessmentDeadline).time);
    setLevelLabels((cohort?.levels || []).map((l: any) => l.label));
    setFormFields(cohort?.intakeFormSchema || []);
  }, [cohort?.assessmentRequired, cohort?.capacity, cohort?.maxApplications, cohort?.applyOpensAt, cohort?.applyClosesAt, cohort?.assessmentDeadline, cohort?.levels, cohort?.intakeFormSchema]);

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
    // Apply window must be today-or-later, and close on/after open (the date
    // inputs also enforce this, but a typed value could slip past the picker).
    if (opensDate && opensDate < todayStr) { toast.error('Apply opens can’t be in the past'); return; }
    if (closesDate && closesDate < todayStr) { toast.error('Apply closes can’t be in the past'); return; }
    const openAt = opensDate ? `${opensDate}T${opensTime || '00:00'}` : '';
    const closeAt = closesDate ? `${closesDate}T${closesTime || '23:59'}` : '';
    if (openAt && closeAt && closeAt < openAt) { toast.error('Apply closes must be after Apply opens'); return; }
    if (assessDeadlineDate && assessDeadlineDate < todayStr) { toast.error('Assessment deadline can’t be in the past'); return; }
    setBusy(true);
    try {
      await cohortApi.update(cohortId, {
        capacity: seats === '' ? null : Number(seats),
        maxApplications: maxApps === '' ? null : Number(maxApps),
        timezone: tz,
        // Send the calendar dates (+ optional times) + zone; the server stores the
        // precise instants. No time → opens at start-of-day, closes at end-of-day.
        applyOpensDate: opensDate || null,
        applyOpensTime: opensTime || null,
        applyClosesDate: closesDate || null,
        applyClosesTime: closesTime || null,
        assessmentDeadlineDate: assessDeadlineDate || null,
        assessmentDeadlineTime: assessDeadlineTime || null,
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
            <div className="flex gap-2">
              <input type="date" min={todayStr} value={opensDate} onChange={(e) => setOpensDate(e.target.value)} className={`${field} flex-1 [color-scheme:light] dark:[color-scheme:dark]`} />
              <input type="time" value={opensTime} onChange={(e) => setOpensTime(e.target.value)} title="Time (default start of day)" className={`${field} w-28 [color-scheme:light] dark:[color-scheme:dark]`} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Apply closes</label>
            <div className="flex gap-2">
              <input type="date" min={closesMin} value={closesDate} onChange={(e) => setClosesDate(e.target.value)} className={`${field} flex-1 [color-scheme:light] dark:[color-scheme:dark]`} />
              <input type="time" value={closesTime} onChange={(e) => setClosesTime(e.target.value)} title="Time (default end of day)" className={`${field} w-28 [color-scheme:light] dark:[color-scheme:dark]`} />
            </div>
          </div>
        </div>
        <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-slate-400"><CalendarRange className="w-3 h-3" /> Times are in <strong className="font-medium">{tz}</strong>. Leave a time blank to default to start-of-day (opens) / end-of-day 11:59&nbsp;PM (closes).</p>
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

        {/* What qualifies someone for each level — drives the AI level check. */}
        {(cohort?.levels?.length ?? 0) > 1 && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/50 p-3">
            <button
              onClick={() => setCriteriaOpen((v) => !v)}
              aria-expanded={criteriaOpen}
              className="flex w-full items-center gap-2 text-left"
            >
              <h4 className="text-sm font-medium text-slate-900">Level criteria</h4>
              <span className="text-xs text-slate-500">what qualifies someone for each level</span>
              <ChevronDown className={`ml-auto w-4 h-4 text-slate-400 transition-transform ${criteriaOpen ? 'rotate-180' : ''}`} />
            </button>
            {criteriaOpen && (
              <div className="mt-3">
                <LevelCriteriaEditor cohortId={cohortId} />
              </div>
            )}
          </div>
        )}
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

        {/* Optional separate assessment deadline (defaults to the apply-closes date). */}
        <div className="mt-3 max-w-md">
          <label className="block text-xs font-medium text-slate-500 mb-1">Assessment deadline <span className="text-slate-400 font-normal">(optional — defaults to Apply closes)</span></label>
          <div className="flex gap-2">
            <input type="date" min={todayStr} value={assessDeadlineDate} onChange={(e) => setAssessDeadlineDate(e.target.value)} className={`${field} flex-1 [color-scheme:light] dark:[color-scheme:dark]`} />
            <input type="time" value={assessDeadlineTime} onChange={(e) => setAssessDeadlineTime(e.target.value)} title="Time (default end of day)" className={`${field} w-28 [color-scheme:light] dark:[color-scheme:dark]`} />
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Applicants can take / update the assessment until this time (in <strong className="font-medium">{tz}</strong>). Leave blank to use the apply-closes date.</p>
        </div>

        <p className="mt-3 text-xs text-slate-400">Build reusable assessments in the <Link href="/admin/assessments" className="text-brand-600">Assessments library</Link>.</p>
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
/** Shows WHY a level was recommended: each criterion with the applicant's own
 *  words as proof, plus a one-click apply. */
function LevelEvidencePanel({ app, levelLabel, onApplied }: { app: Application; levelLabel: (k: string) => string; onApplied: () => void }) {
  const ev = app.levelEvidence;
  const [busy, setBusy] = useState(false);
  if (!ev) return null;
  const differs = app.recommendedLevel && app.recommendedLevel !== app.level;
  const mark = (v: boolean | null) => (v === true ? '✓' : v === false ? '✗' : '?');
  const tone = (v: boolean | null) => (v === true ? 'text-emerald-600' : v === false ? 'text-rose-500' : 'text-slate-400');

  const apply = async () => {
    setBusy(true);
    try { await applicationApi.applyLevel(app.id); toast.success('Level updated'); onApplied(); }
    catch { toast.error('Could not apply the level'); }
    finally { setBusy(false); }
  };

  return (
    <div className={`rounded-xl border p-4 ${differs ? 'border-amber-200 bg-amber-50/60 dark:bg-amber-500/10' : 'border-slate-200'}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-slate-800">Level placement</p>
          <p className="mt-0.5 text-xs text-slate-600">
            They picked <strong>{levelLabel(ev.selfSelected || '') || ev.selfSelected || '—'}</strong>
            {' · '}evidence suggests <strong>{levelLabel(app.recommendedLevel || '') || app.recommendedLevel}</strong>
            {differs ? ' ⚠' : ' ✓'}
          </p>
        </div>
        {differs && (
          <button onClick={apply} disabled={busy} className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50">
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Apply {levelLabel(app.recommendedLevel || '') || app.recommendedLevel}
          </button>
        )}
      </div>

      {ev.evidenceThin && (
        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
          None of your {ev.criteriaCount ?? 0} criteria could be judged from what this applicant was asked — so this is a
          fallback placement, not a finding. Either the form/assessment doesn&apos;t ask about them, or the criteria need
          rewording (Admissions settings → Level criteria).
        </p>
      )}
      {ev.reason && <p className="mt-2 text-xs text-slate-700">{ev.reason}</p>}
      {ev.coherence && <p className="mt-1 text-xs text-amber-700">⚠ {ev.coherence}</p>}

      <div className="mt-3 space-y-1.5">
        {Object.entries(ev.criteria || {}).map(([key, c]) => (
          <div key={key} className="text-xs">
            <span className={`font-semibold ${tone(c.verdict)}`}>{mark(c.verdict)}</span>{' '}
            <span className="text-slate-700">{key.replace(/_/g, ' ')}</span>
            {c.quote && <p className="ml-4 mt-0.5 text-slate-500 italic">&ldquo;{c.quote}&rdquo;</p>}
            {!c.quote && c.note && <p className="ml-4 mt-0.5 text-slate-400">{c.note}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

function AssessmentSubmissionView({ assessment, submission, onChanged }: { assessment: any; submission: any; onChanged?: () => void }) {
  const [total, setTotal] = useState(submission.totalScore != null ? String(submission.totalScore) : '');
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState<'grade' | 'apply' | null>(null);
  const questions = (assessment.questions || []).slice().sort((a: any, b: any) => a.position - b.position);
  const answers = submission.answers || {};
  const ai = submission.aiDraft || null;
  const hasOpenEnded = questions.some((q: any) => q.type === 'short_text' || q.type === 'long_text');
  const hasAiScores = !!(ai && ai.perQuestion && Object.keys(ai.perQuestion).length);

  const runAi = async () => {
    setAiBusy('grade');
    try { await applicationApi.aiGradeSubmission(submission.id); toast.success('AI scored — review the suggestions'); onChanged?.(); }
    catch { toast.error('AI scoring failed — check Settings → AI Connections'); }
    finally { setAiBusy(null); }
  };
  const applyAi = async () => {
    setAiBusy('apply');
    try { await applicationApi.applyAi(submission.id); toast.success('AI scores applied'); onChanged?.(); }
    catch { toast.error('Could not apply AI scores'); }
    finally { setAiBusy(null); }
  };

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
      onChanged?.();
    } catch { toast.error('Could not save score'); }
    finally { setBusy(false); }
  };

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-700">Assessment submission</p>
          {(submission.submissionCount ?? 1) > 1 && (
            <p className="text-[11px] text-slate-400">Final version · applicant updated it {submission.submissionCount} times</p>
          )}
        </div>
        <span className="text-xs text-slate-500">
          Auto {submission.autoScore ?? 0}/{submission.maxScore ?? 0}
          {submission.totalScore != null ? ` · Final ${submission.totalScore}` : ''}
        </span>
      </div>
      {ai && ai.overall != null && (
        <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2">
          <p className="text-xs font-medium text-violet-800">AI overall fit: {ai.overall}/100</p>
          {ai.summary && <p className="mt-0.5 text-xs text-violet-700">{ai.summary}</p>}
        </div>
      )}
      <div className="mt-3 space-y-3">
        {questions.map((q: any, i: number) => {
          const per = ai && ai.perQuestion && ai.perQuestion[q.id];
          return (
            <div key={q.id} className="text-sm">
              <div className="flex items-start justify-between gap-2">
                <p className="text-slate-500">{i + 1}. {q.prompt}</p>
                {per && (
                  <span title={per.note || ''} className="shrink-0 rounded-full bg-violet-100 text-violet-700 px-1.5 py-0.5 text-[10px] font-semibold">
                    AI {per.suggestedPoints}/{q.points ?? 0}
                  </span>
                )}
              </div>
              <div className="mt-0.5">{renderAnswer(q)}</div>
              {per && per.note && <p className="mt-0.5 text-[11px] text-violet-500 italic">{per.note}</p>}
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Final score (override)</label>
          <input type="number" value={total} onChange={(e) => setTotal(e.target.value)} className="w-28 px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
        <button onClick={saveGrade} disabled={busy} className="px-3 py-1.5 rounded-lg bg-brand-600 text-white text-sm font-medium disabled:opacity-50 inline-flex items-center gap-1.5">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} Save score
        </button>
        {hasOpenEnded && (
          <button onClick={runAi} disabled={aiBusy !== null} className="px-3 py-1.5 rounded-lg border border-violet-200 bg-violet-50 text-violet-700 text-sm font-medium disabled:opacity-50 inline-flex items-center gap-1.5">
            {aiBusy === 'grade' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} {hasAiScores ? 'Re-run AI' : 'AI score'}
          </button>
        )}
        {hasAiScores && (
          <button onClick={applyAi} disabled={aiBusy !== null} className="px-3 py-1.5 rounded-lg bg-violet-600 text-white text-sm font-medium disabled:opacity-50 inline-flex items-center gap-1.5">
            {aiBusy === 'apply' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Apply AI → score
          </button>
        )}
      </div>
    </div>
  );
}

/** Inline "Pass ≥ N%" gate for the cohort — an applicant passes when their score
 *  reaches this percent of the assessment max. Blank removes the gate. */
function PassThresholdControl({ cohortId, value, onSaved }: { cohortId: string; value: number | null; onSaved: () => void }) {
  const [v, setV] = useState(value != null ? String(value) : '');
  const [saving, setSaving] = useState(false);
  useEffect(() => { setV(value != null ? String(value) : ''); }, [value]);
  const save = async () => {
    const trimmed = v.trim();
    const n = trimmed === '' ? null : Number(trimmed);
    if (n != null && (!Number.isFinite(n) || n < 0 || n > 100)) { toast.error('Pass % must be 0–100'); return; }
    if ((value ?? null) === n) return;
    setSaving(true);
    try { await cohortApi.update(cohortId, { passThreshold: n }); onSaved(); toast.success(n == null ? 'Pass gate removed' : `Pass set at ${n}%`); }
    catch { toast.error('Could not save pass threshold'); }
    finally { setSaving(false); }
  };
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600" title="Applicants at/above this % of the assessment max are marked PASS">
      <span className="text-slate-500">Pass ≥</span>
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        inputMode="numeric"
        placeholder="—"
        className="w-9 text-center bg-transparent focus:outline-none"
      />
      <span className="text-slate-500">%</span>
      {saving && <Loader2 className="w-3 h-3 animate-spin" />}
    </div>
  );
}

export default function CohortReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const {
    cohort, applications, loading, statusFilter, setStatusFilter,
    passThreshold, refetch, importRows, updateApplication, acceptApplication, rejectApplication,
  } = useCohortApplications(id);

  const [open, setOpen] = useState<Application | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => {
    if (typeof window !== 'undefined') setSettingsOpen(localStorage.getItem(`pathment-cohort-settings-open:${id}`) === '1');
  }, [id]);
  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem(`pathment-cohort-settings-open:${id}`, settingsOpen ? '1' : '0');
  }, [id, settingsOpen]);
  // Range selection. `lastIndex` is the anchor for shift-click: click one row,
  // shift-click another, and everything between them toggles as a block — the
  // natural "from this to this" without dragging. Indices are into `filtered`
  // (the full ordered list), so a range spans pages, not just what's on screen.
  const lastIndexRef = useRef<number | null>(null);
  const toggleOne = (rowId: string, index?: number, shiftKey = false) => {
    if (shiftKey && lastIndexRef.current != null && typeof index === 'number') {
      const [lo, hi] = [lastIndexRef.current, index].sort((a, b) => a - b);
      const ids = filtered.slice(lo, hi + 1).map((a) => a.id);
      // Match the anchor row's new state across the whole range (select or clear).
      const selecting = !selected.has(rowId);
      setSelected((prev) => {
        const n = new Set(prev);
        for (const rid of ids) selecting ? n.add(rid) : n.delete(rid);
        return n;
      });
    } else {
      setSelected((prev) => { const n = new Set(prev); n.has(rowId) ? n.delete(rowId) : n.add(rowId); return n; });
    }
    if (typeof index === 'number') lastIndexRef.current = index;
  };
  /** Select the first N of the filtered order (what "first 50" means). */
  const selectFirst = (n: number) => setSelected(new Set(filtered.slice(0, n).map((a) => a.id)));
  /** Select an inclusive, 1-based range of the filtered order ("rows 20 to 60"). */
  const selectRange = (from: number, to: number) => {
    const lo = Math.max(1, Math.min(from, to));
    const hi = Math.min(filtered.length, Math.max(from, to));
    setSelected(new Set(filtered.slice(lo - 1, hi).map((a) => a.id)));
  };
  // Pass/fail from the cohort threshold (percent of the applicant's max score).
  const passOf = (a: Application): 'pass' | 'fail' | null => {
    if (passThreshold == null || a.maxScore == null || !a.maxScore || a.assessmentScore == null) return null;
    return (Number(a.assessmentScore) / a.maxScore) * 100 >= passThreshold ? 'pass' : 'fail';
  };

  // ── Filters (all client-side: the whole cohort is already loaded) ──────────
  const [query, setQuery] = useState('');
  const [scoreFilter, setScoreFilter] = useState<'all' | 'scored' | 'unscored' | 'pass' | 'fail'>('all');
  const [levelFit, setLevelFit] = useState<'all' | 'mismatch' | 'match' | 'unchecked'>('all');
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'score_desc' | 'score_asc' | 'name'>('recent');

  // Live count per status tab, from the FULL set (not the filtered view).
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: applications.length };
    for (const a of applications) counts[a.status] = (counts[a.status] || 0) + 1;
    return counts;
  }, [applications]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = applications.filter((a) => {
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (levelFilter !== 'all' && (a.level || '') !== levelFilter) return false;
      if (scoreFilter === 'scored' && a.assessmentScore == null) return false;
      if (scoreFilter === 'unscored' && a.assessmentScore != null) return false;
      if (scoreFilter === 'pass' && passOf(a) !== 'pass') return false;
      if (scoreFilter === 'fail' && passOf(a) !== 'fail') return false;
      if (levelFit === 'mismatch' && !(a.recommendedLevel && a.recommendedLevel !== a.level)) return false;
      if (levelFit === 'match' && !(a.recommendedLevel && a.recommendedLevel === a.level)) return false;
      if (levelFit === 'unchecked' && a.recommendedLevel) return false;
      if (q) {
        const hay = `${a.firstName || ''} ${a.lastName || ''} ${a.email}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const score = (a: Application) => (a.assessmentScore == null ? -1 : Number(a.assessmentScore));
    return [...rows].sort((a, b) => {
      if (sortBy === 'score_desc') return score(b) - score(a);
      if (sortBy === 'score_asc') return score(a) - score(b);
      if (sortBy === 'name') return fullName(a).localeCompare(fullName(b));
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [applications, statusFilter, levelFilter, scoreFilter, levelFit, query, sortBy, passThreshold]); // eslint-disable-line react-hooks/exhaustive-deps

  // Headline numbers for the cohort (always the full set, not the filter).
  const stats = useMemo(() => {
    const scored = applications.filter((a) => a.assessmentScore != null).length;
    const submitted = applications.filter((a) => a.status === 'under_review').length;
    const awaiting = applications.filter((a) => a.status === 'assessment_sent').length;
    const passed = applications.filter((a) => passOf(a) === 'pass').length;
    const accepted = applications.filter((a) => a.status === 'accepted').length;
    const levelMismatch = applications.filter((a) => a.recommendedLevel && a.recommendedLevel !== a.level).length;
    return { total: applications.length, scored, submitted, awaiting, passed, accepted, levelMismatch };
  }, [applications, passThreshold]); // eslint-disable-line react-hooks/exhaustive-deps

  // Paginate the filtered view — 305 rows in one DOM table is needlessly heavy.
  const PAGE_SIZE = 25;
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [statusFilter, levelFilter, scoreFilter, levelFit, query, sortBy]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);
  const filteredIds = useMemo(() => filtered.map((a) => a.id), [filtered]);

  // ── "Select" menu: bulk-select without clicking each row ──────────────────
  const [selMenuOpen, setSelMenuOpen] = useState(false);
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const applyRange = () => {
    const f = parseInt(rangeFrom, 10), t = parseInt(rangeTo, 10);
    if (Number.isNaN(f) || Number.isNaN(t)) return;
    selectRange(f, t);
    setSelMenuOpen(false);
  };
  const quickCounts = [25, 50, 100, 200].filter((n) => n < filtered.length);

  // ── Configurable columns ──────────────────────────────────────────────────
  // Built-ins plus every field on the cohort's own intake form, so you can show
  // exactly what you triage on (e.g. GitHub, city, years of experience).
  const availableColumns = useMemo(() => {
    const base = [
      { key: 'wants', label: 'Wants' },
      ...((cohort?.levels?.length ?? 0) > 0 ? [{ key: 'level', label: 'Level' }] : []),
      { key: 'status', label: 'Status' },
      { key: 'score', label: 'Score' },
      { key: 'email', label: 'Email' },
      { key: 'phone', label: 'Phone' },
      { key: 'applied', label: 'Applied on' },
    ];
    const formFields = ((cohort?.intakeFormSchema as { key: string; label: string }[] | undefined) || [])
      .filter((f) => f && f.key && f.label)
      .map((f) => ({ key: `resp:${f.key}`, label: f.label }));
    // Anything present in the data but not on the form (imported columns).
    const seen = new Set([...base.map((c) => c.key), ...formFields.map((c) => c.key)]);
    const extra: { key: string; label: string }[] = [];
    for (const a of applications) {
      for (const k of Object.keys(a.responses || {})) {
        const key = `resp:${k}`;
        if (!seen.has(key)) { seen.add(key); extra.push({ key, label: k }); }
      }
    }
    return [...base, ...formFields, ...extra];
  }, [cohort, applications]);

  const DEFAULT_COLS = ['wants', 'level', 'status', 'score'];
  const [visibleCols, setVisibleCols] = useState<string[]>(DEFAULT_COLS);
  const [colsOpen, setColsOpen] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem(`pathment-cohort-cols:${id}`);
    if (saved) { try { setVisibleCols(JSON.parse(saved)); } catch { /* keep defaults */ } }
  }, [id]);
  const toggleCol = (key: string) => setVisibleCols((prev) => {
    const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
    if (typeof window !== 'undefined') localStorage.setItem(`pathment-cohort-cols:${id}`, JSON.stringify(next));
    return next;
  });
  // Keep the admin's chosen order stable (as listed in availableColumns).
  const shownColumns = useMemo(
    () => availableColumns.filter((c) => visibleCols.includes(c.key)),
    [availableColumns, visibleCols]
  );

  /** One cell's content for a row. */
  const renderCell = (a: Application, key: string) => {
    if (key === 'wants') return a.programPreference || '-';
    if (key === 'email') return a.email;
    if (key === 'phone') return a.phone || '-';
    if (key === 'applied') return a.createdAt ? new Date(a.createdAt).toLocaleDateString() : '-';
    if (key === 'level') {
      return (
        <div className="flex items-center gap-1.5">
          <span>{a.level ? levelLabel(a.level) : '—'}</span>
          {a.recommendedLevel && a.recommendedLevel !== a.level && (
            <span title={a.levelEvidence?.reason || ''} className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
              → {levelLabel(a.recommendedLevel)}
            </span>
          )}
          {a.recommendedLevel && a.recommendedLevel === a.level && (
            <span title="Recommendation matches what they picked" className="text-emerald-600 text-[10px] font-semibold">✓</span>
          )}
        </div>
      );
    }
    if (key === 'status') {
      return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CHIP[a.status]}`}>{a.status.replace(/_/g, ' ')}</span>;
    }
    if (key === 'score') {
      return (
        <div className="flex items-center gap-2">
          <span className="text-slate-700">{a.assessmentScore != null ? `${a.assessmentScore}${a.maxScore ? `/${a.maxScore}` : ''}` : '-'}</span>
          {passOf(a) === 'pass' && <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-semibold">PASS</span>}
          {passOf(a) === 'fail' && <span className="px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-semibold">FAIL</span>}
          {a.aiOverall != null && <span title="AI overall fit score" className="text-[10px] font-medium text-violet-600">AI {a.aiOverall}</span>}
        </div>
      );
    }
    if (key.startsWith('resp:')) {
      const v = (a.responses || {})[key.slice(5)];
      if (v == null || v === '') return '-';
      const text = typeof v === 'string' ? v : JSON.stringify(v);
      return /^https?:\/\//.test(text)
        ? <a href={text} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-brand-600 underline break-all">{text.length > 40 ? `${text.slice(0, 40)}…` : text}</a>
        : <span title={text}>{text.length > 60 ? `${text.slice(0, 60)}…` : text}</span>;
    }
    return '-';
  };

  // Select-all acts on what you're actually looking at (the filtered set).
  const allSelected = filteredIds.length > 0 && filteredIds.every((fid) => selected.has(fid));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(filteredIds));
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

      {/* Admissions settings — collapsed by default so the applicant list is the
          focus; open it when you actually need to change the intake. */}
      {cohort && (
        <div className="rounded-2xl border border-slate-200 bg-card">
          <button
            onClick={() => setSettingsOpen((v) => !v)}
            aria-expanded={settingsOpen}
            className="flex w-full items-center gap-2 px-4 py-3 text-left"
          >
            <Settings className="w-4 h-4 text-slate-400 shrink-0" />
            <span className="text-sm font-medium text-slate-800">Admissions settings</span>
            <span className="text-xs text-slate-400 truncate">
              {cohort.publicSlug ? 'public link on' : 'public link off'}
              {cohort.assessmentRequired ? ' · assessment required' : ''}
              {(cohort.levels?.length ?? 0) > 0 ? ` · ${cohort.levels?.length} levels` : ''}
            </span>
            <ChevronDown className={`ml-auto w-4 h-4 text-slate-400 transition-transform ${settingsOpen ? 'rotate-180' : ''}`} />
          </button>
          {settingsOpen && (
            <div className="border-t border-slate-200 p-4">
              <IntakePanel cohortId={id} cohort={cohort} onChange={refetch} />
            </div>
          )}
        </div>
      )}

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

      {/* Headline numbers for the whole cohort */}
      {applications.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2">
          {[
            { label: 'Applicants', value: stats.total, tone: 'text-slate-900' },
            { label: 'Not submitted', value: stats.awaiting, tone: 'text-blue-700' },
            { label: 'To score', value: stats.submitted, tone: 'text-amber-700' },
            { label: 'Scored', value: stats.scored, tone: 'text-slate-900' },
            { label: passThreshold != null ? `Passed (≥${passThreshold}%)` : 'Passed', value: passThreshold != null ? stats.passed : '—', tone: 'text-emerald-700' },
            { label: 'Accepted', value: stats.accepted, tone: 'text-emerald-700' },
            { label: 'Level mismatch', value: stats.levelMismatch, tone: stats.levelMismatch ? 'text-amber-700' : 'text-slate-900' },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-slate-200 bg-card px-3 py-2">
              <p className="text-[11px] text-slate-500">{s.label}</p>
              <p className={`text-lg font-semibold tabular-nums ${s.tone}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filter tabs — each with a live count from the full cohort */}
      <div className="flex flex-wrap items-center gap-0 border-b border-slate-200">
        {STATUS_TABS.map((t) => {
          const n = statusCounts[t.key] || 0;
          return (
            <button
              key={t.key}
              onClick={() => setStatusFilter(t.key)}
              className={`-mb-px border-b-2 px-3.5 py-2 text-sm font-medium transition-colors inline-flex items-center gap-1.5 ${statusFilter === t.key ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800'} ${n === 0 && t.key !== 'all' ? 'opacity-40' : ''}`}
            >
              {t.label}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${statusFilter === t.key ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-500'}`}>{n}</span>
            </button>
          );
        })}
        <div className="ml-auto mb-1 flex flex-wrap items-center gap-2">
          {selected.size > 0 && (
            <button onClick={() => setSelected(new Set())} className="text-xs text-slate-500 hover:text-slate-800">Clear ({selected.size})</button>
          )}
          <div className="relative">
            <button
              onClick={() => setSelMenuOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-brand-300 hover:text-brand-700"
            >
              <CheckSquare className="w-3.5 h-3.5" /> Select
              {selected.size > 0 && <span className="tabular-nums text-brand-600">· {selected.size}</span>}
              <ChevronDown className="w-3 h-3" />
            </button>
            {selMenuOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setSelMenuOpen(false)} />
                <div className="absolute right-0 z-30 mt-1 w-60 rounded-lg border border-slate-200 bg-card shadow-lg p-1.5">
                  <p className="px-2 pt-1 pb-1.5 text-[11px] text-slate-400">
                    Selects from the {filtered.length} matching the current filters &amp; sort
                  </p>
                  <button onClick={() => { setSelected(new Set(filteredIds)); setSelMenuOpen(false); }} className="w-full text-left px-2 py-1.5 rounded-md text-sm text-slate-700 hover:bg-slate-100">
                    All {filtered.length}
                  </button>
                  {quickCounts.map((n) => (
                    <button key={n} onClick={() => { selectFirst(n); setSelMenuOpen(false); }} className="w-full text-left px-2 py-1.5 rounded-md text-sm text-slate-700 hover:bg-slate-100">
                      First {n}
                    </button>
                  ))}
                  <div className="mt-1 border-t border-slate-100 px-2 pt-2 pb-1">
                    <p className="text-[11px] text-slate-400 mb-1.5">Rows — by position in the list</p>
                    <div className="flex items-center gap-1.5">
                      <input
                        value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value.replace(/\D/g, ''))}
                        onKeyDown={(e) => e.key === 'Enter' && applyRange()}
                        placeholder="20" inputMode="numeric"
                        className="w-14 rounded-md border border-slate-200 px-2 py-1 text-sm text-center bg-card focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                      <span className="text-xs text-slate-400">to</span>
                      <input
                        value={rangeTo} onChange={(e) => setRangeTo(e.target.value.replace(/\D/g, ''))}
                        onKeyDown={(e) => e.key === 'Enter' && applyRange()}
                        placeholder="60" inputMode="numeric"
                        className="w-14 rounded-md border border-slate-200 px-2 py-1 text-sm text-center bg-card focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                      <button onClick={applyRange} className="ml-auto rounded-md bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-700">Go</button>
                    </div>
                  </div>
                  <p className="px-2 pt-2 pb-0.5 text-[11px] text-slate-400">Tip: shift-click two rows to select the range between them.</p>
                </div>
              </>
            )}
          </div>
          {passThreshold != null && applications.some((a) => passOf(a) === 'pass') && (
            <button
              onClick={() => setSelected(new Set(applications.filter((a) => passOf(a) === 'pass').map((a) => a.id)))}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
            >
              <CheckSquare className="w-3.5 h-3.5" /> Select passed
            </button>
          )}
          <PassThresholdControl cohortId={id} value={passThreshold} onSaved={refetch} />
          <IntakeScoreToolbar cohortId={id} cohortName={cohort?.name || 'cohort'} selectedIds={[...selected]} visibleIds={filteredIds} onDone={() => { setSelected(new Set()); refetch(); }} />
          <button
            onClick={() => refetch()}
            disabled={loading}
            title="Refresh applicants"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-brand-300 hover:text-brand-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {/* Search + score / level / sort */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-56">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or email…"
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <select value={scoreFilter} onChange={(e) => setScoreFilter(e.target.value as typeof scoreFilter)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500">
          <option value="all">Any score</option>
          <option value="scored">Scored</option>
          <option value="unscored">Not scored</option>
          <option value="pass">Passed</option>
          <option value="fail">Failed</option>
        </select>
        {(cohort?.levels?.length ?? 0) > 0 && (
          <select value={levelFit} onChange={(e) => setLevelFit(e.target.value as typeof levelFit)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500">
            <option value="all">Any level fit</option>
            <option value="mismatch">Level mismatch</option>
            <option value="match">Level confirmed</option>
            <option value="unchecked">Not level-checked</option>
          </select>
        )}
        {(cohort?.levels?.length ?? 0) > 0 && (
          <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500">
            <option value="all">All levels</option>
            {(cohort?.levels || []).map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
          </select>
        )}
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500">
          <option value="recent">Newest first</option>
          <option value="score_desc">Score: high → low</option>
          <option value="score_asc">Score: low → high</option>
          <option value="name">Name A–Z</option>
        </select>
        <span className="text-xs text-slate-500 tabular-nums">
          {filtered.length} of {applications.length}
        </span>
        <div className="relative">
          <button
            onClick={() => setColsOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:border-brand-300 hover:text-brand-700"
          >
            <Columns3 className="w-4 h-4" /> Columns
          </button>
          {colsOpen && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setColsOpen(false)} />
              <div className="absolute right-0 z-30 mt-1 w-64 max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-card shadow-lg p-1">
                <p className="px-2 py-1.5 text-[11px] text-slate-400">Show columns — including anything from your intake form</p>
                {availableColumns.map((c) => (
                  <button
                    key={c.key}
                    onClick={() => toggleCol(c.key)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-slate-50"
                  >
                    {visibleCols.includes(c.key)
                      ? <CheckSquare className="w-3.5 h-3.5 text-brand-600 shrink-0" />
                      : <Square className="w-3.5 h-3.5 text-slate-300 shrink-0" />}
                    <span className="truncate text-slate-700">{c.label}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        {(query || scoreFilter !== 'all' || levelFilter !== 'all' || statusFilter !== 'all' || levelFit !== 'all') && (
          <button onClick={() => { setQuery(''); setScoreFilter('all'); setLevelFilter('all'); setStatusFilter('all'); setLevelFit('all'); }} className="text-xs text-slate-500 hover:text-slate-800 underline">Clear filters</button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-600" /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center">
          <FileSpreadsheet className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600">
            {applications.length === 0
              ? 'No applications here yet - import a CSV to bring applicants in.'
              : 'No applicants match these filters.'}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-card">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="w-10 px-4 py-3 text-right font-medium text-slate-400 tabular-nums">#</th>
                <th className="w-10 px-4 py-3">
                  <button onClick={toggleAll} title="Select all" className="text-slate-400 hover:text-brand-600 align-middle">
                    {allSelected ? <CheckSquare className="w-4 h-4 text-brand-600" /> : <Square className="w-4 h-4" />}
                  </button>
                </th>
                <th className="text-left font-medium px-4 py-3">Applicant</th>
                {shownColumns.map((c) => (
                  <th key={c.key} className="text-left font-medium px-4 py-3 whitespace-nowrap">{c.label}</th>
                ))}
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((a, i) => {
                const globalIndex = (page - 1) * PAGE_SIZE + i;
                return (
                <tr key={a.id} className={`hover:bg-slate-50 cursor-pointer ${selected.has(a.id) ? 'bg-brand-50/40' : ''}`} onClick={() => setOpen(a)}>
                  <td className="px-4 py-3 text-right text-xs text-slate-400 tabular-nums">{globalIndex + 1}</td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={(e) => toggleOne(a.id, globalIndex, e.shiftKey)}
                      title="Click to select · Shift-click to select a range"
                      className="text-slate-400 hover:text-brand-600 align-middle"
                    >
                      {selected.has(a.id) ? <CheckSquare className="w-4 h-4 text-brand-600" /> : <Square className="w-4 h-4" />}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{fullName(a)}</p>
                    <p className="text-xs text-slate-500">{a.email}</p>
                  </td>
                  {shownColumns.map((c) => (
                    <td key={c.key} className="px-4 py-3 text-slate-600 max-w-xs">{renderCell(a, c.key)}</td>
                  ))}
                  <td className="px-4 py-3 text-right">
                    <span className="text-brand-600 text-xs font-medium">Review</span>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
          {pageCount > 1 && (
            <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm">
              <span className="text-slate-500 tabular-nums">
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 disabled:opacity-40 hover:border-brand-300">Previous</button>
                <span className="px-2 text-slate-500 tabular-nums">{page} / {pageCount}</span>
                <button onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={page === pageCount} className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 disabled:opacity-40 hover:border-brand-300">Next</button>
              </div>
            </div>
          )}
        </div>
      )}

      {liveOpen && (
        <ApplicationDrawer
          app={liveOpen}
          onClose={() => setOpen(null)}
          onUpdate={updateApplication}
          onAccept={acceptApplication}
          onReject={rejectApplication}
          levelLabel={levelLabel}
        />
      )}
    </div>
  );
}
