'use client';

import { useCallback, useState, useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/context/AuthContext';
import { TwoFactorCodeInput } from '@/components/shared/TwoFactorCodeInput';
import { extractApiErrorMessage, getRateLimit, formatRetryAfter, getErrorCode } from '@/lib/utils/api-error';
import { Mail, Lock, ArrowRight, AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { workspaceLandingPath, workspacePath, workspaceSlugFromPathname } from '@/lib/services/workspace-scope';
import { tokenStore } from '@/lib/services/token-store';

export default function LoginPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { login, verify2FA, user, isLoading, requiresTwoFactor } = useAuth();
  const [formData, setFormData] = useState({ email: '', password: '' });
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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-tile.png" alt="Pathment" className="inline-block w-16 h-16 rounded-2xl shadow-sm mb-4" />
        <h1 className="text-brand-900 mb-2">Welcome back to Pathment</h1>
        <p className="text-slate-600">Sign in to pick up where you left off.</p>
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

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Email */}
          <div>
            <label htmlFor="login-email" className="block text-slate-700 text-sm mb-2">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                id="login-email" autoComplete="email" type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                placeholder="you@example.com"
                required
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="login-password" className="block text-slate-700 text-sm">Password</label>
              <Link href={authPath('/reset-password')} className="text-brand-600 hover:text-brand-700 text-sm">
                Forgot?
              </Link>
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                id="login-password" autoComplete="current-password" type={showPassword ? 'text' : 'password'}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full pl-11 pr-12 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Remember Me — checked: stay signed in on this device for 30 days.
              Unchecked: session-only, signs you out when the browser is closed. */}
          <div className="flex items-start">
            <input
              type="checkbox"
              id="remember"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="w-4 h-4 mt-0.5 text-brand-600 border-slate-300 rounded focus:ring-brand-500"
            />
            <label htmlFor="remember" className="ml-2 text-slate-700 text-sm">
              Keep me signed in for 30 days
              <span className="block text-xs text-slate-400">
                {rememberMe
                  ? 'Stays signed in on this device.'
                  : 'Signs out when you close the browser — best on shared computers.'}
              </span>
            </label>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || cooldownSec > 0}
            className="w-full bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 disabled:cursor-not-allowed text-white py-3 rounded-xl transition-colors flex items-center justify-center gap-2 group"
          >
            {loading ? (
              'Signing in...'
            ) : cooldownSec > 0 ? (
              `Try again in ${formatRetryAfter(cooldownSec)}`
            ) : (
              <>
                Sign In
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </form>

        {/* Register Link */}
        <div className="mt-6 text-center">
          <p className="text-slate-600 text-sm">
            Don&apos;t have an account?{' '}
            <Link href={authPath('/register')} className="text-brand-600 hover:text-brand-700">
              Sign up
            </Link>
          </p>
        </div>
      </div>

      {/* Security Notice */}
      <div className="flex items-center justify-center gap-2 text-slate-500 text-sm">
        <Lock className="w-4 h-4" />
        <span>Your account, your learning journey</span>
      </div>
    </div>
  );
}
