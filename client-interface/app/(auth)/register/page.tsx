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
  existingAccount?: boolean;
  program?: { id: string; name: string } | null;
  clan?: { id: string; name: string } | null;
  applicant?: { firstName: string; lastName: string } | null;
};

type ClanJoinDetails = {
  role: 'mentee';
  emailLocked: boolean;
  program?: { id: string; name: string } | null;
  clan?: { id: string; name: string } | null;
  requiresApproval?: boolean;
  joinPath?: string;
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
  const [clanJoinDetails, setClanJoinDetails] = useState<ClanJoinDetails | null>(null);

  const [accepting, setAccepting] = useState(false);

  const inviteToken = searchParams.get('invite')?.trim() || '';
  const clanJoinSlug = searchParams.get('clanJoin')?.trim() || '';
  const joinReturnPath = clanJoinSlug ? `/clan/join/${encodeURIComponent(clanJoinSlug)}` : '';

  // Redirect if already logged in — unless this is an existing-account clan invite.
  useEffect(() => {
    if (isLoading || !user) return;
    if (inviteToken && inviteDetails?.existingAccount) return;
    router.push(joinReturnPath || `/${user.role}/dashboard`);
  }, [user, isLoading, router, joinReturnPath, inviteToken, inviteDetails]);

  // Validate invite token OR public clan join slug before allowing registration
  useEffect(() => {
    if (inviteToken && clanJoinSlug) {
      setInviteLoading(false);
      setInviteError('Use either an invite link or a clan joining link, not both.');
      return;
    }

    if (!inviteToken && !clanJoinSlug) {
      setInviteLoading(false);
      setInviteError('An invite link or clan joining link is required to create an account.');
      return;
    }

    const validate = async () => {
      try {
        setInviteLoading(true);
        setInviteError(null);

        if (inviteToken) {
          const response = await apiClient.get<any>(apiConfig.endpoints.validateInvite(inviteToken));
          const invite = response?.data?.invite || response?.invite;

          if (!invite || !invite.role || !invite.email) {
            throw new Error('Invalid invite response');
          }

          setInviteDetails(invite);
          setClanJoinDetails(null);
          setFormData((prev) => ({
            ...prev,
            email: invite.email,
            firstName: prev.firstName || invite.applicant?.firstName || '',
            lastName: prev.lastName || invite.applicant?.lastName || '',
          }));
          return;
        }

        const response = await apiClient.get<any>(apiConfig.endpoints.validateClanJoin(clanJoinSlug));
        const details = response?.data?.clanJoin || response?.clanJoin;
        if (!details?.clan?.name) {
          throw new Error('Invalid clan join response');
        }
        setClanJoinDetails(details);
        setInviteDetails(null);
      } catch (error: any) {
        const message = extractApiErrorMessage(
          error,
          inviteToken ? 'This invite is invalid or expired.' : 'This clan joining link is invalid or no longer available.'
        );
        setInviteError(message);
      } finally {
        setInviteLoading(false);
      }
    };

    validate();
  }, [inviteToken, clanJoinSlug]);

  if (isLoading || inviteLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user && !(inviteToken && inviteDetails?.existingAccount)) {
    return null;
  }

  const handleAcceptInvite = async () => {
    if (!inviteToken || !user) return;
    setAccepting(true);
    try {
      await apiClient.post(apiConfig.endpoints.acceptInvite(inviteToken));
      toast.success('You joined the clan.');
      router.push(`/${inviteDetails?.role === 'mentor' ? 'mentor' : 'mentee'}/dashboard`);
    } catch (error: any) {
      toast.error(extractApiErrorMessage(error, 'Could not accept this invite'));
    } finally {
      setAccepting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!inviteToken && !clanJoinSlug) {
      newErrors.general = 'A valid invite or clan joining link is required to register.';
    }
    if (inviteError) {
      newErrors.general = inviteError;
    }
    if (inviteToken && !inviteDetails) {
      newErrors.general = 'Invite details could not be loaded.';
    }
    if (clanJoinSlug && !clanJoinDetails) {
      newErrors.general = 'Clan joining details could not be loaded.';
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
      const payload = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        password: formData.password,
        confirmPassword: formData.confirmPassword,
        ...(inviteToken ? { inviteToken } : { clanJoinSlug }),
      };
      const result = await register(payload);
      setShowSuccess(true);

      if (clanJoinSlug) {
        const next = result?.clanJoin?.joinPath || joinReturnPath;
        toast.success('Account created! Log in to continue joining the clan.');
        setTimeout(() => router.push(`/login?next=${encodeURIComponent(next)}`), 1500);
      } else {
        toast.success('Account created! You can now log in.');
        setTimeout(() => router.push('/login'), 1500);
      }
    } catch (err: any) {
      const message = extractApiErrorMessage(err, 'Registration failed');
      toast.error(message);
      setErrors({ general: message });
    } finally {
      setLoading(false);
    }
  };

  const emailLocked = Boolean(inviteDetails?.email);

  return (
    <div className="space-y-6">
      <div className="text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-tile.png" alt="Pathment" className="inline-block w-16 h-16 rounded-2xl shadow-sm mb-4" />
        <h1 className="text-brand-900 mb-2">Create your Pathment account</h1>
        <p className="text-slate-600">
          {clanJoinSlug ? 'Continue from your clan joining link' : 'Invite-only signup for approved users'}
        </p>
      </div>

      <div className="bg-card rounded-2xl shadow-xl shadow-slate-200/50 p-8 border border-slate-100">
        {inviteError && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-red-900">{inviteToken ? 'Invite required' : 'Joining link unavailable'}</p>
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
            {inviteDetails.existingAccount && !user && (
              <p className="text-brand-700 text-sm mt-2">
                You already have an account.{' '}
                <Link href={`/login?next=${encodeURIComponent(`/register?invite=${inviteToken}`)}`} className="underline font-medium">
                  Sign in to join this clan
                </Link>
              </p>
            )}
            {inviteDetails.existingAccount && user && (
              <button
                type="button"
                onClick={handleAcceptInvite}
                disabled={accepting}
                className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-white text-sm font-medium disabled:opacity-50"
              >
                {accepting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                Join {inviteDetails.clan?.name || 'this clan'}
              </button>
            )}
          </div>
        )}

        {!inviteError && clanJoinDetails && (
          <div className="mb-6 p-4 bg-brand-50 dark:bg-brand-500/10 border border-brand-200 dark:border-brand-500/20 rounded-xl">
            <p className="text-brand-900 text-sm">
              You&apos;re joining <span className="font-semibold">{clanJoinDetails.clan?.name}</span>
              {clanJoinDetails.program ? <> in <span className="font-semibold">{clanJoinDetails.program.name}</span></> : null}
            </p>
            <p className="text-brand-700 text-sm mt-1">
              After you create your account and log in, you&apos;ll send a join request for Lead Mentor approval.
            </p>
          </div>
        )}

        {showSuccess && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-green-900">Account created successfully!</p>
              <p className="text-green-700 text-sm mt-1">
                {clanJoinSlug ? 'Redirecting to login to continue joining…' : 'Redirecting to login...'}
              </p>
            </div>
          </div>
        )}

        {errors.general && !inviteError && (
          <div className="mb-4 text-sm text-red-600">{errors.general}</div>
        )}

        {!inviteDetails?.existingAccount && (
        <form onSubmit={handleSubmit} className="space-y-5">
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

          <div>
            <label className="block text-slate-700 text-sm mb-2">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                disabled={emailLocked}
                className={`w-full pl-11 pr-4 py-3 border ${errors.email ? 'border-red-300' : 'border-slate-200'} rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent disabled:bg-slate-50`}
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

          <button
            type="submit"
            disabled={loading || Boolean(inviteError)}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            Create account
          </button>
        </form>
        )}

        <p className="text-center text-sm text-slate-500 mt-6">
          Already have an account?{' '}
          <Link
            href={joinReturnPath ? `/login?next=${encodeURIComponent(joinReturnPath)}` : '/login'}
            className="font-medium text-brand-700 hover:text-brand-800"
          >
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
