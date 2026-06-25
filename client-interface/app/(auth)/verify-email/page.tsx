'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Mail, CheckCircle2, XCircle, RotateCw, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/services/api-client';
import { apiConfig } from '@/lib/config/api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';

export default function VerifyEmailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'pending' | 'verifying' | 'success' | 'failed'>('pending');
  const [email, setEmail] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [resending, setResending] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(60);

  const token = searchParams.get('token') || '';

  useEffect(() => {
    const emailFromQuery = searchParams.get('email') || '';
    if (emailFromQuery) {
      setEmail(emailFromQuery);
    }
  }, [searchParams]);

  useEffect(() => {
    if (resendCountdown > 0) {
      const timer = setTimeout(() => setResendCountdown(resendCountdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCountdown]);

  useEffect(() => {
    if (!token) {
      return;
    }

    const verifyToken = async () => {
      try {
        setStatus('verifying');
        setErrorMessage('');
        await apiClient.post(apiConfig.endpoints.verifyEmail, { token });
        setStatus('success');
        toast.success('Email verified successfully');
        setTimeout(() => router.push('/login'), 1800);
      } catch (error: any) {
        setStatus('failed');
        setErrorMessage(extractApiErrorMessage(error, 'Verification link is invalid or expired'));
      }
    };

    verifyToken();
  }, [token, router]);

  const handleResend = async () => {
    if (!email) {
      toast.error('Email is required to resend verification');
      return;
    }

    try {
      setResending(true);
      await apiClient.post(apiConfig.endpoints.resendVerification, { email });
      setResendCountdown(60);
      setStatus('pending');
      setErrorMessage('');
      toast.success('Verification email sent');
    } catch (error: any) {
      toast.error(extractApiErrorMessage(error, 'Failed to resend verification email'));
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Logo */}
      <div className="text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-tile.png" alt="Pathment" className="inline-block w-16 h-16 rounded-2xl shadow-sm mb-4" />
      </div>

      {/* Verification Card */}
      <div className="bg-card rounded-2xl shadow-xl shadow-slate-200/50 p-8 border border-slate-100">
        {/* Icon */}
        <div className="flex justify-center mb-6">
          {status === 'pending' && (
            <div className="w-20 h-20 bg-brand-100 rounded-full flex items-center justify-center">
              <Mail className="w-10 h-10 text-brand-600" />
            </div>
          )}
          {status === 'verifying' && (
            <div className="w-20 h-20 bg-brand-100 rounded-full flex items-center justify-center">
              <RotateCw className="w-10 h-10 text-brand-600 animate-spin" />
            </div>
          )}
          {status === 'success' && (
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10 text-green-600" />
            </div>
          )}
          {status === 'failed' && (
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center">
              <XCircle className="w-10 h-10 text-red-600" />
            </div>
          )}
        </div>

        {/* Messages */}
        <div className="text-center mb-8">
          {status === 'pending' && (
            <>
              <h2 className="text-slate-900 mb-2">Check your email</h2>
              <p className="text-slate-600">
                We&apos;ve sent a verification link to<br />
                <span className="text-slate-900">{email || 'your email address'}</span>
              </p>
            </>
          )}
          {status === 'verifying' && (
            <>
              <h2 className="text-slate-900 mb-2">Verifying your email...</h2>
              <p className="text-slate-600">Please wait while we confirm your verification link.</p>
            </>
          )}
          {status === 'success' && (
            <>
              <h2 className="text-green-900 mb-2">Email verified!</h2>
              <p className="text-green-700">
                Your account has been successfully verified.<br />
                Redirecting to login...
              </p>
            </>
          )}
          {status === 'failed' && (
            <>
              <h2 className="text-red-900 mb-2">Verification failed</h2>
              <p className="text-red-700">
                {errorMessage || 'The verification link is invalid or expired.'}
              </p>
            </>
          )}
        </div>

        {/* Code Input */}
        {status !== 'success' && status !== 'verifying' && (
          <>
            <div className="mb-6">
              <label className="block text-slate-700 text-sm mb-2">Email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            {/* Resend */}
            <div className="text-center">
              {resendCountdown > 0 ? (
                <p className="text-slate-600 text-sm">
                  Resend verification email in <span className="text-brand-600">{resendCountdown}s</span>
                </p>
              ) : (
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resending}
                  className="text-brand-600 hover:text-brand-700 disabled:text-brand-300 text-sm inline-flex items-center gap-2"
                >
                  <RotateCw className={`w-4 h-4 ${resending ? 'animate-spin' : ''}`} />
                  Resend verification email
                </button>
              )}
            </div>
          </>
        )}

        {/* Success Action */}
        {status === 'success' && (
          <button
            onClick={() => router.push('/login')}
            className="w-full bg-brand-600 hover:bg-brand-700 text-white py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            Continue to Login
            <ArrowRight className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Help Text */}
      <p className="text-center text-slate-500 text-sm">
        Open the verification link from your inbox. If it expires, request a new one.
      </p>
    </div>
  );
}
