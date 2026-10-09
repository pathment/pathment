'use client';

import { useCallback, useState, useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/context/AuthContext';
import { TwoFactorCodeInput } from '@/components/shared/TwoFactorCodeInput';
import { extractApiErrorMessage, getRateLimit, formatRetryAfter, getErrorCode } from '@/lib/utils/api-error';
import { Mail, Lock, ArrowRight, ArrowLeft, AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { workspaceLandingPath, workspacePath, workspaceSlugFromPathname } from '@/lib/services/workspace-scope';
import { tokenStore } from '@/lib/services/token-store';

export default function LoginPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { login, verify2FA, user, isLoading, requiresTwoFactor } = useAuth();
  const initialEmail = searchParams.get('email')?.trim() || '';
  const [formData, setFormData] = useState({ email: initialEmail, password: '' });
  const [step, setStep] = useState<'email' | 'password'>(initialEmail ? 'password' : 'email');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  // Rate-limit cooldown: timestamp (ms) until which login is blocked, + a 1s tick.
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const cooldownSec = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
  // A neutral `/login` must stay account-level even when this browser has a
  // workspace cookie from an earlier visit. Only an explicit `/w/:slug/login`
  // is workspace-scoped.
  const scopedWorkspace = workspaceSlugFromPathname(pathname);
  const authPath = (path: string) => scopedWorkspace ? workspacePath(path, scopedWorkspace) : path;

  // Tick every second while a cooldown is active so the countdown updates live.
  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [cooldownUntil]);

  // Where to land after signing in. An expired session carries the page the user
  // was on (`?next=`) so they resume where they were — a mentor bounced out of a
  // live review comes back to the review, not to a dashboard. Same-origin paths
  // only: anything else is ignored so the param can't be used as an open redirect.
  const nextParam = searchParams.get('next');
  const returnTo = nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : null;
  const destinationFor = useCallback((currentUser: Parameters<typeof workspaceLandingPath>[0]) => {
    if (!scopedWorkspace) return '/';
    return returnTo ? workspacePath(returnTo) : workspaceLandingPath(currentUser);
  }, [returnTo, scopedWorkspace]);

  // Check if redirected due to expired session
  useEffect(() => {
    const expired = searchParams.get('expired');
    if (expired === 'true') {
      toast.error('Your session has expired. Please log in again.');
    }
  }, [searchParams]);

  // Redirect if already logged in
  useEffect(() => {
    if (isLoading || requiresTwoFactor || redirecting) return;
    if (!scopedWorkspace && tokenStore.getToken()) {
      router.replace('/');
    } else if (user) {
      router.replace(destinationFor(user));
    }
  }, [user, isLoading, requiresTwoFactor, redirecting, router, destinationFor, scopedWorkspace]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setWorkspaceError(null);
    setLoading(true);

    try {
      const result = await login(formData, rememberMe);
      // Use returned result instead of state to avoid stale value race.
      if (!result.requiresTwoFactor && result.user) {
        const destination = destinationFor(result.user);
        setRedirecting(true);
        toast.success('Welcome back!');
        router.replace(destination);
      }
    } catch (err: unknown) {
      const code = getErrorCode(err);
      setWorkspaceError(code?.startsWith('WORKSPACE_') ? code : null);
      const rl = getRateLimit(err);
      if (rl.limited) {
        setCooldownUntil(Date.now() + rl.retryAfterSec * 1000);
        setNow(Date.now());
        setError(rl.message);
        toast.error(`Too many attempts - try again in ${formatRetryAfter(rl.retryAfterSec)}`);
      } else {
        setError(extractApiErrorMessage(err, 'Invalid email or password'));
        toast.error('Login failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const continueWithEmail = (event: React.FormEvent) => {
    event.preventDefault();
    if (!formData.email.trim()) return;
    setError('');
    setWorkspaceError(null);
    setStep('password');
  };

  const handle2FAVerify = async (code: string) => {
    const verifiedUser = await verify2FA(code, rememberMe);
    // After successful 2FA, resume where they were (or the dashboard).
    const destination = destinationFor(verifiedUser);
    setRedirecting(true);
    router.replace(destination);
  };

  // Show loading while checking auth
  if (isLoading || redirecting || (user && !requiresTwoFactor)) {
    return (
      <div role="status" className="flex min-h-64 flex-col items-center justify-center gap-3 text-slate-600">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" aria-hidden="true" />
        <span>{redirecting || user ? 'Opening your workspace…' : 'Checking your account…'}</span>
      </div>
    );
  }

  // If user is pending 2FA verification, only show the 2FA modal
  if (user && requiresTwoFactor) {
    return (
      <TwoFactorCodeInput
        isOpen={true}
        onVerify={handle2FAVerify}
        onCancel={() => {
          // Reset form and logout user to go back to login if they cancel
          setFormData({ email: '', password: '' });
          setError('');
          window.location.href = authPath('/login');
        }}
        userEmail={user?.email}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Logo & Header */}
      <div className="text-center">
        <h1 className="text-brand-900 mb-3">{step === 'email' ? 'Sign in to Pathment' : 'Enter your password'}</h1>
        <p className="text-slate-600">
          {step === 'email' ? 'Use the email address connected to your organization.' : 'Continue with your Pathment account.'}
        </p>
      </div>

      {/* Login Form */}
      <div className="auth-card">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-red-900">{error}</p>
              <p className="text-red-700 text-sm mt-1">
                {workspaceError
                  ? 'This is a workspace setup or selection issue. Your password has not been checked.'
                  : cooldownSec > 0
                  ? `You can try again in ${formatRetryAfter(cooldownSec)}.`
                  : 'Please check your credentials and try again'}
              </p>
              {scopedWorkspace && workspaceError === 'WORKSPACE_NOT_FOUND' && (
                <Link className="mt-2 inline-block text-sm underline" href="/">
                  Choose another workspace
                </Link>
              )}
            </div>
          </div>
        )}

        {/* Demo Credentials */}
        {/* <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
          <p className="text-blue-900 text-sm mb-2">Demo Credentials:</p>
          <div className="text-blue-700 text-sm space-y-1">
            <p>• Admin: admin@pathment.com</p>
            <p>• Mentor: mentor@pathment.com</p>
            <p>• Mentee: mentee@pathment.com</p>
            <p className="text-blue-600 mt-2">Password: any text</p>
          </div>
        </div> */}

        {step === 'email' ? (
          <form onSubmit={continueWithEmail} className="space-y-4">
            <label htmlFor="login-email" className="sr-only">Email address</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input
                id="login-email" autoComplete="email" type="email" autoFocus
                value={formData.email}
                onChange={(event) => setFormData((current) => ({ ...current, email: event.target.value }))}
                className="w-full rounded-xl border border-slate-300 py-3.5 pl-12 pr-4 text-base focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="name@work-email.com"
                required
              />
            </div>
            <button type="submit" className="group flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3.5 font-semibold text-white transition-colors hover:bg-brand-700">
              Continue <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <span className="min-w-0 truncate text-sm font-medium text-slate-800">{formData.email}</span>
              <button type="button" onClick={() => { setStep('email'); setFormData((current) => ({ ...current, password: '' })); setError(''); }} className="ml-3 shrink-0 text-sm font-semibold text-brand-700 hover:text-brand-800">Change</button>
            </div>
            <input type="email" autoComplete="email" value={formData.email} readOnly className="sr-only" tabIndex={-1} aria-hidden="true" />
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label htmlFor="login-password" className="text-sm font-medium text-slate-700">Password</label>
                <Link href={authPath('/reset-password')} className="text-sm font-medium text-brand-700 hover:text-brand-800">Forgot password?</Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input id="login-password" autoComplete="current-password" autoFocus type={showPassword ? 'text' : 'password'} value={formData.password} onChange={(event) => setFormData((current) => ({ ...current, password: event.target.value }))} className="w-full rounded-xl border border-slate-300 py-3.5 pl-12 pr-12 text-base focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-500" placeholder="Enter your password" required />
                <button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((visible) => !visible)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>
            <div className="flex items-start">
              <input type="checkbox" id="remember" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
              <label htmlFor="remember" className="ml-2 text-sm text-slate-700">Keep me signed in for 30 days</label>
            </div>
            <button type="submit" disabled={loading || cooldownSec > 0} className="group flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3.5 font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-brand-400">
              {loading ? 'Signing in…' : cooldownSec > 0 ? `Try again in ${formatRetryAfter(cooldownSec)}` : <>Sign in <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" /></>}
            </button>
            <button type="button" onClick={() => setStep('email')} className="mx-auto flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-brand-700"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Use another email</button>
          </form>
        )}

        {/* Registration is organization-led. A generic signup link creates a
            dead end because every account must begin with a trusted invite. */}
        <p className="mt-8 text-center text-sm text-slate-600">
          New to Pathment? <Link href={authPath('/register')} className="font-semibold text-brand-700 hover:text-brand-800">See how to join an organization</Link>
        </p>
      </div>

      {/* Security Notice */}
      <p className="text-center text-xs text-slate-500">After sign-in, Pathment opens your recent workspace or lets you choose one.</p>
    </div>
  );
}
