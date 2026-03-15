'use client';

import { useState, useRef, useEffect } from 'react';
import { AlertCircle, Loader2, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import * as Dialog from '@radix-ui/react-dialog';

interface TwoFactorCodeInputProps {
  isOpen: boolean;
  onVerify: (code: string) => Promise<void>;
  onCancel: () => void;
  userEmail?: string;
}

export function TwoFactorCodeInput({
  isOpen,
  onVerify,
  onCancel,
  userEmail,
}: TwoFactorCodeInputProps) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Handle automatic focus on digit input
  const handleDigitInput = (index: number, value: string) => {
    // Only allow digits
    if (!/^\d*$/.test(value)) return;

    const newCode = code.split('');
    newCode[index] = value;
    const newCodeStr = newCode.join('');
    setCode(newCodeStr);

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (code.length !== 6) {
      setError('Please enter all 6 digits');
      return;
    }

    setLoading(true);
    try {
      await onVerify(code);
      toast.success('Two-factor authentication verified!');
      setCode('');
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || 'Failed to verify code. Please try again.';
      setError(errorMsg);
      toast.error('Verification failed');
      setCode('');
      // Focus back to first input
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  // Reset form when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setCode('');
      setError('');
      setResendCountdown(0);
    } else {
      // Focus first input when opened
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    }
  }, [isOpen]);

  return (
    <Dialog.Root open={isOpen} onOpenChange={onCancel}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white shadow-2xl">
          <div className="p-8">
            {/* Header */}
            <div className="mb-6 text-center">
              <div className="mb-4 flex justify-center">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-indigo-100 rounded-full">
                  <ShieldAlert className="w-6 h-6 text-indigo-600" />
                </div>
              </div>
              <Dialog.Title className="text-xl font-semibold text-slate-900">
                Two-Factor Authentication
              </Dialog.Title>
              <p className="mt-2 text-sm text-slate-600">
                Enter the 6-digit code from your authenticator app
              </p>
              {userEmail && (
                <p className="mt-1 text-xs text-slate-500">{userEmail}</p>
              )}
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-6 rounded-lg bg-red-50 border border-red-200 p-3 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* Code Input Form */}
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* 6-Digit Code Input */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-3">
                  Authentication Code
                </label>
                <div className="flex gap-2 justify-center">
                  {[...Array(6)].map((_, index) => (
                    <input
                      key={index}
                      ref={(el) => {
                        inputRefs.current[index] = el;
                      }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={code[index] || ''}
                      onChange={(e) => handleDigitInput(index, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(index, e)}
                      className="w-12 h-12 text-center text-xl font-semibold border-2 border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                      disabled={loading}
                    />
                  ))}
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading || code.length !== 6}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  'Verify Code'
                )}
              </button>
            </form>

            {/* Info Text */}
            <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-xs text-blue-700">
                <strong>Tip:</strong> Check your authenticator app (Google Authenticator, Microsoft Authenticator, Authy, etc.) for the 6-digit code.
              </p>
            </div>

            {/* Cancel Button */}
            <button
              onClick={onCancel}
              disabled={loading}
              className="mt-6 w-full text-slate-700 hover:text-slate-900 font-medium py-2 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
