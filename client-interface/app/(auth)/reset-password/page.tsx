'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Mail, Lock, ArrowRight, CheckCircle2, ArrowLeft, Loader2, Eye, EyeOff } from 'lucide-react';
import { apiClient } from '@/lib/services/api-client';
import { apiConfig } from '@/lib/config/api';
import { validatePassword } from '@/lib/utils/validation';
import { PasswordRequirements } from '@/components/shared/PasswordRequirements';

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<'email' | 'sent' | 'password' | 'success'>('email');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // If the user arrives via the email link (?token=...), jump straight to password step
  useEffect(() => {
    const t = searchParams.get('token');
    if (t) {
      setToken(t);
      setStep('password');
    }
  }, [searchParams]);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await apiClient.post(apiConfig.endpoints.forgotPassword, { email });
      setStep('sent');
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
        err?.message ||
        'Failed to send reset email. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    const pw = validatePassword(password);
    if (!pw.valid) {
      setError(pw.errors[0]);
      return;
    }
    setLoading(true);
    try {
      await apiClient.post(apiConfig.endpoints.resetPassword, { token, password, confirmPassword });
      setStep('success');
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
        err?.message ||
        'Failed to reset password. The link may have expired.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Logo & Header */}
      <div className="text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-tile.png" alt="Pathment" className="inline-block w-16 h-16 rounded-2xl shadow-sm mb-4" />
        <h1 className="text-brand-900 mb-2">
          {step === 'email' && 'Reset your password'}
          {step === 'sent' && 'Check your email'}
          {step === 'password' && 'Create new password'}
          {step === 'success' && 'Password reset successful'}
        </h1>
        <p className="text-slate-600">
          {step === 'email' && 'Enter your email to receive a reset link'}
          {step === 'sent' && `A reset link has been sent to ${email}`}
          {step === 'password' && 'Choose a strong password'}
          {step === 'success' && 'Your password has been updated'}
        </p>
      </div>

      {/* Reset Card */}
      <div className="bg-card rounded-2xl shadow-xl shadow-slate-200/50 p-8 border border-slate-100">

        {/* Error banner */}
        {error && (
          <div className="mb-5 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Email Step */}
        {step === 'email' && (
          <form onSubmit={handleEmailSubmit} className="space-y-5">
            <div>
              <label className="block text-slate-700 text-sm mb-2">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  placeholder="you@example.com"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 disabled:cursor-not-allowed text-white py-3 rounded-xl transition-colors flex items-center justify-center gap-2 group"
            >
              {loading ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Sending...</>
              ) : (
                <>Send Reset Link <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" /></>
              )}
            </button>
          </form>
        )}

        {/* Email Sent Step */}
        {step === 'sent' && (
          <div className="text-center space-y-6">
            <div className="flex justify-center">
              <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center">
                <Mail className="w-10 h-10 text-blue-600" />
              </div>
            </div>
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-900">
              We sent a password reset link to <span className="font-medium">{email}</span>.
              Click the link in that email to set a new password. It expires in 1 hour.
            </div>
            <button
              type="button"
              onClick={() => { setStep('email'); setError(''); }}
              className="w-full text-slate-600 hover:text-slate-900 text-sm flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Use a different email
            </button>
          </div>
        )}

        {/* New Password Step */}
        {step === 'password' && (
          <form onSubmit={handlePasswordSubmit} className="space-y-5">
            <div>
              <label className="block text-slate-700 text-sm mb-2">New Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-11 pr-12 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  placeholder="••••••••"
                  required
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              <PasswordRequirements password={password} />
            </div>

            <div>
              <label className="block text-slate-700 text-sm mb-2">Confirm New Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full pl-11 pr-12 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  placeholder="••••••••"
                  required
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 disabled:cursor-not-allowed text-white py-3 rounded-xl transition-colors flex items-center justify-center gap-2 group"
            >
              {loading ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Resetting...</>
              ) : (
                <>Reset Password <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" /></>
              )}
            </button>
          </form>
        )}

        {/* Success Step */}
        {step === 'success' && (
          <div className="text-center space-y-6">
            <div className="flex justify-center">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10 text-green-600" />
              </div>
            </div>

            <div>
              <p className="text-slate-900 mb-2">Your password has been reset successfully!</p>
              <p className="text-slate-600 text-sm">You can now sign in with your new password</p>
            </div>

            <button
              onClick={() => router.push('/login')}
              className="w-full bg-brand-600 hover:bg-brand-700 text-white py-3 rounded-xl transition-colors flex items-center justify-center gap-2 group"
            >
              Continue to Login
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        )}

        {/* Back to Login */}
        {step === 'email' && (
          <div className="mt-6 text-center">
            <Link href="/login" className="text-brand-600 hover:text-brand-700 text-sm inline-flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back to login
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
