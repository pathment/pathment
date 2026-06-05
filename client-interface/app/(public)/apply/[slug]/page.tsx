'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { publicApi, type ApplyInfo } from '@/lib/services/public-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';

const CLOSED_COPY: Record<string, string> = {
  disabled: 'This application link is currently turned off.',
  not_open: 'This cohort is not open for applications.',
  not_yet_open: 'Applications for this cohort haven’t opened yet.',
  closed: 'Applications for this cohort have closed.',
  full: 'This cohort has reached its application limit.',
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

  const [form, setForm] = useState<Record<string, string>>({ firstName: '', lastName: '', email: '', phone: '' });

  useEffect(() => {
    if (!slug) return;
    publicApi
      .getCohort(slug)
      .then(setInfo)
      .catch(() => setError('This application link is not valid.'))
      .finally(() => setLoading(false));
  }, [slug]);

  const setField = (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async () => {
    if (!info) return;
    if (!form.email.trim()) {
      toast.error('Please enter your email');
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
    }

    setSubmitting(true);
    try {
      const result = await publicApi.apply(slug, {
        email: form.email.trim(),
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim(),
        responses,
      });
      setDone({ statusToken: result.accessToken, requiresAssessment: result.requiresAssessment });
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
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-semibold text-slate-900">{info.program?.name || 'This program'}</h1>
        <p className="mt-3 text-slate-600">
          {(info.reasons || []).map((r) => CLOSED_COPY[r]).filter(Boolean)[0] || 'Applications are closed right now.'}
        </p>
        <Link href="/programs" className="mt-6 inline-flex items-center gap-1 text-brand-700 font-medium">
          <ArrowLeft className="w-4 h-4" /> Browse other programs
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-12">
      <Link href={info.program ? `/programs/${info.program.id}` : '/programs'} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="w-4 h-4" /> Back
      </Link>

      <h1 className="mt-4 text-2xl font-semibold text-slate-900">Apply — {info.program?.name}</h1>
      <p className="mt-1 text-slate-600">{info.cohort.name}</p>
      {info.assessment && (
        <p className="mt-3 text-sm rounded-lg bg-brand-50 dark:bg-brand-500/15 text-brand-800 px-3 py-2">
          This application includes a {info.assessment.required ? 'required' : 'short'} assessment: <strong>{info.assessment.title}</strong>.
        </p>
      )}

      <div className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-card p-6">
        <div className="grid grid-cols-2 gap-4">
          <Field label="First name" value={form.firstName} onChange={(v) => setField('firstName', v)} />
          <Field label="Last name" value={form.lastName} onChange={(v) => setField('lastName', v)} />
        </div>
        <Field label="Email" type="email" required value={form.email} onChange={(v) => setField('email', v)} />
        <Field label="Phone" value={form.phone} onChange={(v) => setField('phone', v)} />

        {(info.formSchema || []).map((field) => (
          <div key={field.key}>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {field.label}{field.required && <span className="text-rose-500"> *</span>}
            </label>
            {field.type === 'textarea' ? (
              <textarea
                rows={3}
                value={form[field.key] || ''}
                onChange={(e) => setField(field.key, e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-card"
              />
            ) : field.type === 'select' ? (
              <select
                value={form[field.key] || ''}
                onChange={(e) => setField(field.key, e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-card"
              >
                <option value="">Select…</option>
                {(field.options || []).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            ) : (
              <input
                value={form[field.key] || ''}
                onChange={(e) => setField(field.key, e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-card"
              />
            )}
          </div>
        ))}

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
