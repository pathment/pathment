'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Loader2, Pencil, Check, Lock, MailCheck } from 'lucide-react';
import { toast } from 'sonner';

import { publicApi } from '@/lib/services/public-api';
import { AssessmentRunner, type RunnerAssessment, type RunnerSubmission } from '@/components/apply/AssessmentRunner';
import { IntakeFormFields } from '@/components/shared/IntakeFormFields';
import type { IntakeFormField } from '@/lib/config/intakeFields';
import { extractApiErrorMessage } from '@/lib/utils/api-error';

interface StatusData {
  application: {
    id: string; email: string; firstName?: string; lastName?: string; phone?: string;
    level?: string | null; status: string;
    responses?: Record<string, unknown>;
    decisionReason?: string | null;
    assessmentSubmittedAt?: string; createdAt: string;
  };
  program: { id: string; name: string } | null;
  cohort: { id: string; name: string } | null;
  levels?: { key: string; label: string }[];
  formSchema?: IntakeFormField[];
  assessment: RunnerAssessment | null;
  submission: (RunnerSubmission & { updatedAt?: string }) | null;
  /** An "invite first" intake that hasn't sent them the assessment yet. */
  awaitingInvite?: boolean;
  serverNow?: string;
  deadline?: string | null;
  assessmentDeadline?: string | null;
  canEditAssessment?: boolean;
  canEditInfo?: boolean;
  canChangeLevel?: boolean;
  canWithdraw?: boolean;
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Received', cls: 'bg-slate-100 text-slate-700' },
  assessment_sent: { label: 'Assessment pending', cls: 'bg-amber-100 text-amber-800' },
  under_review: { label: 'Under review', cls: 'bg-brand-50 text-brand-700' },
  accepted: { label: 'Accepted 🎉', cls: 'bg-emerald-100 text-emerald-800' },
  rejected: { label: 'Not selected', cls: 'bg-rose-100 text-rose-700' },
  waitlisted: { label: 'Waitlisted', cls: 'bg-violet-100 text-violet-700' },
  withdrawn: { label: 'Withdrawn', cls: 'bg-slate-200 text-slate-600' },
  removed: { label: 'Closed', cls: 'bg-slate-200 text-slate-600' },
};

const prettyKey = (k: string) =>
  k.replace(/^q_/, '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/\burl\b/i, 'URL').replace(/^./, (c) => c.toUpperCase());
const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '');

// ── Progress timeline ─────────────────────────────────────────────────────────
function Timeline({ status, hasAssessment }: { status: string; hasAssessment: boolean }) {
  const steps = ['Applied', ...(hasAssessment ? ['Assessment'] : []), 'Under review', 'Decision'];
  let reached: number;
  if (['accepted', 'rejected'].includes(status)) reached = steps.length - 1;
  else if (status === 'under_review') reached = steps.indexOf('Under review');
  else if (hasAssessment && (status === 'assessment_sent' || status === 'pending')) reached = steps.indexOf('Assessment');
  else reached = steps.indexOf('Under review');

  return (
    <ol className="mt-6 flex items-center">
      {steps.map((label, i) => {
        const done = i < reached;
        const current = i === reached;
        return (
          <li key={label} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <span className={`grid place-items-center w-7 h-7 rounded-full text-xs font-semibold ${done ? 'bg-emerald-500 text-white' : current ? 'bg-brand-600 text-white ring-4 ring-brand-100 dark:ring-brand-500/20' : 'bg-slate-100 text-slate-400'}`}>
                {done ? <Check className="w-3.5 h-3.5" /> : i + 1}
              </span>
              <span className={`mt-1.5 text-[11px] ${current ? 'font-semibold text-brand-700' : done ? 'text-slate-600' : 'text-slate-400'}`}>{label}</span>
            </div>
            {i < steps.length - 1 && <div className={`flex-1 h-0.5 mx-1 mb-5 ${i < reached ? 'bg-emerald-500' : 'bg-slate-200'}`} />}
          </li>
        );
      })}
    </ol>
  );
}

export default function ApplicationStatusPage() {
  const params = useParams();
  const token = decodeURIComponent(String(params?.token || ''));

  const [data, setData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);


  const [editingInfo, setEditingInfo] = useState(false);     // editing profile info
  const [form, setForm] = useState<Record<string, string>>({});
  const [savingInfo, setSavingInfo] = useState(false);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    publicApi
      .getStatus(token)
      .then((d: StatusData) => setData(d))
      .catch((e) => setError(extractApiErrorMessage(e, 'This link is not valid or has expired.')))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { if (token) load(); }, [token, load]);

  const setField = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));
  const startEditInfo = () => {
    if (!data) return;
    const a = data.application;
    setForm({ firstName: a.firstName || '', lastName: a.lastName || '', level: a.level || '', ...(a.responses as Record<string, string>) });
    setEditingInfo(true);
  };

  const saveInfo = async () => {
    if (!data) return;
    if (!form.firstName?.trim() || !form.lastName?.trim()) { toast.error('First and last name are required'); return; }
    setSavingInfo(true);
    try {
      const responses: Record<string, string> = {};
      (data.formSchema || []).forEach((f) => { responses[f.key] = form[f.key] || ''; });
      await publicApi.updateInfo(token, {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: responses.phone || form.phone || '',
        level: form.level || undefined,
        responses,
      });
      toast.success('Your information was updated');
      setEditingInfo(false);
      load();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not update your information'));
    } finally {
      setSavingInfo(false);
    }
  };

  const doWithdraw = async () => {
    setWithdrawing(true);
    try {
      await publicApi.withdraw(token);
      toast.success('Application withdrawn');
      setConfirmWithdraw(false);
      load();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not withdraw'));
    } finally {
      setWithdrawing(false);
    }
  };


  const levelLabel = useMemo(
    () => (data?.levels || []).find((l) => l.key === data?.application.level)?.label || data?.application.level || null,
    [data]
  );

  if (loading) return <div className="py-24 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-brand-600" /></div>;

  if (error || !data) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center">
        <p className="text-slate-600">{error || 'Application not found.'}</p>
        <Link href="/programs" className="mt-4 inline-flex items-center gap-1 text-brand-700 font-medium"><ArrowLeft className="w-4 h-4" /> Browse programs</Link>
      </div>
    );
  }

  const { application, program, assessment, submission, deadline } = data;
  const assessDeadline = data.assessmentDeadline ?? deadline; // the assessment's own deadline
  const meta = STATUS_META[application.status] || STATUS_META.pending;
  const submitted = Boolean(submission && submission.status !== 'in_progress');
  // Closed by the programme team: nothing left for the applicant to do here.
  const withdrawn = application.status === 'withdrawn' || application.status === 'removed';
  const removedByTeam = application.status === 'removed';

  const SKIP = new Set(['firstName', 'lastName', 'phone', 'email']);
  const extra = Object.entries(application.responses || {}).filter(([k, v]) => !SKIP.has(k) && v != null && String(v).trim() !== '');

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-semibold text-slate-900">Your application</h1>
      <p className="mt-1 text-slate-600">{program?.name}{data.cohort ? ` · ${data.cohort.name}` : ''}</p>

      {withdrawn ? (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 dark:bg-slate-800/40 p-6 text-center">
          {removedByTeam ? (
            <>
              <p className="font-medium text-slate-700">This application is closed.</p>
              <p className="mt-1 text-sm text-slate-500">The programme team has closed it. If you think this is a mistake, reply to the email you received from them.</p>
            </>
          ) : (
            <>
              <p className="font-medium text-slate-700">You withdrew this application.</p>
              <p className="mt-1 text-sm text-slate-500">If that was a mistake, you can apply again from the program page.</p>
            </>
          )}
        </div>
      ) : (
        <Timeline status={application.status} hasAssessment={!!assessment} />
      )}

      {/* ── Status ──────────────────────────────────────────── */}
      <div className="mt-6 rounded-2xl border border-slate-200 bg-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-500">Status</p>
            <span className={`mt-1 inline-block text-sm font-medium rounded-full px-3 py-1 ${meta.cls}`}>{meta.label}</span>
          </div>
          <p className="text-right text-xs text-slate-400">Applied {fmt(application.createdAt)}</p>
        </div>
        {submitted && (
          <p className="mt-4 inline-flex items-center gap-1.5 text-sm text-emerald-700">
            <CheckCircle2 className="w-4 h-4" /> Assessment submitted{submission?.submittedAt ? ` · ${fmt(submission.submittedAt)}` : ''}
            {(submission?.submissionCount || 1) > 1 ? ` (updated ${submission!.submissionCount}×)` : ''}
          </p>
        )}
      </div>

      {/* ── Your information (view / edit) ──────────────────── */}
      {!withdrawn && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-card p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Your information</h2>
            {data.canEditInfo && !editingInfo && (
              <button onClick={startEditInfo} className="inline-flex items-center gap-1.5 text-sm text-brand-700 hover:text-brand-800 font-medium"><Pencil className="w-4 h-4" /> Edit</button>
            )}
          </div>

          {!editingInfo ? (
            <dl className="mt-3 divide-y divide-slate-100">
              {[['Name', `${application.firstName || ''} ${application.lastName || ''}`.trim()], ['Email', application.email], ['Phone', application.phone || ''], ...(levelLabel ? [['Level', levelLabel] as [string, string]] : [])]
                .filter(([, v]) => v).map(([k, v]) => (
                  <div key={k} className="flex gap-3 py-2"><dt className="w-36 shrink-0 text-xs font-medium text-slate-500">{k}</dt><dd className="text-sm text-slate-700 break-words">{v}</dd></div>
                ))}
              {extra.map(([k, v]) => (
                <div key={k} className="flex gap-3 py-2"><dt className="w-36 shrink-0 text-xs font-medium text-slate-500 capitalize">{prettyKey(k)}</dt><dd className="text-sm text-slate-700 break-words">{String(v)}</dd></div>
              ))}
            </dl>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">First name <span className="text-rose-500">*</span></label>
                  <input value={form.firstName || ''} onChange={(e) => setField('firstName', e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500" /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Last name <span className="text-rose-500">*</span></label>
                  <input value={form.lastName || ''} onChange={(e) => setField('lastName', e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500" /></div>
              </div>

              {(data.levels?.length ?? 0) > 0 && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Your level</label>
                  {data.canChangeLevel ? (
                    <>
                      <select value={form.level || ''} onChange={(e) => setField('level', e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500">
                        <option value="">Select your level…</option>
                        {data.levels!.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
                      </select>
                      <p className="mt-1 text-xs text-slate-400">Your level decides your assessment.</p>
                    </>
                  ) : (
                    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                      <Lock className="w-3.5 h-3.5 text-slate-400" /> {levelLabel}
                      <span className="text-xs text-slate-400">· locked after submitting the assessment</span>
                    </div>
                  )}
                </div>
              )}

              <IntakeFormFields fields={data.formSchema || []} values={form} onChange={setField} />

              <div className="flex gap-2 pt-1">
                <button onClick={saveInfo} disabled={savingInfo} className="px-4 h-10 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium disabled:opacity-50 inline-flex items-center gap-2">{savingInfo && <Loader2 className="w-4 h-4 animate-spin" />}Save changes</button>
                <button onClick={() => setEditingInfo(false)} className="px-4 h-10 rounded-lg border border-slate-200 text-slate-600 text-sm hover:bg-slate-50">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Assessment ──────────────────────────────────────── */}
      {data.awaitingInvite && !withdrawn && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-card p-6 flex items-start gap-3">
          <MailCheck className="w-5 h-5 text-brand-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-slate-900">Your assessment comes by email</p>
            <p className="mt-1 text-sm text-slate-600">We&apos;ll email you a link to your assessment when it&apos;s ready for you. Keep an eye on your inbox (and spam folder).</p>
          </div>
        </div>
      )}
      {assessment && !withdrawn && (
        <AssessmentRunner
          // A new assessment (level changed) or a fresh load starts the runner over.
          key={`${assessment.id}:${submission?.status || 'none'}:${submission?.submissionCount || 0}`}
          token={token}
          assessment={assessment}
          submission={submission}
          canEdit={!!data.canEditAssessment}
          assessmentDeadline={assessDeadline}
          serverNow={data.serverNow}
          onChanged={load}
        />
      )}

      {/* ── What's next ─────────────────────────────────────── */}
      {!withdrawn && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 dark:bg-slate-800/40 p-5 text-sm text-slate-600">
          <p className="font-medium text-slate-700">What happens next</p>
          <p className="mt-1">
            {application.status === 'accepted' ? "🎉 You're in! Check your email for your invite to join."
              : application.status === 'rejected' ? 'Thanks for applying — this time it wasn’t a match. We wish you the best.'
              : <>We review applications{deadline ? <> after they close on <span className="font-medium">{fmt(deadline)}</span></> : ' once they close'}. You&apos;ll hear from us by email — keep this link to check back any time.</>}
          </p>
          {application.status === 'rejected' && application.decisionReason && (
            <div className="mt-3 rounded-lg border border-slate-200 bg-card p-3">
              <p className="text-xs font-medium text-slate-500">A note from the team</p>
              <p className="mt-0.5 text-sm text-slate-700 whitespace-pre-wrap">{application.decisionReason}</p>
            </div>
          )}
        </div>
      )}

      {/* ── Withdraw ────────────────────────────────────────── */}
      {data.canWithdraw && (
        <div className="mt-6 text-center">
          {!confirmWithdraw ? (
            <button onClick={() => setConfirmWithdraw(true)} className="text-sm text-slate-400 hover:text-rose-600">Withdraw my application</button>
          ) : (
            <div className="inline-flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5">
              <span className="text-sm text-rose-800">Withdraw this application?</span>
              <button onClick={doWithdraw} disabled={withdrawing} className="text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg px-3 py-1.5 disabled:opacity-50 inline-flex items-center gap-1.5">{withdrawing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}Yes, withdraw</button>
              <button onClick={() => setConfirmWithdraw(false)} className="text-sm text-slate-500 hover:text-slate-700">Cancel</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
