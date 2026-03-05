'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Mail, CheckCircle2, XCircle, RotateCw, ArrowRight } from 'lucide-react';

export default function VerifyEmailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const emailParam = searchParams.get('email') || 'your-email@example.com';
  const [email, setEmail] = useState<string>('');
  const [status, setStatus] = useState<'pending' | 'success' | 'failed'>('pending');
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [resendCountdown, setResendCountdown] = useState(60);

  useEffect(() => {
    setEmail(emailParam);
  }, [emailParam]);

  useEffect(() => {
    if (resendCountdown > 0) {
      const timer = setTimeout(() => setResendCountdown(resendCountdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCountdown]);

  const handleCodeChange = (index: number, value: string) => {
    if (value.length > 1) return;

    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);

    // Auto-focus next input
    if (value && index < 5) {
      const nextInput = document.getElementById(`code-${index + 1}`);
      nextInput?.focus();
    }

    // Auto-verify when all filled
    if (newCode.every(digit => digit) && newCode.join('').length === 6) {
      setTimeout(() => verifyCode(newCode.join('')), 300);
    }
  };

  const verifyCode = async (enteredCode: string) => {
    setStatus('pending');
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'}/auth/verify-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ code: enteredCode })
      });

      if (response.ok) {
        setStatus('success');
        setTimeout(() => router.push('/login'), 2000);
      } else {
        setStatus('failed');
        setTimeout(() => {
          setStatus('pending');
          setCode(['', '', '', '', '', '']);
        }, 3000);
      }
    } catch (error) {
      console.error('Verification error:', error);
      setStatus('failed');
      setTimeout(() => {
        setStatus('pending');
        setCode(['', '', '', '', '', '']);
      }, 3000);
    }
  };

  const handleResend = () => {
    setResendCountdown(60);
    setCode(['', '', '', '', '', '']);
    setStatus('pending');
  };

  return (
    <div className="space-y-6">
      {/* Logo */}
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-600 rounded-2xl mb-4">
          <span className="text-white text-2xl">P</span>
        </div>
      </div>

      {/* Verification Card */}
      <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 p-8 border border-slate-100">
        {/* Icon */}
        <div className="flex justify-center mb-6">
          {status === 'pending' && (
            <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center">
              <Mail className="w-10 h-10 text-indigo-600" />
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
                We&apos;ve sent a 6-digit verification code to<br />
                <span className="text-slate-900">{email}</span>
              </p>
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
                The code you entered is incorrect.<br />
                Please try again.
              </p>
            </>
          )}
        </div>

        {/* Code Input */}
        {status !== 'success' && (
          <>
            <div className="flex gap-3 justify-center mb-6">
              {code.map((digit, index) => (
                <input
                  key={index}
                  id={`code-${index}`}
                  type="text"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleCodeChange(index, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Backspace' && !digit && index > 0) {
                      const prevInput = document.getElementById(`code-${index - 1}`);
                      prevInput?.focus();
                    }
                  }}
                  className={`w-12 h-14 text-center text-lg border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors ${status === 'failed'
                    ? 'border-red-300 bg-red-50'
                    : 'border-slate-200 focus:border-transparent'
                    }`}
                />
              ))}
            </div>

            {/* Resend */}
            <div className="text-center">
              {resendCountdown > 0 ? (
                <p className="text-slate-600 text-sm">
                  Resend code in <span className="text-indigo-600">{resendCountdown}s</span>
                </p>
              ) : (
                <button
                  onClick={handleResend}
                  className="text-indigo-600 hover:text-indigo-700 text-sm inline-flex items-center gap-2"
                >
                  <RotateCw className="w-4 h-4" />
                  Resend verification code
                </button>
              )}
            </div>
          </>
        )}

        {/* Success Action */}
        {status === 'success' && (
          <button
            onClick={() => router.push('/login')}
            className="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            Continue to Login
            <ArrowRight className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Help Text */}
      <p className="text-center text-slate-500 text-sm">
        Check your email inbox or spam folder for the verification code
      </p>
    </div>
  );
}
