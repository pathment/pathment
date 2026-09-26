'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Gift as GiftIcon, Loader2, Sparkles } from 'lucide-react';
import { useRewards, useMentorCohort, type Gift } from '@/lib/hooks/mentor';
import { rewardsApi } from '@/lib/services/rewards-api';
import { Drawer } from '@/components/shared/Drawer';
import { extractApiErrorMessage } from '@/lib/utils/api-error';

function RedeemModal({ gift, onClose, onDone }: { gift: Gift; onClose: () => void; onDone: () => void }) {
  const { cohort } = useMentorCohort();
  const [menteeId, setMenteeId] = useState('');
  const [saving, setSaving] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [balanceError, setBalanceError] = useState(false);
  const requestKey = useRef<string | null>(null);
  useEffect(() => {
    let current = true;
    requestKey.current = null;
    setBalance(null); setBalanceError(false);
    if (menteeId) rewardsApi.menteeBalance(menteeId).then(result => {
      if (current) setBalance(result.data.balance);
    }).catch(() => { if (current) setBalanceError(true); });
    return () => { current = false; };
  }, [menteeId]);

  const redeem = async () => {
    if (!menteeId) { toast.error('Pick a mentee'); return; }
    try {
      setSaving(true);
      requestKey.current ??= crypto.randomUUID();
      await rewardsApi.redeem(gift.id, menteeId, requestKey.current);
      toast.success(`Redeemed "${gift.name}"`);
      onDone(); onClose();
    } catch (e: unknown) { toast.error(extractApiErrorMessage(e, 'Could not redeem')); }
    finally { setSaving(false); }
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title={`Redeem · ${gift.name}`}
      subtitle={`${gift.costXp.toLocaleString()} reward credits${gift.stock !== null ? ` · ${gift.stock} left` : ''}`}
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-sm hover:bg-slate-50">Cancel</button>
          <button onClick={redeem} disabled={saving || balance === null || balance < gift.costXp} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm inline-flex items-center gap-2 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}Redeem
          </button>
        </>
      }
    >
      <label className="block text-sm font-medium text-slate-700 mb-1">For which mentee?</label>
      <select disabled={saving} value={menteeId} onChange={(e) => setMenteeId(e.target.value)}
        className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500">
        <option value="">Select a mentee</option>
        {cohort.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
      <p className="mt-3 text-sm text-slate-600" aria-live="polite">
        {balanceError ? 'Could not load reward credits. Select the mentee again to retry.' : balance !== null
          ? `Available: ${balance} reward credits. Cost: ${gift.costXp}. XP and levels stay unchanged.`
          : menteeId ? 'Loading reward credits…' : 'Select a mentee to see available reward credits.'}
      </p>
    </Drawer>
  );
}

export default function MentorRewards() {
  const { gifts, redemptions, loading, error, refetch } = useRewards();
  const [redeeming, setRedeeming] = useState<Gift | null>(null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-slate-900 mb-2">Rewards</h1>
        <p className="text-slate-600">Redeem credits earned from approved tasks. XP and levels stay unchanged. Your organization manages the catalog.</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-600" /></div>
      ) : error ? (
        <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center">
          <p className="text-slate-600 mb-3">{error}</p>
          <button onClick={refetch} className="text-brand-600 hover:text-brand-700 text-sm font-medium">Try again</button>
        </div>
      ) : (
        <>
          {gifts.length === 0 ? (
            <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center">
              <GiftIcon className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-600">No gifts in the catalog yet.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {gifts.map((g) => (
                <div key={g.id} className="bg-card rounded-2xl border border-slate-200 overflow-hidden flex flex-col">
                  <div className="relative h-28 bg-gradient-to-br from-brand-50 dark:from-brand-500/10 to-slate-100 flex items-center justify-center">
                    {g.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={g.imageUrl} alt={g.name} className="w-full h-full object-cover" />
                    ) : (
                      <GiftIcon className="w-9 h-9 text-brand-300" />
                    )}
                  </div>
                  <div className="p-5 flex flex-col flex-1">
                  <h3 className="font-medium text-slate-900">{g.name}</h3>
                  {g.description && <p className="text-sm text-slate-500 mt-0.5 flex-1">{g.description}</p>}
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-sm font-semibold text-brand-700">{g.costXp.toLocaleString()} credits</span>
                    <span className="text-xs text-slate-400">{g.stock === null ? 'unlimited' : `${g.stock} left`}</span>
                  </div>
                  <button onClick={() => setRedeeming(g)} disabled={g.stock === 0}
                    className="mt-3 w-full px-3 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium disabled:opacity-50">
                    {g.stock === 0 ? 'Out of stock' : 'Redeem'}
                  </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {redemptions.length > 0 && (
            <div className="bg-card rounded-2xl border border-slate-200">
              <div className="px-6 py-5 border-b border-slate-200"><h2 className="text-slate-900">Recently redeemed</h2></div>
              <div className="divide-y divide-slate-100">
                {redemptions.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                    <Sparkles className="w-4 h-4 text-brand-400 shrink-0" />
                    <span className="text-slate-700 flex-1"><span className="font-medium">{r.gift}</span> → {r.mentee}</span>
                    <span className="text-xs text-slate-400">{r.costXp.toLocaleString()} credits</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {redeeming && <RedeemModal gift={redeeming} onClose={() => setRedeeming(null)} onDone={refetch} />}
    </div>
  );
}
