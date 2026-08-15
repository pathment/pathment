'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Loader2, Lock, Users, UserPlus, LogIn, Mail } from 'lucide-react';
import { toast } from 'sonner';

import { publicApi, type ClanJoinInfo } from '@/lib/services/public-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { useAuth } from '@/lib/context/AuthContext';

const CLOSED: Record<string, { label: string; copy: string }> = {
  disabled: { label: 'Closed', copy: 'This join link is currently turned off.' },
  inactive: { label: 'Not accepting members', copy: 'This clan is not active.' },
  full: { label: 'Clan full', copy: 'This clan has reached its mentee limit.' },
  not_found: { label: 'Not found', copy: 'This join link is not valid.' },
};

export default function ClanJoinPage() {
  const params = useParams();
  const router = useRouter();
  const slug = String(params?.slug || '');
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();

  const [info, setInfo] = useState<ClanJoinInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [email, setEmail] = useState('');
  const [requesting, setRequesting] = useState(false);
  const [requestMsg, setRequestMsg] = useState('');

  useEffect(() => {
    if (!slug) return;
    publicApi.getClanInvite(slug)
      .then(setInfo)
      .catch(() => setError('This join link is not valid.'))
      .finally(() => setLoading(false));
  }, [slug]);

  const join = async () => {
    setJoining(true);
    try {
      const result = await publicApi.joinClan(slug);
      toast.success(result.alreadyMember ? 'You are already in this clan' : `Joined ${result.clan?.name || 'the clan'}`);
      router.push('/mentee/dashboard');
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not join this clan'));
    } finally {
      setJoining(false);
    }
  };

  const requestInvite = async () => {
    if (!email.trim()) { toast.error('Enter your email'); return; }
    setRequesting(true);
    try {
      const r = await publicApi.requestClanInvite(slug, email.trim());
      setRequestMsg(r?.message || 'If that email can join, we\'ve sent a registration link.');
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not send a registration link'));
    } finally {
      setRequesting(false);
    }
  };

  if (loading || authLoading) {
    return <div className="py-24 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-brand-600" /></div>;
  }

  if (error || !info) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="inline-flex w-12 h-12 rounded-2xl bg-slate-100 items-center justify-center mb-4"><Lock className="w-5 h-5 text-slate-500" /></div>
        <h1 className="text-xl font-semibold text-slate-900 mb-2">Join link not valid</h1>
        <p className="text-sm text-slate-500">{error || 'This clan invite could not be found.'}</p>
      </div>
    );
  }

  const reason = info.reasons[0];
  const closed = !info.open ? (CLOSED[reason] || { label: 'Closed', copy: 'This clan is not accepting join-link members right now.' }) : null;
  const spots = info.maxMentees != null ? `${info.menteeCount}/${info.maxMentees} mentees` : `${info.menteeCount} mentee${info.menteeCount === 1 ? '' : 's'}`;
  const next = `/join/${encodeURIComponent(slug)}`;

  return (
    <div className="max-w-lg mx-auto px-4 py-12">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-2">{info.program?.name || 'Pathment'}</p>
      <h1 className="text-2xl font-semibold text-slate-900">{info.clan.name}</h1>
      {info.clan.description && <p className="mt-2 text-sm text-slate-600 whitespace-pre-wrap">{info.clan.description}</p>}
      <p className="mt-3 text-sm text-slate-500 inline-flex items-center gap-1.5"><Users className="w-4 h-4" />{spots}</p>

      {closed ? (
        <div className="mt-8 rounded-2xl border border-slate-200 bg-card p-6">
          <p className="text-sm font-medium text-slate-900">{closed.label}</p>
          <p className="text-sm text-slate-500 mt-1">{closed.copy}</p>
        </div>
      ) : isAuthenticated && user ? (
        <div className="mt-8 rounded-2xl border border-slate-200 bg-card p-6 space-y-4">
          <p className="text-sm text-slate-600">Signed in as <span className="font-medium text-slate-900">{user.email}</span>. Join this clan as a mentee.</p>
          <button onClick={join} disabled={joining} className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium disabled:opacity-50">
            {joining ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            Join {info.clan.name}
          </button>
        </div>
      ) : (
        <div className="mt-8 rounded-2xl border border-slate-200 bg-card p-6 space-y-5">
          <div>
            <p className="text-sm font-medium text-slate-900 mb-2">Already have an account?</p>
            <Link href={`/login?next=${encodeURIComponent(next)}`} className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium">
              <LogIn className="w-4 h-4" /> Log in to join
            </Link>
          </div>
          <div className="pt-4 border-t border-slate-100">
            <p className="text-sm font-medium text-slate-900 mb-1">New here?</p>
            <p className="text-xs text-slate-500 mb-3">Enter your email and we&apos;ll send a registration link that places you in this clan.</p>
            {requestMsg ? (
              <p className="text-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">{requestMsg}</p>
            ) : (
              <div className="flex gap-2">
                <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@example.com"
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); requestInvite(); } }}
                  className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500" />
                <button onClick={requestInvite} disabled={requesting} className="px-3 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 disabled:opacity-50 inline-flex items-center gap-1.5">
                  {requesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />} Send link
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
