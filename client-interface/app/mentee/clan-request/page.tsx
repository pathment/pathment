'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, Clock3, GitPullRequest, Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { clanApi } from '@/lib/services/clan-api';
import { clanRequestsApi } from '@/lib/services/clan-requests-api';
import { SelectMenu } from '@/components/shared/SelectMenu';

type Membership = {
  role: string;
  clan: { id: string; name: string; programId: string; status: string };
};

type ClanOption = { id: string; name: string };

type ClanChangeRow = {
  id: string;
  fromClan: string | null;
  toClan: string | null;
  reason: string | null;
  status: 'pending' | 'approved' | 'denied';
  resolutionNote: string | null;
  at: string;
};

const STATUS_META: Record<ClanChangeRow['status'], { label: string; className: string; icon: typeof Clock3 }> = {
  pending: { label: 'Pending', className: 'bg-amber-100 text-amber-700', icon: Clock3 },
  approved: { label: 'Approved', className: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  denied: { label: 'Denied', className: 'bg-slate-100 text-slate-500', icon: Clock3 },
};

export default function MenteeClanRequestPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [targetClans, setTargetClans] = useState<ClanOption[]>([]);
  const [requests, setRequests] = useState<ClanChangeRow[]>([]);
  const [targetClanId, setTargetClanId] = useState('');
  const [reason, setReason] = useState('');

  const currentClan = useMemo(
    () => memberships.find((m) => m.role === 'mentee' && m.clan)?.clan ?? null,
    [memberships]
  );

  const load = async () => {
    setLoading(true);
    try {
      const [membershipRes, requestRes] = await Promise.all([
        clanApi.myMemberships(),
        clanRequestsApi.listMyRequests(),
      ]);

      const nextMemberships = membershipRes?.data?.memberships ?? [];
      setMemberships(nextMemberships);

      const nextRequests = requestRes?.data?.requests ?? [];
      setRequests(nextRequests);

      const menteeMembership = nextMemberships.find((m: Membership) => m.role === 'mentee' && m.clan);
      const programId = menteeMembership?.clan?.programId;
      const currentClanId = menteeMembership?.clan?.id;

      if (programId) {
        const clanRes = await clanApi.list({ programId });
        const clans = clanRes?.data?.clans ?? clanRes?.clans ?? clanRes ?? [];
        setTargetClans(
          clans
            .map((c: { id: string; name: string }) => ({ id: c.id, name: c.name }))
            .filter((c: ClanOption) => c.id !== currentClanId)
        );
      } else {
        setTargetClans([]);
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Could not load clan requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const submit = async () => {
    if (!currentClan) {
      toast.error('You need to be assigned to a clan first');
      return;
    }
    if (!targetClanId) {
      toast.error('Choose the clan you want to move to');
      return;
    }

    try {
      setSaving(true);
      await clanRequestsApi.createRequest({
        toClanId: targetClanId,
        fromClanId: currentClan.id,
        reason: reason.trim() || undefined,
      });
      toast.success('Clan change request submitted');
      setTargetClanId('');
      setReason('');
      await load();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Could not submit the request');
    } finally {
      setSaving(false);
    }
  };

  const field = 'border border-slate-300 rounded-xl px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500';

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-slate-900 mb-2">Request clan change</h1>
        <p className="text-slate-600">
          Ask the admin team to move you to another clan. Your request will appear in their review queue.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.25fr_0.95fr] items-start">
          <section className="space-y-4">
            <div className="bg-card rounded-2xl border border-slate-200 p-6">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
                  <GitPullRequest className="w-5 h-5 text-brand-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-slate-900">New request</h2>
                  <p className="text-sm text-slate-500 mt-1">
                    Select the clan you want to move into, then add a short reason so admins have context.
                  </p>
                </div>
              </div>

              <div className="mt-6 space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Current clan</p>
                    <p className="text-sm font-medium text-slate-900 mt-1">{currentClan?.name ?? 'No clan assigned yet'}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">How it works</p>
                    <p className="text-sm text-slate-600 mt-1">Admin reviews your request and will approve or deny it.</p>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Target clan</label>
                  <SelectMenu
                    value={targetClanId}
                    onChange={setTargetClanId}
                    options={targetClans.map((c) => ({ value: c.id, label: c.name }))}
                    placeholder={targetClans.length ? 'Choose a clan…' : 'No other clans available'}
                    ariaLabel="Target clan"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Reason</label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={5}
                    className={`${field} w-full resize-none`}
                    placeholder="Tell admins why you want to move"
                  />
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
                  <p className="text-xs text-slate-400">
                    Keep it short and factual. This helps the admin team review faster.
                  </p>
                  <button
                    onClick={submit}
                    disabled={saving || !currentClan || !targetClans.length}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Submit request
                  </button>
                </div>
              </div>
            </div>
          </section>

          <aside className="space-y-4">
            <div className="bg-card rounded-2xl border border-slate-200 p-6">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-slate-900">Request history</h2>
                <button onClick={load} className="text-sm text-brand-600 hover:text-brand-700">Refresh</button>
              </div>

              {requests.length === 0 ? (
                <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                  You have not submitted any clan change requests yet.
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {requests.map((r) => {
                    const meta = STATUS_META[r.status];
                    const Icon = meta.icon;
                    return (
                      <div key={r.id} className="rounded-xl border border-slate-200 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-900 truncate">
                              {r.fromClan ?? 'Current clan'} <ArrowRight className="inline-block w-3.5 h-3.5 text-slate-300 mx-1" /> {r.toClan ?? 'Target clan'}
                            </p>
                            <p className="text-xs text-slate-500 mt-1">{r.reason || 'No reason provided'}</p>
                          </div>
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${meta.className}`}>
                            <Icon className="w-3.5 h-3.5" />
                            {meta.label}
                          </span>
                        </div>
                        {r.resolutionNote && (
                          <p className="mt-2 text-xs text-slate-500">Admin note: {r.resolutionNote}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-brand-200 bg-brand-50/70 p-5">
              <p className="text-sm font-semibold text-slate-900">Need a different clan for a good reason?</p>
              <p className="text-sm text-slate-600 mt-1">
                Submit a clear request. The admin team will review it and keep the decision visible in your history.
              </p>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}