'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/context/AuthContext';
import { Mail, Lock, User, ArrowRight, CheckCircle2, AlertCircle, Loader2, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/services/api-client';
import { apiConfig } from '@/lib/config/api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { validatePassword } from '@/lib/utils/validation';
import { PasswordRequirements } from '@/components/shared/PasswordRequirements';

type InviteDetails = {
  id: string;
  email: string;
  role: 'mentor' | 'mentee';
  expiresAt: string;
  program?: { id: string; name: string } | null;
  clan?: { id: string; name: string } | null;
  applicant?: { firstName: string; lastName: string } | null;
};

export default function RegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { register, user, isLoading } = useAuth();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: ''
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showSuccess, setShowSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(true);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteDetails, setInviteDetails] = useState<InviteDetails | null>(null);

  const inviteToken = searchParams.get('invite')?.trim() || '';

  // Redirect if already logged in
  useEffect(() => {
    if (!isLoading && user) {
      const dashboard = `/${user.role}/dashboard`;
      router.push(dashboard);
    }
  }, [user, isLoading, router]);

  // Validate invite token before allowing registration
  useEffect(() => {
    if (!inviteToken) {
      setInviteLoading(false);
      setInviteError('An invite link is required to create an account.');
      return;
    }

    const validateInvite = async () => {
      try {
        setInviteLoading(true);
        setInviteError(null);

        const response = await apiClient.get<any>(apiConfig.endpoints.validateInvite(inviteToken));
        const invite = response?.data?.invite || response?.invite;

        if (!invite || !invite.role || !invite.email) {
          throw new Error('Invalid invite response');
        }

        setInviteDetails(invite);
        // Prefill name from the original application so the applicant doesn't
        // re-type what they already gave at intake.
        setFormData((prev) => ({
          ...prev,
          email: invite.email,
          firstName: prev.firstName || invite.applicant?.firstName || '',
          lastName: prev.lastName || invite.applicant?.lastName || '',
        }));
      } catch (error: any) {
        const message = extractApiErrorMessage(error, 'This invite is invalid or expired.');
        setInviteError(message);
      } finally {
        setInviteLoading(false);
      }
    };

    validateInvite();
  }, [inviteToken]);

  // Show loading while checking auth
  if (isLoading || inviteLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Don't render register form if user is logged in
  if (user) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!inviteToken) {
      newErrors.general = 'A valid invite link is required to register.';
    }
    if (inviteError) {
      newErrors.general = inviteError;
    }
    if (!inviteDetails) {
      newErrors.general = 'Invite details could not be loaded.';
    }

    if (!formData.firstName) newErrors.firstName = 'First name is required';
    if (!formData.lastName) newErrors.lastName = 'Last name is required';
    if (!formData.email) newErrors.email = 'Email is required';
    const pw = validatePassword(formData.password);
    if (!pw.valid) newErrors.password = pw.errors[0];
    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);
    try {
      await register({
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        password: formData.password,
        confirmPassword: formData.confirmPassword,
        inviteToken
      });
      setShowSuccess(true);
      toast.success('Account created! You can now log in.');
      setTimeout(() => router.push('/login'), 1500);
    } catch (err: any) {
      const message = extractApiErrorMessage(err, 'Registration failed');
      toast.error(message);
      setErrors({ general: message });
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
        <h1 className="text-brand-900 mb-2">Create your Pathment account</h1>
        <p className="text-slate-600">Invite-only signup for approved users</p>
      </div>

      {/* Registration Form */}
      <div className="bg-card rounded-2xl shadow-xl shadow-slate-200/50 p-8 border border-slate-100">
        {inviteError && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-red-900">Invite required</p>
              <p className="text-red-700 text-sm mt-1">{inviteError}</p>
            </div>
          </div>
        )}

        {!inviteError && inviteDetails && (
          <div className="mb-6 p-4 bg-brand-50 dark:bg-brand-500/10 border border-brand-200 dark:border-brand-500/20 rounded-xl">
            <p className="text-brand-900 text-sm">
              You are invited as <span className="font-semibold capitalize">{inviteDetails.role}</span>
            </p>
            <p className="text-brand-700 text-sm mt-1">Invite email: {inviteDetails.email}</p>
            {(inviteDetails.program || inviteDetails.clan) && (
              <p className="text-brand-700 text-sm mt-1">
                {inviteDetails.role === 'mentor' ? 'Mentoring' : 'Joining'}
                {inviteDetails.program ? <> <span className="font-semibold">{inviteDetails.program.name}</span></> : ''}
                {inviteDetails.clan ? <> · clan <span className="font-semibold">{inviteDetails.clan.name}</span></> : ''}
              </p>
            )}
          </div>
        )}

        {showSuccess && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-green-900">Account created successfully!</p>
              <p className="text-green-700 text-sm mt-1">Redirecting to login...</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* First Name & Last Name */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-700 text-sm mb-2">First Name</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  className={`w-full pl-11 pr-4 py-3 border ${errors.firstName ? 'border-red-300' : 'border-slate-200'} rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent`}
                  placeholder="John"
                />
              </div>
              {errors.firstName && (
                <p className="text-red-600 text-sm mt-1 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" />
                  {errors.firstName}
                </p>
              )}
            </div>

            <div>
              <label className="block text-slate-700 text-sm mb-2">Last Name</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  className={`w-full pl-11 pr-4 py-3 border ${errors.lastName ? 'border-red-300' : 'border-slate-200'} rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent`}
                  placeholder="Doe"
                />
              </div>
              {errors.lastName && (
                <p className="text-red-600 text-sm mt-1 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" />
                  {errors.lastName}
                </p>
              )}
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-slate-700 text-sm mb-2">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  disabled={!!inviteDetails?.email}
                className={`w-full pl-11 pr-4 py-3 border ${errors.email ? 'border-red-300' : 'border-slate-200'} rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent`}
                placeholder="you@example.com"
              />
            </div>
            {errors.email && (
              <p className="text-red-600 text-sm mt-1 flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                {errors.email}
              </p>
            )}
          </div>

          {/* Password */}
          <div>
            <label className="block text-slate-700 text-sm mb-2">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className={`w-full pl-11 pr-12 py-3 border ${errors.password ? 'border-red-300' : 'border-slate-200'} rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent`}
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            {errors.password && (
              <p className="text-red-600 text-sm mt-1 flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                {errors.password}
              </p>
            )}
            <PasswordRequirements password={formData.password} />
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block text-slate-700 text-sm mb-2">Confirm Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                className={`w-full pl-11 pr-12 py-3 border ${errors.confirmPassword ? 'border-red-300' : 'border-slate-200'} rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent`}
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            {errors.confirmPassword && (
              <p className="text-red-600 text-sm mt-1 flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                {errors.confirmPassword}
              </p>
            )}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || !!inviteError}
            className="w-full bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 text-white py-3 rounded-xl transition-colors flex items-center justify-center gap-2 group"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Creating account...
              </>
            ) : (
              <>
                Create Account
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </form>

        {/* Login Link */}
        <div className="mt-6 text-center">
          <p className="text-slate-600 text-sm">
            Already have an account?{' '}
            <Link href="/login" className="text-brand-600 hover:text-brand-700">
              Sign in
            </Link>
          </p>
        </div>
      </div>

      {/* Footer */}
      <p className="text-center text-slate-500 text-sm">
        By signing up, you agree to our Terms of Service and Privacy Policy
      </p>
    </div>
  );
}
