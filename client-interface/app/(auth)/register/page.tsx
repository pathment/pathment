'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/context/AuthContext';
import { Mail, Lock, User, ArrowRight, CheckCircle2, AlertCircle, Loader2, Eye, EyeOff, Building2, LogIn, MailCheck } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/services/api-client';
import { apiConfig } from '@/lib/config/api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { validatePassword } from '@/lib/utils/validation';
import { PasswordRequirements } from '@/components/shared/PasswordRequirements';
import { workspacePath, workspaceSlugFromPathname } from '@/lib/services/workspace-scope';

type InviteDetails = {
  id: string;
  email: string;
  role: 'mentor' | 'mentee';
  expiresAt: string;
  existingAccount?: boolean;
  organization?: { id: string; name: string; slug: string; logoUrl?: string | null } | null;
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
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { register, user, isLoading, refreshUser } = useAuth();
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
  const scopedWorkspace = workspaceSlugFromPathname(pathname);
  const scopedPath = (path: string) => workspacePath(path, scopedWorkspace);

  // Redirect if already logged in — unless this is an existing-account clan invite.
  useEffect(() => {
    if (isLoading || !user) return;
    if (inviteToken) return;
    router.push(workspacePath(joinReturnPath || '/', scopedWorkspace));
  }, [user, isLoading, router, joinReturnPath, inviteToken, inviteDetails, scopedWorkspace]);

  // Validate invite token OR public clan join slug before allowing registration
  useEffect(() => {
    if (inviteToken && clanJoinSlug) {
      setInviteLoading(false);
      setInviteError('Use either an invite link or a clan joining link, not both.');
      return;
    }

    if (!inviteToken && !clanJoinSlug) {
      setInviteLoading(false);
      return;
    }

    const validate = async () => {
      try {
        setInviteLoading(true);
        setInviteError(null);

        if (inviteToken) {
          const response = await apiClient.get<{ data?: { invite?: InviteDetails }; invite?: InviteDetails }>(apiConfig.endpoints.validateInvite(inviteToken));
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

          // Old/raw invite URLs are still accepted, then canonicalized onto the
          // organization URL. The registration form should always visibly
          // belong to the workspace the person is joining.
          const inviteWorkspace = invite.organization?.slug;
          if (inviteWorkspace && workspaceSlugFromPathname(pathname) !== inviteWorkspace) {
            router.replace(workspacePath(`/register?invite=${encodeURIComponent(inviteToken)}`, inviteWorkspace));
            return;
          }
          return;
        }

        const response = await apiClient.get<{ data?: { clanJoin?: ClanJoinDetails }; clanJoin?: ClanJoinDetails }>(apiConfig.endpoints.validateClanJoin(clanJoinSlug));
        const details = response?.data?.clanJoin || response?.clanJoin;
        if (!details?.clan?.name) {
          throw new Error('Invalid clan join response');
        }
        setClanJoinDetails(details);
        setInviteDetails(null);
      } catch (error: unknown) {
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
  }, [inviteToken, clanJoinSlug, pathname, router]);

  if (isLoading || inviteLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user && !inviteToken) {
    return null;
  }

  if (!inviteToken && !clanJoinSlug) {
    return (
      <div className="space-y-6">
        <div className="text-left">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-tile.png" alt="Pathment" className="mb-5 inline-block h-12 w-12 rounded-xl shadow-sm" />
          <p className="mb-2 text-xs font-semibold uppercase tracking-[.16em] text-brand-700">Organization access</p>
          <h1 className="text-brand-900">Join Pathment through your organization</h1>
          <p className="mt-3 leading-6 text-slate-600">
            Pathment accounts are connected to a real workspace, so there is no public account signup form.
          </p>
        </div>

        <div className="auth-card space-y-5">
          <div className="flex gap-4 rounded-2xl border border-brand-100 bg-brand-50/70 p-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-brand-700 shadow-sm">
              <MailCheck className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="font-medium text-brand-950">Open your invitation email</p>
              <p className="mt-1 text-sm leading-5 text-slate-600">
                Your organization&apos;s invitation opens its verified workspace and secure account setup automatically.
              </p>
            </div>
          </div>

          <div className="flex gap-4 px-1">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
              <Building2 className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-medium text-slate-900">No invitation yet?</p>
              <p className="mt-1 text-sm leading-5 text-slate-600">Ask your organization administrator to invite your email address.</p>
            </div>
          </div>

          <Link href={scopedPath('/login')} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-brand-700">
            <LogIn className="h-4 w-4" aria-hidden="true" />
            Sign in to an existing account
          </Link>
        </div>
      </div>
    );
  }

  const handleAcceptInvite = async () => {
    if (!inviteToken || !user) return;
    setAccepting(true);
    try {
      await apiClient.post(apiConfig.endpoints.acceptInvite(inviteToken));
      await refreshUser();
      toast.success(inviteDetails?.clan ? 'You joined the clan.' : 'You joined the workspace.');
      router.push(scopedPath(`/${inviteDetails?.role === 'mentor' ? 'mentor' : 'mentee'}/dashboard`));
    } catch (error: unknown) {
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
        setTimeout(() => router.push(scopedPath(`/login?next=${encodeURIComponent(next)}`)), 1500);
      } else {
        toast.success('Account created! You can now log in.');
        setTimeout(() => router.push(scopedPath('/login')), 1500);
      }
    } catch (err: unknown) {
      const message = extractApiErrorMessage(err, 'Registration failed');
      toast.error(message);
      setErrors({ general: message });
    } finally {
      setLoading(false);
    }
  };

  const emailLocked = Boolean(inviteDetails?.email);
  const organizationName = inviteDetails?.organization?.name;
  const registrationName = organizationName || clanJoinDetails?.clan?.name;
  const registrationLogo = inviteDetails?.organization?.logoUrl || '/logo-tile.png';

  return (
    <div className="auth-register space-y-4">
      <div className="text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={registrationLogo} alt={organizationName ? `${organizationName} logo` : 'Pathment'} className="inline-block h-14 w-14 rounded-2xl object-cover shadow-sm mb-4" />
        <p className="mb-2 text-xs font-semibold uppercase tracking-[.16em] text-brand-700">{registrationName ? `Invited by ${registrationName}` : 'Secure invitation'}</p>
        <h1 className="text-brand-900 mb-2">{registrationName ? `Join ${registrationName}` : 'Create your Pathment account'}</h1>
        <p className="text-slate-600">
          {clanJoinSlug ? 'Create your account to continue your clan request.' : 'Set up your account with this verified organization invitation.'}
        </p>
      </div>

      <div className="auth-card">
        {inviteError && (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-amber-950">This invitation can&apos;t be used</p>
              <p className="text-amber-900/80 text-sm mt-1">{inviteError}</p>
              <p className="mt-2 text-sm text-slate-600">Ask the organization administrator for a new invitation, or sign in if you already joined.</p>
              <Link href={scopedPath('/login')} className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-brand-700 hover:text-brand-800">
                Sign in <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        )}

        {!inviteError && inviteDetails && (
          <div className="mb-6 p-4 bg-brand-50 dark:bg-brand-500/10 border border-brand-200 dark:border-brand-500/20 rounded-xl">
            <p className="text-brand-900 text-sm">
              {organizationName ? <>Invitation from <span className="font-semibold">{organizationName}</span></> : <>You are invited as <span className="font-semibold capitalize">{inviteDetails.role}</span></>}
            </p>
            <p className="text-brand-700 text-sm mt-1">Joining as <span className="font-medium capitalize">{inviteDetails.role}</span> · {inviteDetails.email}</p>
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
                <Link href={scopedPath(`/login?next=${encodeURIComponent(`/register?invite=${inviteToken}`)}`)} className="underline font-medium">
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

        {!inviteError && !inviteDetails?.existingAccount && (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="register-firstName" className="block text-slate-700 text-sm mb-2">First Name</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input id="register-firstName" autoComplete="given-name"
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
              <label htmlFor="register-lastName" className="block text-slate-700 text-sm mb-2">Last Name</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input id="register-lastName" autoComplete="family-name"
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
            <label htmlFor="register-email" className="block text-slate-700 text-sm mb-2">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input id="register-email" autoComplete="email"
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
            <label htmlFor="register-password" className="block text-slate-700 text-sm mb-2">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input id="register-password" autoComplete="new-password"
                type={showPassword ? 'text' : 'password'}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className={`w-full pl-11 pr-12 py-3 border ${errors.password ? 'border-red-300' : 'border-slate-200'} rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent`}
                placeholder="••••••••"
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
            {errors.password && (
              <p className="text-red-600 text-sm mt-1 flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                {errors.password}
              </p>
            )}
            <PasswordRequirements password={formData.password} />
          </div>

          <div>
            <label htmlFor="register-confirmPassword" className="block text-slate-700 text-sm mb-2">Confirm Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                id="register-confirmPassword" autoComplete="new-password" type={showConfirmPassword ? 'text' : 'password'}
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                className={`w-full pl-11 pr-12 py-3 border ${errors.confirmPassword ? 'border-red-300' : 'border-slate-200'} rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent`}
                placeholder="••••••••"
              />
              <button
                type="button"
                aria-label={showConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'}
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
            href={scopedPath(joinReturnPath ? `/login?next=${encodeURIComponent(joinReturnPath)}` : '/login')}
            className="font-medium text-brand-700 hover:text-brand-800"
          >
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
