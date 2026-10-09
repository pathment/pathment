'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Award, Gift as GiftIcon, Plus, Trash2, Pencil, Loader2, X, Search, Check } from 'lucide-react';
import { useRewards, type Gift } from '@/lib/hooks/mentor';
import { rewardsApi } from '@/lib/services/rewards-api';
import {
  gamificationApi,
  type Badge,
  type BadgeCriteriaType,
} from '@/lib/services/gamification-api';
import { messagingApi } from '@/lib/services/messaging-api';
import type { SearchableUser } from '@/lib/types/messaging';
import { useConfirm } from '@/lib/context/ConfirmContext';
import { extractApiErrorMessage } from '@/lib/utils/api-error';

/** Default path-journey badges admins can pick when they have no custom upload. */
const BADGE_PRESETS = [
  { id: 'bronze', label: 'Bronze', src: '/badges/bronze.png' },
  { id: 'silver', label: 'Silver', src: '/badges/silver.png' },
  { id: 'gold', label: 'Gold', src: '/badges/gold.png' },
] as const;

/**
 * Admin rewards + badges. Gifts spend Coins (enrollment task earnings).
 * Badges are workspace-configured achievements (XP / lifetime coins / tasks).
 */
export default function AdminRewardsPage() {
  const [tab, setTab] = useState<'gifts' | 'badges'>('gifts');
  const confirm = useConfirm();
  const { gifts, redemptions, loading, refetch } = useRewards();
  const [editing, setEditing] = useState<Gift | 'new' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const removeGift = async (id: string) => {
    if (!(await confirm({ title: 'Remove this gift?', description: 'It will be removed from the catalog.', variant: 'danger', confirmLabel: 'Remove' }))) return;
    setBusy(id);
    try { await rewardsApi.removeGift(id); toast.success('Gift removed'); refetch(); }
    catch { toast.error('Could not remove'); } finally { setBusy(null); }
  };

  return (
    <div className="space-y-6">
      <div className="admin-page-heading flex items-start justify-between gap-4">
        <div>
          <h1 className="text-slate-900 mb-1 flex items-center gap-2"><GiftIcon className="w-5 h-5 text-brand-600" /> Rewards & badges</h1>
          <p className="text-slate-600 text-sm">
            Gifts cost Coins (from approved tasks). Badges recognize XP, lifetime coins, or task milestones — redeeming never removes a badge.
          </p>
        </div>
        {tab === 'gifts' ? (
          <button onClick={() => setEditing('new')}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 shrink-0">
            <Plus className="w-4 h-4" /> New gift
          </button>
        ) : null}
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        {([
          { id: 'gifts' as const, label: 'Gifts (coins)' },
          { id: 'badges' as const, label: 'Badges' },
        ]).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px ${
              tab === item.id
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'badges' ? (
        <BadgesPanel />
      ) : loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-brand-600" /></div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 grid gap-4 sm:grid-cols-2">
            {gifts.length === 0 && (
              <div className="sm:col-span-2 bg-card rounded-2xl border border-slate-200 p-12 text-center">
                <GiftIcon className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-600">No gifts yet. Add one to start the catalog.</p>
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
                  <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-card/90 backdrop-blur text-brand-700 text-xs font-semibold tabular-nums shadow-sm">{g.costXp} coins</span>
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
                  <div className="text-xs text-slate-500">{r.mentee || 'Mentee'} · {r.costXp} coins · {new Date(r.at).toLocaleDateString()}</div>
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

function BadgesPanel() {
  const confirm = useConfirm();
  const [badges, setBadges] = useState<Badge[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Badge | 'new' | null>(null);
  const [awardFor, setAwardFor] = useState<Badge | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setBadges(await gamificationApi.listBadges({ active: false }));
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not load badges'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const setBadgeActive = async (badge: Badge, isActive: boolean) => {
    const title = isActive ? 'Reactivate badge?' : 'Deactivate badge?';
    const description = isActive
      ? 'It will be available for auto-award again. Manual award still works either way.'
      : 'It will stop auto-awarding. Already earned badges stay.';
    if (!(await confirm({
      title,
      description,
      variant: isActive ? 'default' : 'danger',
      confirmLabel: isActive ? 'Reactivate' : 'Deactivate',
    }))) return;
    try {
      await gamificationApi.updateBadge(badge.id, { isActive });
      toast.success(isActive ? 'Badge reactivated' : 'Badge deactivated');
      void load();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not update badge'));
    }
  };

  const roleOf = (b: Badge) => (b.criteriaValue?.targetRole === 'mentor' ? 'mentor' : 'mentee');

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
        >
          <Plus className="w-4 h-4" /> New badge
        </button>
      </div>
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-brand-600" /></div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {badges.length === 0 && (
            <div className="sm:col-span-2 lg:col-span-3 rounded-2xl border border-dashed border-slate-300 p-10 text-center text-slate-500">
              No workspace badges yet. Create one with XP, lifetime coins, or task criteria.
            </div>
          )}
          {badges.map((b) => {
            const inactive = b.isActive === false;
            return (
            <div key={b.id} className="rounded-2xl border border-slate-200 bg-card p-4">
              <div className="flex items-start gap-3">
                <div className="h-12 w-12 rounded-xl border border-slate-200 bg-white overflow-hidden flex items-center justify-center shrink-0">
                  {b.iconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={b.iconUrl} alt="" className="h-full w-full object-contain bg-white" />
                  ) : (
                    <Award className="w-6 h-6 text-brand-400" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <h3 className="font-semibold text-slate-900 truncate">{b.name}</h3>
                    {inactive && (
                      <span className="shrink-0 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 font-medium">
                        Inactive
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 capitalize">
                    {roleOf(b)} · {b.criteriaType?.replace(/_/g, ' ')}
                    {' · '}
                    {Number(b.earningScope) === 1 ? 'program' : Number(b.earningScope) === 2 ? 'clan' : 'workspace'}
                  </p>
                  <p className="text-sm text-slate-600 mt-1 line-clamp-2">{b.description}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => setEditing(b)} className="text-xs px-2 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">Edit</button>
                <button type="button" onClick={() => setAwardFor(b)} className="text-xs px-2 py-1 rounded-lg border border-brand-200 text-brand-700 hover:bg-brand-50">Award manually</button>
                {inactive ? (
                  <button type="button" onClick={() => void setBadgeActive(b, true)} className="text-xs px-2 py-1 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50">Reactivate</button>
                ) : (
                  <button type="button" onClick={() => void setBadgeActive(b, false)} className="text-xs px-2 py-1 rounded-lg border border-slate-200 text-rose-600 hover:bg-rose-50">Deactivate</button>
                )}
              </div>
            </div>
            );
          })}
        </div>
      )}
      {editing && (
        <BadgeDrawer
          badge={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void load(); }}
        />
      )}
      {awardFor && (
        <ManualAwardDrawer badge={awardFor} onClose={() => setAwardFor(null)} />
      )}
    </div>
  );
}

function BadgeDrawer({ badge, onClose, onSaved }: { badge: Badge | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(badge?.name ?? '');
  const [description, setDescription] = useState(badge?.description ?? '');
  const [targetRole, setTargetRole] = useState<'mentee' | 'mentor'>(
    badge?.criteriaValue?.targetRole === 'mentor' ? 'mentor' : 'mentee',
  );
  const [criteriaType, setCriteriaType] = useState<BadgeCriteriaType>(
    (badge?.criteriaType as BadgeCriteriaType) || 'tasks_completed',
  );
  const [threshold, setThreshold] = useState<number>(
    Number(badge?.criteriaValue?.threshold ?? badge?.criteriaValue?.count ?? 10) || 10,
  );
  const [iconUrl, setIconUrl] = useState<string | null>(badge?.iconUrl ?? null);
  const [pointsReward, setPointsReward] = useState(Number(badge?.pointsReward || 0));
  const [earningScope, setEarningScope] = useState<0 | 1 | 2>(
    (Number(badge?.earningScope ?? 0) as 0 | 1 | 2) || 0,
  );
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const field = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';
  const rulesFrozen = Boolean(badge);

  const onPickImage = async (file?: File) => {
    if (!file) return;
    try {
      setUploading(true);
      const res = await rewardsApi.uploadGiftImage(file);
      setIconUrl(res?.data?.url ?? null);
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not upload image'));
    } finally {
      setUploading(false);
    }
  };

  const buildCriteriaValue = () => {
    const base: Record<string, unknown> = { targetRole };
    if (criteriaType === 'points_milestone' || criteriaType === 'coins_earned') {
      base.threshold = threshold;
    } else if (
      criteriaType === 'tasks_completed'
      || criteriaType === 'reviews_given'
      || criteriaType === 'tasks_approved'
      || criteriaType === 'meetings_logged'
      || criteriaType === 'mentees_guided'
      || criteriaType === 'clans_led'
    ) {
      base.count = threshold;
    } else if (criteriaType === 'streak_days') {
      base.days = threshold;
    } else if (criteriaType === 'level_reached') {
      base.level = threshold;
    } else if (criteriaType === 'mentor_avg_rating') {
      base.minRating = threshold;
      base.minResponses = 3;
    } else {
      base.threshold = threshold;
    }
    return base;
  };

  const submit = async () => {
    if (!name.trim() || !description.trim()) {
      toast.error('Name and description are required');
      return;
    }
    try {
      setSaving(true);
      if (badge) {
        // Criteria and scope freeze at creation — only presentation fields update.
        await gamificationApi.updateBadge(badge.id, {
          name: name.trim(),
          description: description.trim(),
          pointsReward,
          iconUrl,
        });
      } else {
        await gamificationApi.createBadge({
          name: name.trim(),
          description: description.trim(),
          category: 'milestone',
          criteriaType,
          criteriaValue: buildCriteriaValue(),
          pointsReward,
          iconUrl,
          isActive: true,
          earningScope: targetRole === 'mentor' ? 0 : earningScope,
        });
      }
      toast.success(badge ? 'Badge updated' : 'Badge created');
      onSaved();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not save badge'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md h-full bg-card border-l border-slate-200 shadow-2xl flex flex-col">
        <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">{badge ? 'Edit badge' : 'New badge'}</h2>
          <button onClick={onClose} aria-label="Close" className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">Name</span>
            <input className={field} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">Description</span>
            <textarea className={`${field} resize-none`} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">Role</span>
            <select
              className={field}
              value={targetRole}
              disabled={rulesFrozen}
              onChange={(e) => {
                const next = e.target.value as 'mentee' | 'mentor';
                setTargetRole(next);
                setCriteriaType(next === 'mentor' ? 'reviews_given' : 'tasks_completed');
                if (next === 'mentor') setEarningScope(0);
              }}
            >
              <option value="mentee">Mentee</option>
              <option value="mentor">Mentor</option>
            </select>
          </label>
          {targetRole === 'mentee' && (
            <label className="block space-y-1">
              <span className="text-sm font-medium text-slate-700">Earning scope</span>
              <select
                className={field}
                value={earningScope}
                disabled={rulesFrozen}
                onChange={(e) => {
                  const next = Number(e.target.value) as 0 | 1 | 2;
                  setEarningScope(next);
                  if (next !== 0) setCriteriaType('tasks_completed');
                }}
              >
                <option value={0}>Workspace</option>
                <option value={1}>Program</option>
                <option value={2}>Clan</option>
              </select>
              <p className="text-xs text-slate-500">
                {earningScope === 0 && 'Counts all approved tasks in this workspace.'}
                {earningScope === 1 && 'Counts once per program (standing-clan work excluded).'}
                {earningScope === 2 && 'Counts once per clan.'}
              </p>
            </label>
          )}
          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">Requirement</span>
            {targetRole === 'mentee' && earningScope !== 0 ? (
              <div className={`${field} text-slate-800`}>Approved tasks count</div>
            ) : (
              <select
                className={field}
                value={criteriaType}
                disabled={rulesFrozen}
                onChange={(e) => setCriteriaType(e.target.value as BadgeCriteriaType)}
              >
                {targetRole === 'mentee' ? (
                  <>
                    <option value="tasks_completed">Approved tasks count</option>
                    <option value="coins_earned">Lifetime coins earned</option>
                    <option value="points_milestone">XP total</option>
                    <option value="streak_days">Streak days</option>
                    <option value="level_reached">Level reached</option>
                    <option value="custom">Manual award only</option>
                  </>
                ) : (
                  <>
                    <option value="reviews_given">Reviews given</option>
                    <option value="tasks_approved">Tasks approved</option>
                    <option value="meetings_logged">Meetings logged</option>
                    <option value="mentees_guided">Mentees guided</option>
                    <option value="clans_led">Clans led</option>
                    <option value="mentor_avg_rating">Avg mentor rating (min 3 reviews)</option>
                    <option value="custom">Manual award only</option>
                  </>
                )}
              </select>
            )}
          </label>
          {criteriaType !== 'custom' && (
            <label className="block space-y-1">
              <span className="text-sm font-medium text-slate-700">
                {criteriaType === 'mentor_avg_rating' ? 'Minimum rating' : 'Threshold'}
              </span>
              <input
                type="number"
                min={criteriaType === 'mentor_avg_rating' ? 1 : 1}
                step={criteriaType === 'mentor_avg_rating' ? 0.1 : 1}
                max={criteriaType === 'mentor_avg_rating' ? 5 : undefined}
                className={field}
                value={threshold}
                disabled={rulesFrozen}
                onChange={(e) => setThreshold(Number(e.target.value) || 1)}
              />
            </label>
          )}
          {rulesFrozen && (
            <p className="text-xs text-amber-700 rounded-lg bg-amber-50 border border-amber-100 p-3">
              Criteria and scope are frozen after creation. Create a new badge to change requirements.
            </p>
          )}
          {criteriaType === 'custom' && (
            <p className="text-xs text-slate-500 rounded-lg bg-slate-50 border border-slate-100 p-3">
              This badge is only given via <span className="font-medium">Award manually</span>. Never auto-unlocked.
            </p>
          )}
          {targetRole === 'mentor' && criteriaType !== 'custom' && (
            <p className="text-xs text-slate-500 rounded-lg bg-slate-50 border border-slate-100 p-3">
              Auto-awarded from live mentor activity (reviews, meetings, clan roster, program ratings). You can still award manually anytime.
            </p>
          )}
          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">XP bonus on unlock (optional)</span>
            <input type="number" min={0} className={field} value={pointsReward} onChange={(e) => setPointsReward(Number(e.target.value) || 0)} />
          </label>
          <div>
            <span className="text-sm font-medium text-slate-700">Badge image</span>
            <p className="mt-0.5 text-xs text-slate-400">Pick a preset or upload your own.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {BADGE_PRESETS.map((p) => {
                const selected = iconUrl === p.src;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setIconUrl(p.src)}
                    className={`w-14 h-14 rounded-xl border-2 overflow-hidden bg-white transition ${
                      selected ? 'border-brand-600 ring-2 ring-brand-200' : 'border-slate-200 hover:border-slate-300'
                    }`}
                    aria-label={`Use ${p.label} badge`}
                    aria-pressed={selected}
                    title={p.label}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.src} alt={p.label} className="w-full h-full object-contain bg-white" />
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex items-center gap-3">
              <div className="w-16 h-16 rounded-xl border border-slate-200 bg-white overflow-hidden flex items-center justify-center">
                {iconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={iconUrl} alt="" className="w-full h-full object-contain bg-white" />
                ) : (
                  <Award className="w-6 h-6 text-slate-300" />
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 text-sm cursor-pointer hover:bg-slate-50">
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Upload
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => void onPickImage(e.target.files?.[0])} />
                </label>
                {iconUrl && (
                  <button type="button" onClick={() => setIconUrl(null)} className="text-xs text-slate-400 hover:text-red-600 text-left">
                    Clear image
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-xl text-sm">Cancel</button>
          <button onClick={() => void submit()} disabled={saving} className="px-4 py-2 bg-brand-600 text-white rounded-xl text-sm inline-flex items-center gap-2 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {badge ? 'Save' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ManualAwardDrawer({ badge, onClose }: { badge: Badge; onClose: () => void }) {
  const targetRole = badge.criteriaValue?.targetRole === 'mentor' ? 'mentor' : 'mentee';
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchableUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<SearchableUser | null>(null);
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const field = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';

  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    try {
      setSearching(true);
      const users = await messagingApi.searchUsers(trimmed, targetRole, 20);
      setResults(users);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [targetRole]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void runSearch(query), 280);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, runSearch]);

  const submit = async () => {
    if (!selected) {
      toast.error(`Pick a ${targetRole} from the search results`);
      return;
    }
    try {
      setSaving(true);
      await gamificationApi.awardBadge(selected.id, badge.id);
      const name = `${selected.firstName} ${selected.lastName}`.trim() || selected.email;
      toast.success(`Awarded “${badge.name}” to ${name}`);
      onClose();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not award badge'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md h-full bg-card border-l border-slate-200 shadow-2xl flex flex-col">
        <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Award “{badge.name}”</h2>
          <button onClick={onClose} aria-label="Close" className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/80 p-3">
            <div className="h-12 w-12 rounded-xl border border-slate-200 bg-white overflow-hidden flex items-center justify-center shrink-0">
              {badge.iconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={badge.iconUrl} alt="" className="h-full w-full object-contain bg-white" />
              ) : (
                <Award className="w-5 h-5 text-brand-400" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">{badge.name}</p>
              <p className="text-xs text-slate-500 capitalize">{targetRole} badge · once per person</p>
            </div>
          </div>

          {selected ? (
            <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-3 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900 truncate">
                  {`${selected.firstName} ${selected.lastName}`.trim() || 'User'}
                </p>
                <p className="text-xs text-slate-500 truncate">{selected.email}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="text-xs text-slate-500 hover:text-slate-800 shrink-0"
              >
                Change
              </button>
            </div>
          ) : (
            <>
              <label className="block space-y-1">
                <span className="text-sm font-medium text-slate-700">
                  Find {targetRole}
                </span>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    className={`${field} pl-9`}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={`Search by name or email…`}
                    autoFocus
                  />
                </div>
              </label>
              <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 max-h-72 overflow-y-auto">
                {searching && (
                  <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
                    <Loader2 className="w-4 h-4 animate-spin" /> Searching…
                  </div>
                )}
                {!searching && query.trim().length < 2 && (
                  <p className="px-4 py-8 text-center text-sm text-slate-400">
                    Type at least 2 characters to search.
                  </p>
                )}
                {!searching && query.trim().length >= 2 && results.length === 0 && (
                  <p className="px-4 py-8 text-center text-sm text-slate-400">
                    No {targetRole}s matched “{query.trim()}”.
                  </p>
                )}
                {!searching && results.map((u) => {
                  const name = `${u.firstName} ${u.lastName}`.trim() || u.email;
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => { setSelected(u); setQuery(''); setResults([]); }}
                      className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-center gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900 truncate">{name}</p>
                        <p className="text-xs text-slate-500 truncate">{u.email}</p>
                      </div>
                      <Check className="w-4 h-4 text-transparent" aria-hidden />
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
        <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-xl text-sm">Cancel</button>
          <button
            onClick={() => void submit()}
            disabled={saving || !selected}
            className="px-4 py-2 bg-brand-600 text-white rounded-xl text-sm disabled:opacity-50"
          >
            {saving ? 'Awarding…' : 'Award badge'}
          </button>
        </div>
      </div>
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
      const res = await rewardsApi.uploadGiftImage(file);
      setImageUrl(res?.data?.url ?? null);
    } catch (e: unknown) {
      toast.error(extractApiErrorMessage(e, 'Could not upload image'));
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
            <label className="block text-sm font-medium text-slate-700 mb-1">Cost (coins)</label>
            <input type="number" min={0} value={costXp} onChange={(e) => setCostXp(Number(e.target.value) || 0)} className={field} />
            <p className="mt-1 text-xs text-slate-400">Spent from the mentee’s coin balance (task earnings − redemptions).</p>
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
