'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Building2, CheckCircle2, Eye, EyeOff, Loader2, Mail } from 'lucide-react';
import { useAuth } from '@/lib/context/AuthContext';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { validatePassword } from '@/lib/utils/validation';
import { PasswordRequirements } from '@/components/shared/PasswordRequirements';

const workspaceSlug = (value: string) => value
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 63);

export function OrganizationSignup() {
  const { register } = useAuth();
  const [step, setStep] = useState<'email' | 'details' | 'sent'>('email');
  const [form, setForm] = useState({
    email: '', firstName: '', lastName: '', organizationName: '', slug: '', password: '', confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const field = 'w-full rounded-xl border border-slate-300 px-4 py-3.5 text-base focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-500';

  const continueWithEmail = (event: FormEvent) => {
    event.preventDefault();
    if (!form.email.trim()) return;
    setError('');
    setStep('details');
  };

  const setOrganizationName = (name: string) => {
    setForm((current) => ({ ...current, organizationName: name, slug: workspaceSlug(name) }));
  };

  const createOrganization = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (!form.firstName.trim() || !form.lastName.trim() || !form.organizationName.trim() || !form.slug) {
      setError('Complete your name and organization details.');
      return;
    }
    const password = validatePassword(form.password);
    if (!password.valid) {
      setError(password.errors[0]);
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSaving(true);
    try {
      await register({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        password: form.password,
        confirmPassword: form.confirmPassword,
        organization: {
          name: form.organizationName.trim(),
          slug: form.slug,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        },
      });
      setStep('sent');
    } catch (registrationError) {
      setError(extractApiErrorMessage(registrationError, 'Could not create your organization.'));
    } finally {
      setSaving(false);
    }
  };

  if (step === 'sent') {
    return (
      <div className="auth-register space-y-6 text-center">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-brand-50 text-brand-700">
          <CheckCircle2 className="h-8 w-8" aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-brand-900">Check your email</h1>
          <p className="mt-3 leading-6 text-slate-600">We sent a verification link to <strong className="text-slate-900">{form.email}</strong>.</p>
          <p className="mt-2 text-sm leading-6 text-slate-500">Verify your email, then sign in to open {form.organizationName}.</p>
        </div>
        <Link href={`/verify-email?email=${encodeURIComponent(form.email)}`} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3.5 font-semibold text-white hover:bg-brand-700">
          Verification help <ArrowRight className="h-5 w-5" aria-hidden="true" />
        </Link>
      </div>
    );
  }

  return (
    <div className="auth-register space-y-6">
      <div className="text-center">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[.16em] text-brand-700">Start an organization</p>
        <h1 className="text-brand-900">{step === 'email' ? 'Create your Pathment workspace' : 'Tell us about your organization'}</h1>
        <p className="mt-3 leading-6 text-slate-600">
          {step === 'email' ? 'Use your work email. You’ll become the workspace owner.' : 'Set up your secure workspace. You can invite your team after signing in.'}
        </p>
      </div>

      <div className="auth-card">
        {error && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

        {step === 'email' ? (
          <form onSubmit={continueWithEmail} className="space-y-4">
            <label htmlFor="signup-email" className="sr-only">Work email address</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input id="signup-email" autoFocus required type="email" autoComplete="email" placeholder="name@company.com" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} className={`${field} pl-12`} />
            </div>
            <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3.5 font-semibold text-white hover:bg-brand-700">Continue <ArrowRight className="h-5 w-5" aria-hidden="true" /></button>
          </form>
        ) : (
          <form onSubmit={createOrganization} className="space-y-4">
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <span className="min-w-0 truncate text-sm font-medium text-slate-800">{form.email}</span>
              <button type="button" onClick={() => { setStep('email'); setError(''); }} className="ml-3 shrink-0 text-sm font-semibold text-brand-700">Change</button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2"><span className="text-sm font-medium text-slate-700">First name</span><input required autoComplete="given-name" className={field} value={form.firstName} onChange={(event) => setForm((current) => ({ ...current, firstName: event.target.value }))} /></label>
              <label className="space-y-2"><span className="text-sm font-medium text-slate-700">Last name</span><input required autoComplete="family-name" className={field} value={form.lastName} onChange={(event) => setForm((current) => ({ ...current, lastName: event.target.value }))} /></label>
            </div>
            <label className="block space-y-2"><span className="text-sm font-medium text-slate-700">Organization name</span><div className="relative"><Building2 className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden="true" /><input required className={`${field} pl-12`} placeholder="Acme Learning" value={form.organizationName} onChange={(event) => setOrganizationName(event.target.value)} /></div></label>
            <label className="block space-y-2"><span className="text-sm font-medium text-slate-700">Workspace address</span><div className="flex rounded-xl border border-slate-300 focus-within:ring-2 focus-within:ring-brand-500"><span className="flex items-center pl-4 text-sm text-slate-500">app.pathment.me/w/</span><input required aria-label="Workspace address" className="min-w-0 flex-1 bg-transparent px-1 py-3.5 pr-4 text-base outline-none" value={form.slug} onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 63) }))} /></div></label>
            <label className="block space-y-2"><span className="text-sm font-medium text-slate-700">Password</span><div className="relative"><input required autoComplete="new-password" type={showPassword ? 'text' : 'password'} className={`${field} pr-12`} value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((visible) => !visible)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">{showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button></div></label>
            <PasswordRequirements password={form.password} />
            <label className="block space-y-2"><span className="text-sm font-medium text-slate-700">Confirm password</span><input required autoComplete="new-password" type="password" className={field} value={form.confirmPassword} onChange={(event) => setForm((current) => ({ ...current, confirmPassword: event.target.value }))} /></label>
            <button type="submit" disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3.5 font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60">{saving ? <><Loader2 className="h-5 w-5 animate-spin" /> Creating workspace…</> : <>Create organization <ArrowRight className="h-5 w-5" /></>}</button>
            <button type="button" onClick={() => setStep('email')} className="mx-auto flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-brand-700"><ArrowLeft className="h-4 w-4" /> Back</button>
          </form>
        )}

        <p className="mt-7 text-center text-sm text-slate-600">Already have an account? <Link href="/login" className="font-semibold text-brand-700 hover:text-brand-800">Sign in</Link></p>
      </div>
      <p className="text-center text-xs leading-5 text-slate-500">Joining someone else’s organization? Open the secure invitation they sent you.</p>
    </div>
  );
}
