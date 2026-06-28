'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Crown, Loader2, TrendingUp, X, UserCheck } from 'lucide-react';

import { Drawer } from '@/components/shared/Drawer';
import { adminApi, type AdminPromotionCandidate } from '@/lib/services/admin-api';
import { clanApi } from '@/lib/services/clan-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { useConfirm } from '@/lib/context/ConfirmContext';

const STAGE_BADGE: Record<string, string> = {
  nominated: 'bg-slate-100 text-slate-600',
  interview: 'bg-amber-100 text-amber-700',
  approved: 'bg-brand-100 text-brand-700',
  promoted: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-rose-50 text-rose-600',
};
const STAGE_LABEL: Record<string, string> = {
  nominated: 'Nominated', interview: 'Interview', approved: 'Awaiting approval', promoted: 'Promoted', rejected: 'Declined',
};

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex-1">
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-xs text-slate-500">{label}</span>
        <span className="text-xs font-semibold text-slate-700 tabular-nums">{value}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
        <div className="h-full rounded-full bg-brand-500" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function PromoteDrawer({ candidate, onClose, onDone }: { candidate: AdminPromotionCandidate; onClose: () => void; onDone: () => void }) {
  const [clans, setClans] = useState<{ id: string; name: string }[]>([]);
  const [clanId, setClanId] = useState(candidate.targetClanId || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    clanApi.list()
      .then((r: any) => setClans(((r.data?.clans) || r.data || []).map((c: any) => ({ id: c.id, name: c.name })))) // eslint-disable-line @typescript-eslint/no-explicit-any
      .catch(() => setClans([]));
  }, []);

  const promote = async () => {
    setSaving(true);
    try {
      await adminApi.promotions.promote(candidate.id, clanId || undefined);
      toast.success(`${candidate.name.split(' ')[0]} promoted to co-mentor`);
      onDone(); onClose();
    } catch (e) { toast.error(extractApiErrorMessage(e, 'Could not promote')); }
    finally { setSaving(false); }
  };

  const field = 'w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500';

  return (
    <Drawer open onClose={onClose} title={`Promote ${candidate.name}`} subtitle="Grant the mentor role and (optionally) add them to a clan team." width="sm"
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm">Cancel</button>
          <button onClick={promote} disabled={saving} className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium disabled:opacity-50 inline-flex items-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crown className="w-4 h-4" />}Promote to co-mentor
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-brand-200 bg-brand-50/60 dark:bg-brand-500/10 px-3 py-2.5 text-xs text-slate-600">
          {candidate.nominatorName ? <>Nominated by <span className="font-medium">{candidate.nominatorName}</span>. </> : null}
          Promoting grants the <span className="font-medium">mentor</span> capability so they can switch into the mentor view.
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Add to clan <span className="text-slate-400 font-normal">(optional)</span></label>
          <select value={clanId} onChange={(e) => setClanId(e.target.value)} className={field}>
            <option value="">Don&apos;t add to a clan now</option>
            {clans.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <p className="mt-1 text-xs text-slate-400">They&apos;ll join this clan as a co-mentor. You can also do this later from Clans.</p>
        </div>
      </div>
    </Drawer>
  );
}

export default function AdminPromotions() {
  const confirm = useConfirm();
  const [candidates, setCandidates] = useState<AdminPromotionCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [promoting, setPromoting] = useState<AdminPromotionCandidate | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    adminApi.promotions.list()
      .then((r: any) => { setCandidates(r?.data?.candidates ?? []); setError(null); }) // eslint-disable-line @typescript-eslint/no-explicit-any
      .catch(() => setError('Could not load promotions'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  // Awaiting-approval first (the admin's actionable queue), then in-flight, then closed.
  const { pending, closed } = useMemo(() => {
    const rank = (s: string) => (s === 'approved' ? 0 : s === 'interview' ? 1 : s === 'nominated' ? 2 : 3);
    const open = candidates.filter((c) => !['promoted', 'rejected'].includes(c.stage)).sort((a, b) => rank(a.stage) - rank(b.stage));
    const done = candidates.filter((c) => ['promoted', 'rejected'].includes(c.stage));
    return { pending: open, closed: done };
  }, [candidates]);

  const decline = async (c: AdminPromotionCandidate) => {
    if (!(await confirm({ title: `Decline the nomination for ${c.name}?`, description: `They stay a mentee.`, variant: 'danger', confirmLabel: 'Decline' }))) return;
    try {
      setBusy(c.id);
      await adminApi.promotions.decline(c.id);
      toast.success('Nomination declined');
      load();
    } catch (e) { toast.error(extractApiErrorMessage(e, 'Could not decline')); }
    finally { setBusy(null); }
  };

  const Card = ({ c, history }: { c: AdminPromotionCandidate; history?: boolean }) => (
    <div className="bg-card rounded-2xl border border-slate-200 p-5">
      <div className="flex items-start gap-3">
        {c.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <Link href={`/admin/mentees/${c.menteeId}`} className="shrink-0"><img src={c.avatarUrl} alt={c.name} className="w-10 h-10 rounded-full object-cover" /></Link>
        ) : (
          <Link href={`/admin/mentees/${c.menteeId}`} className="w-10 h-10 bg-brand-100 rounded-full flex items-center justify-center shrink-0">
            <span className="text-brand-700 text-xs font-medium">{c.avatar}</span>
          </Link>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-medium text-slate-900 truncate">{c.name}</p>
          <p className="text-xs text-slate-500 truncate">
            {c.nominatorName ? `Nominated by ${c.nominatorName}` : 'Nominated'}{c.program ? ` · ${c.program}` : ''}
          </p>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${STAGE_BADGE[c.stage] || 'bg-slate-100 text-slate-600'}`}>{STAGE_LABEL[c.stage] || c.stage}</span>
      </div>

      <div className="flex gap-3 mt-4">
        <Bar label="Readiness" value={c.readiness} />
        <Bar label="Willingness" value={c.willingness} />
      </div>
      <div className="flex items-center gap-3 mt-3 text-xs text-slate-500">
        <span>{c.absoluteProgress}% progress</span><span>·</span><span>{c.onTimeRate}% on-time</span>
        {c.targetClanName && <><span>·</span><span>→ {c.targetClanName}</span></>}
      </div>

      {(c.motivation || c.strengths) && (
        <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
          {c.motivation && <p className="text-xs text-slate-600"><span className="text-slate-400">Motivation: </span>{c.motivation}</p>}
          {c.strengths && <p className="text-xs text-slate-600"><span className="text-slate-400">Strengths: </span>{c.strengths}</p>}
        </div>
      )}

      {!history && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={() => setPromoting(c)} disabled={busy === c.id}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium disabled:opacity-50">
            <Crown className="w-4 h-4" />Promote
          </button>
          <button onClick={() => decline(c)} disabled={busy === c.id}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:border-rose-300 hover:text-rose-600 disabled:opacity-50">
            {busy === c.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}Decline
          </button>
        </div>
      )}
      {c.stage === 'promoted' && <div className="mt-4 inline-flex items-center gap-1.5 text-sm text-emerald-700"><Crown className="w-4 h-4" />Now a co-mentor</div>}
      {c.stage === 'rejected' && <div className="mt-4 inline-flex items-center gap-1.5 text-sm text-slate-400">Declined</div>}
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-slate-900 mb-2 inline-flex items-center gap-2"><TrendingUp className="w-6 h-6 text-brand-600" />Promotions</h1>
        <p className="text-slate-600">Mentors nominate strong mentees to become co-mentors. Review and grant the final promotion here.</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-600" /></div>
      ) : error ? (
        <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center">
          <p className="text-slate-600 mb-3">{error}</p>
          <button onClick={load} className="text-brand-600 hover:text-brand-700 text-sm font-medium">Try again</button>
        </div>
      ) : candidates.length === 0 ? (
        <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center">
          <UserCheck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600">No nominations yet. When a mentor nominates a mentee, they&apos;ll show up here.</p>
        </div>
      ) : (
        <>
          <section>
            <h2 className="text-sm font-medium uppercase tracking-wide text-slate-400 mb-3">Awaiting your review ({pending.length})</h2>
            {pending.length === 0 ? (
              <p className="text-sm text-slate-400">Nothing to review right now.</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {pending.map((c) => <Card key={c.id} c={c} />)}
              </div>
            )}
          </section>

          {closed.length > 0 && (
            <section>
              <h2 className="text-sm font-medium uppercase tracking-wide text-slate-400 mb-3">History</h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {closed.map((c) => <Card key={c.id} c={c} history />)}
              </div>
            </section>
          )}
        </>
      )}

      {promoting && <PromoteDrawer candidate={promoting} onClose={() => setPromoting(null)} onDone={load} />}
    </div>
  );
}
