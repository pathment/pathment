'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/context/AuthContext';
import { TwoFactorCodeInput } from '@/components/shared/TwoFactorCodeInput';
import { Mail, Lock, ArrowRight, AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, verify2FA, user, isLoading, requiresTwoFactor } = useAuth();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Check if redirected due to expired session
  useEffect(() => {
    const expired = searchParams.get('expired');
    if (expired === 'true') {
      toast.error('Your session has expired. Please log in again.');
    }
  }, [searchParams]);

  // Redirect if already logged in
  useEffect(() => {
    if (!isLoading && user && !requiresTwoFactor) {
      const dashboard = `/${user.role}/dashboard`;
      router.push(dashboard);
    }
  }, [user, isLoading, requiresTwoFactor, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await login(formData);
      // Use returned result instead of state to avoid stale value race.
      if (!result.requiresTwoFactor) {
        toast.success('Welcome back!');
        router.push('/');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Invalid email or password');
      toast.error('Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handle2FAVerify = async (code: string) => {
    try {
      await verify2FA(code);
      // After successful 2FA, redirect to dashboard
      if (user) {
        router.push(`/${user.role}/dashboard`);
      }
    } catch (err: any) {
      throw err;
    }
  };

  // Show loading while checking auth
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Don't render login form if user is logged in and doesn't require 2FA (redirect will happen via useEffect)
  if (user && !requiresTwoFactor) {
    return null;
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
          window.location.href = '/login';
        }}
        userEmail={user?.email}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Logo & Header */}
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-600 rounded-2xl mb-4">
          <span className="text-white text-2xl">P</span>
        </div>
        <h1 className="text-indigo-900 mb-2">Welcome back to Pathment</h1>
        <p className="text-slate-600">Sign in to continue your journey</p>
      </div>

      {/* Login Form */}
      <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 p-8 border border-slate-100">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-red-900">{error}</p>
              <p className="text-red-700 text-sm mt-1">Please check your credentials and try again</p>
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
            <label className="block text-slate-700 text-sm mb-2">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="you@example.com"
                required
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-slate-700 text-sm">Password</label>
              <Link href="/reset-password" className="text-indigo-600 hover:text-indigo-700 text-sm">
                Forgot?
              </Link>
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full pl-11 pr-12 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Remember Me */}
          <div className="flex items-center">
            <input
              type="checkbox"
              id="remember"
              className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
            />
            <label htmlFor="remember" className="ml-2 text-slate-700 text-sm">
              Remember me for 30 days
            </label>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white py-3 rounded-xl transition-colors flex items-center justify-center gap-2 group"
          >
            {loading ? (
              'Signing in...'
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
            Don't have an account?{' '}
            <Link href="/register" className="text-indigo-600 hover:text-indigo-700">
              Sign up
            </Link>
          </p>
        </div>
      </div>

      {/* Security Notice */}
      <div className="flex items-center justify-center gap-2 text-slate-500 text-sm">
        <Lock className="w-4 h-4" />
        <span>Secured with 256-bit SSL encryption</span>
      </div>
    </div>
  );
}
