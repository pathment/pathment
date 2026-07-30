'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PauseCircle, Mail, MessageCircle, Loader2 } from 'lucide-react';
import { menteeApi } from '@/lib/services/mentee-api';

interface PausedClan {
  clanId: string;
  clanName: string;
  pausedAt: string | null;
  pausedReason: string | null;
  mentors: { id: string; name: string; email: string }[];
}

/**
 * Gates ONLY the mentee experience. A paused mentee can still sign in, but their
 * tasks and clan are on hold — so instead of the dashboard we show them what
 * happened and how to come back (ask a mentor to resume them). Mounted inside
 * the mentee layout's RoleGuard, so a user who is also a mentor is unaffected on
 * their mentor side; only /mentee/* is blocked.
 */
export function PausedGate({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);
  const [clans, setClans] = useState<PausedClan[]>([]);

  useEffect(() => {
    let alive = true;
    menteeApi.getPauseState()
      .then((res: { data?: { paused?: boolean; clans?: PausedClan[] } }) => {
        if (!alive) return;
        setPaused(!!res?.data?.paused);
        setClans(res?.data?.clans ?? []);
      })
      .catch(() => { /* on error, fail open — never lock someone out on a hiccup */ })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
      </div>
    );
  }

  if (!paused) return <>{children}</>;

  const mentors = clans.flatMap((c) => c.mentors);
  const primary = mentors[0] || null;
  const clan = clans[0] || null;

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-50">
          <PauseCircle className="h-7 w-7 text-amber-600" />
        </div>
        <h1 className="text-xl font-semibold text-slate-900">Your mentee dashboard is paused</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
          {clan
            ? <>Your place in <span className="font-medium text-slate-800">{clan.clanName}</span> is on hold, so your tasks and clan are paused for now.</>
            : <>Your tasks and clan are paused for now.</>}
          {clan?.pausedReason && <span className="mt-1 block text-slate-500">Reason: {clan.pausedReason}</span>}
        </p>

        <div className="mt-6 rounded-xl bg-slate-50 p-4 text-left">
          <p className="text-sm font-medium text-slate-800">Ready to come back?</p>
          <p className="mt-1 text-sm text-slate-600">
            {primary
              ? <>Ask your mentor <span className="font-medium text-slate-800">{primary.name}</span> to resume you — it takes them one click.</>
              : <>Reach out to your clan mentor and ask them to resume you.</>}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/messages"
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              <MessageCircle className="h-4 w-4" /> Message my mentor
            </Link>
            {primary?.email && (
              <a
                href={`mailto:${primary.email}?subject=${encodeURIComponent('Please resume my mentee account')}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-700 hover:border-brand-300 hover:text-brand-700"
              >
                <Mail className="h-4 w-4" /> Email {primary.name.split(' ')[0]}
              </a>
            )}
          </div>

          {mentors.length > 1 && (
            <p className="mt-3 text-xs text-slate-500">
              Your clan team: {mentors.map((m) => m.name).join(', ')}
            </p>
          )}
        </div>

        <p className="mt-5 text-xs text-slate-400">
          The moment a mentor resumes you — or you jump back into your work — you&apos;ll be right back where you left off.
        </p>
      </div>
    </div>
  );
}
