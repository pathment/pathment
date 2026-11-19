'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Globe2, Pencil, Plus, TriangleAlert, X } from 'lucide-react';
import { toast } from 'sonner';
import { qk, useApiQuery, STALE } from '@/lib/query';
import { platformApi, type PlatformPlan } from '@/lib/services/platform-api';
import { PageHeader, useGate } from '@/components/platform/PlatformShell';
import { btn, CardSkeleton, money, SectionCard } from '@/components/platform/primitives';
import { ErrorState } from '@/components/shared/ErrorState';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { cn } from '@/components/ui/utils';
import { entitlementLabel, isEnforcedLimit, isShippedFeature, NOT_ENFORCED_HINT } from '@/lib/config/platform-entitlements';

const inputClass = 'mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-brand-500/40';

type PlanDraft = {
  key: string; name: string; description: string;
  monthlyPrice: string; annualPrice: string; currency: string;
  limits: Array<{ key: string; value: string }>;
  features: Array<{ key: string; value: boolean }>;
  active: boolean; sortOrder: string;
};

const toDraft = (plan?: PlatformPlan): PlanDraft => ({
  key: plan?.key || '',
  name: plan?.name || '',
  description: plan?.description || '',
  monthlyPrice: plan ? String(plan.monthlyPriceCents / 100) : '',
  annualPrice: plan ? String(plan.annualPriceCents / 100) : '',
  currency: plan?.currency || 'USD',
  limits: Object.entries(plan?.limits || { members: 100, programs: 2, clans: 5 }).map(([key, value]) => ({ key, value: String(value) })),
  features: Object.entries(plan?.features || { certificates: true, aiEvaluation: true, advancedAnalytics: false }).map(([key, value]) => ({ key, value: Boolean(value) })),
  active: plan?.active ?? true,
  sortOrder: String(plan?.sortOrder ?? 0),
});

function PlanEditor({ plan, onClose }: { plan: PlatformPlan | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<PlanDraft>(() => toDraft(plan || undefined));
  const [newLimitKey, setNewLimitKey] = useState('');
  const [newFeatureKey, setNewFeatureKey] = useState('');

  const save = useMutation({
    mutationFn: () => {
      const limits: Record<string, number> = {};
      for (const row of draft.limits) {
        const parsed = parseInt(row.value, 10);
        if (!row.key.trim() || !Number.isInteger(parsed) || parsed < -1) throw new Error(`Limit "${row.key || '(empty)'}" needs a whole number (-1 = unlimited)`);
        limits[row.key.trim()] = parsed;
      }
      const features: Record<string, boolean> = {};
      for (const row of draft.features) if (row.key.trim()) features[row.key.trim()] = row.value;
      const monthly = Math.round(parseFloat(draft.monthlyPrice || '0') * 100);
      const annual = Math.round(parseFloat(draft.annualPrice || '0') * 100);
      if (!Number.isFinite(monthly) || monthly < 0 || !Number.isFinite(annual) || annual < 0) throw new Error('Prices must be zero or positive');
      const payload = {
        name: draft.name.trim(), description: draft.description.trim() || null,
        monthlyPriceCents: monthly, annualPriceCents: annual, currency: draft.currency.toUpperCase(),
        limits, features, active: draft.active, sortOrder: parseInt(draft.sortOrder, 10) || 0,
      };
      return plan
        ? platformApi.plans.update(plan.id, payload)
        : platformApi.plans.create({ ...payload, key: draft.key.trim().toLowerCase() } as Omit<PlatformPlan, 'id'>);
    },
    onSuccess: () => {
      toast.success(plan ? 'Plan updated — live on the pricing page' : 'Plan created');
      queryClient.invalidateQueries({ queryKey: qk.platform.all });
      onClose();
    },
    onError: (error) => toast.error(error instanceof Error && !('response' in error) ? error.message : extractApiErrorMessage(error, 'Could not save the plan')),
  });

  return (
    <SectionCard
      title={plan ? `Edit ${plan.name}` : 'New plan'}
      actions={<button type="button" onClick={onClose} className="rounded-lg p-1 hover:bg-muted" aria-label="Close editor"><X className="h-4 w-4" /></button>}
    >
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
        <p className="flex items-start gap-2">
          <Globe2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          The marketing pricing page reads this catalog live and unauthenticated. Price and limit edits are public the moment they save.
        </p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {!plan ? (
          <label><span className="text-xs font-medium">Key (immutable)</span>
            <input value={draft.key} onChange={(event) => setDraft((d) => ({ ...d, key: event.target.value }))} className={cn(inputClass, 'font-mono')} placeholder="enterprise" />
          </label>
        ) : null}
        <label><span className="text-xs font-medium">Name</span>
          <input value={draft.name} onChange={(event) => setDraft((d) => ({ ...d, name: event.target.value }))} className={inputClass} />
        </label>
        <label className="sm:col-span-2"><span className="text-xs font-medium">Description</span>
          <input value={draft.description} onChange={(event) => setDraft((d) => ({ ...d, description: event.target.value }))} className={inputClass} />
        </label>
        <label><span className="text-xs font-medium">Monthly price ({draft.currency})</span>
          <input type="number" min={0} step="0.01" value={draft.monthlyPrice} onChange={(event) => setDraft((d) => ({ ...d, monthlyPrice: event.target.value }))} className={inputClass} />
        </label>
        <label><span className="text-xs font-medium">Annual price ({draft.currency})</span>
          <input type="number" min={0} step="0.01" value={draft.annualPrice} onChange={(event) => setDraft((d) => ({ ...d, annualPrice: event.target.value }))} className={inputClass} />
        </label>
        <label><span className="text-xs font-medium">Sort order</span>
          <input type="number" value={draft.sortOrder} onChange={(event) => setDraft((d) => ({ ...d, sortOrder: event.target.value }))} className={inputClass} />
        </label>
        <label className="flex items-end gap-2 pb-1">
          <input type="checkbox" checked={draft.active} onChange={(event) => setDraft((d) => ({ ...d, active: event.target.checked }))} className="h-4 w-4 rounded border-border" />
          <span className="text-xs font-medium">Active (listed publicly and offerable)</span>
        </label>
      </div>

      <h3 className="mt-5 text-xs font-semibold text-muted-foreground">Limits <span className="font-normal">(-1 = unlimited; members = participants (mentees only), programs and clans are enforced today)</span></h3>
      <div className="mt-2 space-y-1.5">
        {draft.limits.map((row, index) => (
          <div key={index} className="flex items-center gap-2">
            <input value={row.key} readOnly className="w-48 rounded-lg border border-border bg-muted/40 px-3 py-1.5 font-mono text-xs" aria-label="Limit key" />
            <input
              type="number" min={-1} value={row.value}
              onChange={(event) => setDraft((d) => ({ ...d, limits: d.limits.map((item, i) => i === index ? { ...item, value: event.target.value } : item) }))}
              className="w-28 rounded-lg border border-border bg-background px-3 py-1.5 text-sm tabular-nums outline-none focus:ring-2 focus:ring-brand-500/40"
              aria-label={`Limit ${row.key}`}
            />
            <button type="button" onClick={() => setDraft((d) => ({ ...d, limits: d.limits.filter((_, i) => i !== index) }))} className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label={`Remove ${row.key}`}>
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <div className="flex items-center gap-2 pt-1">
          <input value={newLimitKey} onChange={(event) => setNewLimitKey(event.target.value)} placeholder="new limit key…" className="w-48 rounded-lg border border-dashed border-border bg-background px-3 py-1.5 font-mono text-xs outline-none focus:ring-2 focus:ring-brand-500/40" />
          <button
            type="button"
            disabled={!/^[a-zA-Z][a-zA-Z0-9]{1,39}$/.test(newLimitKey)}
            onClick={() => { setDraft((d) => ({ ...d, limits: [...d.limits, { key: newLimitKey, value: '0' }] })); setNewLimitKey(''); }}
            className={btn.ghostSm}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden /> Add
          </button>
        </div>
      </div>

      <h3 className="mt-5 text-xs font-semibold text-muted-foreground">Features <span className="font-normal">(entitlement flags; shipping them is a separate question)</span></h3>
      <div className="mt-2 space-y-1.5">
        {draft.features.map((row, index) => (
          <div key={index} className="flex items-center gap-2">
            <input value={row.key} readOnly className="w-48 rounded-lg border border-border bg-muted/40 px-3 py-1.5 font-mono text-xs" aria-label="Feature key" />
            <button
              type="button"
              onClick={() => setDraft((d) => ({ ...d, features: d.features.map((item, i) => i === index ? { ...item, value: !item.value } : item) }))}
              className={cn('rounded-lg px-3 py-1.5 text-xs font-medium', row.value ? 'bg-emerald-600 text-white' : 'border border-border text-muted-foreground')}
              aria-pressed={row.value}
            >
              {row.value ? 'on' : 'off'}
            </button>
            <button type="button" onClick={() => setDraft((d) => ({ ...d, features: d.features.filter((_, i) => i !== index) }))} className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label={`Remove ${row.key}`}>
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <div className="flex items-center gap-2 pt-1">
          <input value={newFeatureKey} onChange={(event) => setNewFeatureKey(event.target.value)} placeholder="new feature key…" className="w-48 rounded-lg border border-dashed border-border bg-background px-3 py-1.5 font-mono text-xs outline-none focus:ring-2 focus:ring-brand-500/40" />
          <button
            type="button"
            disabled={!/^[a-zA-Z][a-zA-Z0-9]{1,39}$/.test(newFeatureKey)}
            onClick={() => { setDraft((d) => ({ ...d, features: [...d.features, { key: newFeatureKey, value: true }] })); setNewFeatureKey(''); }}
            className={btn.ghostSm}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden /> Add
          </button>
        </div>
      </div>

      <div className="mt-5 flex justify-end gap-2 border-t border-border pt-4">
        <button type="button" onClick={onClose} className={btn.ghostSm}>Cancel</button>
        <button
          type="button"
          disabled={save.isPending || !draft.name.trim() || (!plan && !/^[a-z0-9_-]{2,40}$/.test(draft.key))}
          onClick={() => save.mutate()}
          className={btn.primarySm}
        >
          {save.isPending ? 'Saving…' : plan ? 'Save changes' : 'Create plan'}
        </button>
      </div>
    </SectionCard>
  );
}

export default function PlansPage() {
  const isOwner = useGate('owner');
  const [editing, setEditing] = useState<PlatformPlan | null | 'new'>(null);

  const { data, loading, error, refetch } = useApiQuery({
    queryKey: qk.platform.plans,
    queryFn: platformApi.plans.catalog,
    staleTime: STALE.short,
  });

  const fmtLimit = (value: number | undefined) => value == null ? '—' : value < 0 ? '∞' : value.toLocaleString();

  return (
    <div>
      <PageHeader
        title="Plan catalog"
        description="What the pricing page sells and the product enforces."
        actions={isOwner ? (
          <button type="button" onClick={() => setEditing('new')} className={btn.primary}>
            <Plus className="h-4 w-4" aria-hidden /> New plan
          </button>
        ) : null}
      />

      {loading ? (
        <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
          <CardSkeleton lines={6} /><CardSkeleton lines={6} /><CardSkeleton lines={6} />
        </div>
      ) : error ? (
        <ErrorState message={error || undefined} onRetry={refetch} variant="page" />
      ) : (
        <>
          {editing !== null ? (
            <div className="mb-4">
              <PlanEditor plan={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {(data?.plans || []).map((plan) => (
              <div key={plan.id} className={cn('rounded-2xl border bg-card p-5', plan.active ? 'border-border' : 'border-dashed border-border opacity-70')}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 font-semibold">
                      {plan.name}
                      {!plan.active ? <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">inactive</span> : null}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{plan.key}</p>
                  </div>
                  {isOwner ? (
                    <button type="button" onClick={() => setEditing(plan)} className="rounded-lg border border-border p-1.5 hover:bg-muted" aria-label={`Edit ${plan.name}`}>
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
                <p className="mt-3 text-2xl font-semibold tabular-nums">
                  {money(plan.monthlyPriceCents, plan.currency)}<span className="text-sm font-normal text-muted-foreground">/mo</span>
                  <span className="ml-2 text-sm font-normal text-muted-foreground">· {money(plan.annualPriceCents, plan.currency)}/yr</span>
                </p>
                {plan.description ? <p className="mt-1.5 text-xs text-muted-foreground">{plan.description}</p> : null}
                <dl className="mt-4 space-y-1 border-t border-border pt-3 text-xs">
                  {Object.entries(plan.limits).filter(([key]) => isEnforcedLimit(key)).map(([key, value]) => (
                    <div key={key} className="flex justify-between"><dt className="text-muted-foreground">{entitlementLabel(key)}</dt><dd className="tabular-nums font-medium">{fmtLimit(value)}</dd></div>
                  ))}
                </dl>
                <div className="mt-3 flex flex-wrap gap-1">
                  {Object.entries(plan.features).filter(([key, enabled]) => enabled && isShippedFeature(key)).map(([key]) => (
                    <span key={key} className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400">{entitlementLabel(key)}</span>
                  ))}
                </div>
                {(() => {
                  const seeded = [
                    ...Object.entries(plan.limits).filter(([key]) => !isEnforcedLimit(key)).map(([key, value]) => `${entitlementLabel(key)}: ${fmtLimit(value)}`),
                    ...Object.entries(plan.features).filter(([key, enabled]) => enabled && !isShippedFeature(key)).map(([key]) => entitlementLabel(key)),
                  ];
                  if (!seeded.length) return null;
                  return (
                    <p className="mt-2 text-[10px] text-muted-foreground/70" title={NOT_ENFORCED_HINT}>
                      Seeded, not enforced: {seeded.join(' · ')}
                    </p>
                  );
                })()}
                <p className="mt-4 border-t border-border pt-3 text-[11px] text-muted-foreground tabular-nums">
                  {data?.subscriberCounts?.[plan.id] || 0} subscription{(data?.subscriberCounts?.[plan.id] || 0) === 1 ? '' : 's'}
                </p>
              </div>
            ))}
          </div>

          {!isOwner ? (
            <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
              <TriangleAlert className="h-3.5 w-3.5" aria-hidden /> Editing the catalog requires the platform owner role.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
