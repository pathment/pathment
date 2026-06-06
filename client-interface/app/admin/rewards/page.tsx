'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Gift as GiftIcon, Plus, Trash2, Pencil, Loader2, X } from 'lucide-react';
import { useRewards, type Gift } from '@/lib/hooks/mentor';
import { rewardsApi } from '@/lib/services/rewards-api';

/**
 * Admin rewards catalog - the org-wide gift list mentees can redeem with points
 * they earn. Mentors redeem on a mentee's behalf from the mentor Rewards page.
 */
export default function AdminRewardsPage() {
  const { gifts, redemptions, loading, refetch } = useRewards();
  const [editing, setEditing] = useState<Gift | 'new' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const removeGift = async (id: string) => {
    if (!confirm('Remove this gift from the catalog?')) return;
    setBusy(id);
    try { await rewardsApi.removeGift(id); toast.success('Gift removed'); refetch(); }
    catch { toast.error('Could not remove'); } finally { setBusy(null); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-slate-900 mb-1 flex items-center gap-2"><GiftIcon className="w-5 h-5 text-brand-600" /> Rewards catalog</h1>
          <p className="text-slate-600 text-sm">Configure the gifts mentees can redeem with earned points. Mentors redeem these for their mentees.</p>
        </div>
        <button onClick={() => setEditing('new')}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 shrink-0">
          <Plus className="w-4 h-4" /> New gift
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-brand-600" /></div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 grid gap-4 sm:grid-cols-2">
            {gifts.length === 0 && (
              <div className="sm:col-span-2 bg-card rounded-2xl border border-slate-200 p-12 text-center">
                <GiftIcon className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-600">No gifts yet - add one to start the catalog.</p>
              </div>
            )}
            {gifts.map((g) => (
              <div key={g.id} className="bg-card rounded-2xl border border-slate-200 overflow-hidden flex flex-col">
                <div className="relative h-32 bg-gradient-to-br from-brand-50 dark:from-brand-500/10 to-slate-100 flex items-center justify-center">
                  {g.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={g.imageUrl} alt={g.name} className="w-full h-full object-cover" />
                  ) : (
                    <GiftIcon className="w-10 h-10 text-brand-300" />
                  )}
                  <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-card/90 backdrop-blur text-brand-700 text-xs font-semibold tabular-nums shadow-sm">{g.costXp} pts</span>
                </div>
                <div className="p-4 flex flex-col flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-slate-900 font-semibold">{g.name}</h3>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => setEditing(g)} aria-label="Edit" className="p-1.5 text-slate-400 hover:text-brand-600"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => removeGift(g.id)} disabled={busy === g.id} aria-label="Remove" className="p-1.5 text-slate-400 hover:text-red-600 disabled:opacity-50"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                  {g.description && <p className="text-slate-500 text-sm mt-1 flex-1">{g.description}</p>}
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs">{g.stock === null ? 'Unlimited' : `${g.stock} in stock`}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-card rounded-2xl border border-slate-200">
            <div className="px-5 py-4 border-b border-slate-200"><h2 className="text-slate-900 text-sm font-semibold">Recent redemptions</h2></div>
            <div className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
              {redemptions.length === 0 && <p className="px-5 py-4 text-sm text-slate-400">No redemptions yet.</p>}
              {redemptions.map((r) => (
                <div key={r.id} className="px-5 py-3">
                  <div className="text-sm text-slate-800">{r.gift}</div>
                  <div className="text-xs text-slate-500">{r.mentee || 'Mentee'} · {r.costXp} pts · {new Date(r.at).toLocaleDateString()}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {editing && (
        <GiftDrawer gift={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refetch(); }} />
      )}
    </div>
  );
}

function GiftDrawer({ gift, onClose, onSaved }: { gift: Gift | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(gift?.name ?? '');
  const [description, setDescription] = useState(gift?.description ?? '');
  const [costXp, setCostXp] = useState<number>(gift?.costXp ?? 100);
  const [unlimited, setUnlimited] = useState(gift ? gift.stock === null : false);
  const [stock, setStock] = useState<number>(gift?.stock ?? 10);
  const [imageUrl, setImageUrl] = useState<string | null>(gift?.imageUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const field = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';

  const onPickImage = async (file?: File) => {
    if (!file) return;
    try {
      setUploading(true);
      const res: any = await rewardsApi.uploadGiftImage(file);
      setImageUrl(res?.data?.url ?? null);
    } catch (e: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      toast.error(e?.response?.data?.message || e?.message || 'Could not upload image');
    } finally { setUploading(false); }
  };

  const submit = async () => {
    if (!name.trim()) { toast.error('Name is required'); return; }
    const payload = { name: name.trim(), description: description.trim() || undefined, costXp, imageUrl, stock: unlimited ? null : stock };
    try {
      setSaving(true);
      if (gift) await rewardsApi.updateGift(gift.id, payload);
      else await rewardsApi.createGift(payload);
      toast.success(gift ? 'Gift updated' : 'Gift added');
      onSaved();
    } catch { toast.error('Could not save'); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 dark:bg-black/70" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={gift ? 'Edit gift' : 'New gift'} className="relative w-full max-w-md h-full bg-card border-l border-slate-200 dark:border-slate-700 shadow-2xl dark:shadow-[-8px_0_30px_rgba(0,0,0,0.6)] flex flex-col">
        <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">{gift ? 'Edit gift' : 'New gift'}</h2>
          <button onClick={onClose} aria-label="Close" className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Name <span className="text-red-500">*</span></label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Swag pack" className={field} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Image / GIF</label>
            <div className="flex items-center gap-3">
              <div className="w-20 h-20 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">
                {imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl} alt="Gift preview" className="w-full h-full object-cover" />
                ) : (
                  <GiftIcon className="w-7 h-7 text-slate-300" />
                )}
              </div>
              <div className="space-y-1.5">
                <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-700 hover:bg-slate-50 cursor-pointer">
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {imageUrl ? 'Replace' : 'Upload'} image
                  <input type="file" accept="image/*,image/gif" className="hidden" onChange={(e) => onPickImage(e.target.files?.[0])} />
                </label>
                {imageUrl && <button onClick={() => setImageUrl(null)} className="block text-xs text-slate-400 hover:text-red-600">Remove image</button>}
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={`${field} resize-none`} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Cost (points)</label>
            <input type="number" min={0} value={costXp} onChange={(e) => setCostXp(Number(e.target.value) || 0)} className={field} />
          </div>
          <div>
            <label className="flex items-center gap-2 text-sm text-slate-700 mb-2">
              <input type="checkbox" checked={unlimited} onChange={(e) => setUnlimited(e.target.checked)} className="rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
              Unlimited stock
            </label>
            {!unlimited && (
              <input type="number" min={0} value={stock} onChange={(e) => setStock(Number(e.target.value) || 0)} className={field} placeholder="Units in stock" />
            )}
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-sm hover:bg-slate-50">Cancel</button>
          <button onClick={submit} disabled={saving} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm inline-flex items-center gap-2 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}{gift ? 'Save' : 'Add gift'}
          </button>
        </div>
      </div>
    </div>
  );
}
