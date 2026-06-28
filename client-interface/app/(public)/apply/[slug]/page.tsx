'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, Lock, Clock, Users, CalendarX2, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';

import { publicApi, type ApplyInfo } from '@/lib/services/public-api';
import { validateIntakeValue } from '@/lib/config/intakeFields';
import { IntakeFormFields } from '@/components/shared/IntakeFormFields';
import { isValidPhoneNumber } from 'react-phone-number-input';
import { extractApiErrorMessage } from '@/lib/utils/api-error';

// Each "can't apply" reason gets its own icon, badge label, copy and accent so the
// state reads as intentional and designed — not a bare error line.
type ClosedMeta = { label: string; copy: string; Icon: LucideIcon; tile: string; icon: string; badge: string };
const CLOSED_META: Record<string, ClosedMeta> = {
  disabled:     { label: 'Closed',              copy: 'This application link is currently turned off.',        Icon: Lock,       tile: 'bg-slate-100 dark:bg-slate-800', icon: 'text-slate-500', badge: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  not_open:     { label: 'Not open',            copy: 'This cohort is not open for applications.',             Icon: Lock,       tile: 'bg-slate-100 dark:bg-slate-800', icon: 'text-slate-500', badge: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  not_yet_open: { label: 'Opening soon',        copy: 'Applications for this cohort haven’t opened yet — check back shortly.', Icon: Clock, tile: 'bg-brand-50 dark:bg-brand-500/15', icon: 'text-brand-600', badge: 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300' },
  closed:       { label: 'Applications closed', copy: 'Applications for this cohort have closed.',             Icon: CalendarX2, tile: 'bg-slate-100 dark:bg-slate-800', icon: 'text-slate-500', badge: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  full:         { label: 'Cohort full',         copy: 'This cohort has reached its application limit.',        Icon: Users,      tile: 'bg-amber-50 dark:bg-amber-500/15', icon: 'text-amber-600', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
};

export default function ApplyPage() {
  const params = useParams();
  const router = useRouter();
  const slug = String(params?.slug || '');

  const [info, setInfo] = useState<ApplyInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ statusToken: string; requiresAssessment: boolean } | null>(null);
  // If THIS browser already applied, we remember the magic-link token so we can
  // offer a direct "View your application" — no email round-trip needed.
  const [priorToken, setPriorToken] = useState<string | null>(null);

  const [form, setForm] = useState<Record<string, string>>({ firstName: '', lastName: '', email: '', phone: '' });
  const [level, setLevel] = useState('');

  // "Already applied? Continue" — re-issue the magic link by email.
  const [resumeOpen, setResumeOpen] = useState(false);
  const [resumeEmail, setResumeEmail] = useState('');
  const [resumeMsg, setResumeMsg] = useState('');
  const [resumeBusy, setResumeBusy] = useState(false);
  const submitResume = async () => {
    if (!resumeEmail.trim()) { toast.error('Enter your email'); return; }
    setResumeBusy(true);
    try {
      const r = await publicApi.resume(slug, resumeEmail.trim());
      setResumeMsg(r?.message || 'If an application exists for that email, we\'ve sent a link to continue.');
    } catch {
      setResumeMsg('If an application exists for that email, we\'ve sent a link to continue.');
    } finally { setResumeBusy(false); }
  };

  useEffect(() => {
    if (!slug) return;
    publicApi
      .getCohort(slug)
      .then(setInfo)
      .catch(() => setError('This application link is not valid.'))
      .finally(() => setLoading(false));
    try { const t = localStorage.getItem(`pathment-application:${slug}`); if (t) setPriorToken(t); } catch { /* no storage */ }
  }, [slug]);

  const setField = (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async () => {
    if (!info) return;
    if (!form.firstName.trim() || !form.lastName.trim()) {
      toast.error('Please enter your first and last name');
      return;
    }
    if (!form.email.trim()) {
      toast.error('Please enter your email');
      return;
    }
    if ((info.levels?.length ?? 0) > 0 && !level) {
      toast.error('Please select your level');
      return;
    }
    // Collect configurable fields into `responses`.
    const responses: Record<string, string> = {};
    for (const field of info.formSchema || []) {
      responses[field.key] = form[field.key] || '';
      if (field.required && !responses[field.key].trim()) {
        toast.error(`Please complete: ${field.label}`);
        return;
      }
      const formatError = validateIntakeValue(field, responses[field.key]);
      if (formatError) {
        toast.error(`${field.label}: ${formatError}`);
        return;
      }
      // Strict per-country phone check (libphonenumber) on top of the format rule.
      if (field.type === 'phone' && responses[field.key].trim() && !isValidPhoneNumber(responses[field.key])) {
        toast.error(`${field.label}: Enter a valid phone number`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const result = await publicApi.apply(slug, {
        email: form.email.trim(),
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim(),
        level: level || undefined,
        responses,
      });
      setDone({ statusToken: result.accessToken, requiresAssessment: result.requiresAssessment });
      try { localStorage.setItem(`pathment-application:${slug}`, result.accessToken); } catch { /* no storage */ }
      setPriorToken(result.accessToken);
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not submit your application'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="py-24 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-brand-600" /></div>;
  }

  if (error || !info) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center">
        <p className="text-slate-600">{error || 'Application link not found.'}</p>
        <Link href="/programs" className="mt-4 inline-flex items-center gap-1 text-brand-700 font-medium">
          <ArrowLeft className="w-4 h-4" /> Browse programs
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center">
        <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
        <h1 className="mt-4 text-2xl font-semibold text-slate-900">Application received</h1>
        <p className="mt-2 text-slate-600">
          We&apos;ve emailed you a private link to track your application
          {done.requiresAssessment ? ' and complete a short assessment' : ''}.
        </p>
        <button
          onClick={() => router.push(`/apply/status/${encodeURIComponent(done.statusToken)}`)}
          className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg font-medium"
        >
          {done.requiresAssessment ? 'Start assessment' : 'View status'}
        </button>
      </div>
    );
  }

  if (!info.open) {
    const reason = (info.reasons || []).find((r) => CLOSED_META[r]) || 'closed';
    const meta = CLOSED_META[reason];
    const Icon = meta.Icon;
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <div className={`mx-auto grid h-20 w-20 place-items-center rounded-2xl ${meta.tile}`}>
            <Icon className={`h-10 w-10 ${meta.icon}`} strokeWidth={1.75} />
          </div>
          <span className={`mt-6 inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${meta.badge}`}>
            {meta.label}
          </span>
          {info.cohort?.name && <p className="mt-4 text-sm font-medium text-slate-400">{info.cohort.name}</p>}
          <h1 className="mt-1 text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
            {info.program?.name || 'This program'}
          </h1>
          <p className="mt-3 text-base text-slate-500">{meta.copy}</p>

          {/* Already applied? Let them reach their application even when closed/full. */}
          {priorToken ? (
            <button onClick={() => router.push(`/apply/status/${encodeURIComponent(priorToken)}`)} className="mt-8 inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-700">
              View your application <ArrowRight className="h-4 w-4" />
            </button>
          ) : !resumeOpen ? (
            <button onClick={() => setResumeOpen(true)} className="mt-8 inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-700">
              Already applied? View your application
            </button>
          ) : resumeMsg ? (
            <p className="mt-8 rounded-lg bg-emerald-50 text-emerald-800 px-4 py-3 text-sm">{resumeMsg}</p>
          ) : (
            <div className="mt-8 flex flex-col gap-2 text-left">
              <p className="text-sm text-slate-500">Enter the email you applied with and we&apos;ll send you a link to your application.</p>
              <div className="flex flex-wrap items-center gap-2">
                <input type="email" value={resumeEmail} onChange={(e) => setResumeEmail(e.target.value)} placeholder="you@email.com" className="flex-1 min-w-48 border border-slate-200 rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500" />
                <button onClick={submitResume} disabled={resumeBusy} className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50 inline-flex items-center gap-1.5">{resumeBusy && <Loader2 className="w-4 h-4 animate-spin" />}Email me my link</button>
              </div>
            </div>
          )}

          <div className="mt-4">
            <Link href="/programs" className="inline-flex items-center justify-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
              <ArrowLeft className="h-4 w-4" /> Browse other programs
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-12">
      <Link href={info.program ? `/programs/${info.program.id}` : '/programs'} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="w-4 h-4" /> Back
      </Link>

      <h1 className="mt-4 text-2xl font-semibold text-slate-900">Apply - {info.program?.name}</h1>
      <p className="mt-1 text-slate-600">{info.cohort.name}</p>
      {info.assessment && (
        <p className="mt-3 text-sm rounded-lg bg-brand-50 dark:bg-brand-500/15 text-brand-800 px-3 py-2">
          This application includes a {info.assessment.required ? 'required' : 'short'} assessment after you submit.
        </p>
      )}

      {/* Same browser already applied → jump straight to their application. */}
      {priorToken && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50 dark:bg-brand-500/10 px-4 py-3">
          <span className="text-sm font-medium text-brand-900 dark:text-brand-200">You&apos;ve already applied to this cohort.</span>
          <button onClick={() => router.push(`/apply/status/${encodeURIComponent(priorToken)}`)} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700">
            View your application <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Already applied on another device? Re-issue the magic link by email. */}
      <div className="mt-3 text-sm">
        {!resumeOpen ? (
          <button onClick={() => setResumeOpen(true)} className="text-brand-700 hover:text-brand-800 font-medium">{priorToken ? 'On another device? Email me my link' : 'Already applied? Continue where you left off'}</button>
        ) : resumeMsg ? (
          <p className="rounded-lg bg-emerald-50 text-emerald-800 px-3 py-2">{resumeMsg}</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-card p-3">
            <input type="email" value={resumeEmail} onChange={(e) => setResumeEmail(e.target.value)} placeholder="The email you applied with" className="flex-1 min-w-48 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-card" />
            <button onClick={submitResume} disabled={resumeBusy} className="px-3 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50 inline-flex items-center gap-1.5">
              {resumeBusy && <Loader2 className="w-4 h-4 animate-spin" />} Email me a link
            </button>
            <button onClick={() => setResumeOpen(false)} className="px-2 py-2 text-slate-400 hover:text-slate-600 text-sm">Cancel</button>
          </div>
        )}
      </div>

      <div className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-card p-6">
        <div className="grid grid-cols-2 gap-4">
          <Field label="First name" required value={form.firstName} onChange={(v) => setField('firstName', v)} />
          <Field label="Last name" required value={form.lastName} onChange={(v) => setField('lastName', v)} />
        </div>
        <Field label="Email" type="email" required value={form.email} onChange={(v) => setField('email', v)} />

        {(info.levels?.length ?? 0) > 0 && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Your level <span className="text-rose-500">*</span></label>
            <select value={level} onChange={(e) => setLevel(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-card">
              <option value="">Select your level…</option>
              {info.levels.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
            </select>
            <p className="mt-1 text-xs text-slate-400">This tailors your assessment to the right level.</p>
          </div>
        )}

        <IntakeFormFields fields={info.formSchema || []} values={form} onChange={setField} />

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full h-11 bg-brand-600 hover:bg-brand-700 text-white rounded-lg font-medium disabled:opacity-50 inline-flex items-center justify-center gap-2"
        >
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
          Submit application
        </button>
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, type = 'text', required = false,
}: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">
        {label}{required && <span className="text-rose-500"> *</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-card"
      />
    </div>
  );
}
