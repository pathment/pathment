'use client';

import { useEffect, useState } from 'react';
import { Check, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useOrganization } from '@/lib/context/OrganizationContext';
import { organizationsApi, type Plan } from '@/lib/services/organizations-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { useConfirm } from '@/lib/context/ConfirmContext';

const LABELS: Record<string, string> = {
  certificates: 'Certificates', aiEvaluation: 'AI evaluation', customBranding: 'Custom branding',
  customDomain: 'Custom domain', advancedAnalytics: 'Advanced analytics', sso: 'Single sign-on',
  programCompletionStanding: 'Standing clan requests',
};

/** Plans are billed on participants (mentees); mentors and admins never count. */
const METRIC_LABELS: Record<string, string> = { members: 'participants', programs: 'programs', clans: 'clans' };

/**
 * The headline price: the monthly equivalent of the annual price when the plan
 * has one (that is the price it is sold at), with the month-to-month price
 * beside it.
 */
function priceParts(plan: Plan) {
  const money = (cents: number) => new Intl.NumberFormat('en', {
    style: 'currency', currency: plan.currency, currencyDisplay: 'code',
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
  if (!plan.monthlyPriceCents && !plan.annualPriceCents) return { headline: 'Free', unit: '', note: '' };
  if (plan.annualPriceCents) {
    const perMonth = Math.round(plan.annualPriceCents / 12);
    return {
      headline: money(perMonth),
      unit: '/month, billed yearly',
      note: plan.monthlyPriceCents ? `or ${money(plan.monthlyPriceCents)} month to month` : '',
    };
  }
  return { headline: money(plan.monthlyPriceCents), unit: '/month', note: '' };
}

export function PlansSettingsTab() {
  const { overview, refresh, loading: overviewLoading } = useOrganization();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState<string | null>(null);
  const confirm = useConfirm();
  const subscription = overview?.subscription;
  const canManage = overview?.canManageOrganization === true;

  useEffect(() => { let current = true; organizationsApi.plans().then(value => { if (current) setPlans(value); }).catch(() => { if (current) setError(true); }).finally(() => { if (current) setLoading(false); }); return () => { current = false; }; }, [attempt]);
  if (loading || overviewLoading) return <div className="grid min-h-48 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div>;

  if (!subscription) return <div role="status" className="space-y-3 py-8"><p>Workspace plan information is unavailable.</p><button onClick={() => void refresh()} className="text-brand-700 underline">Try again</button></div>;

  /** The three limits this page measures. Storage and AI quota are not shown here. */
  const METERED = ['members', 'programs', 'clans'] as const;
  /** Limit keys this workspace has had changed for it. */
  const overridden = new Set(subscription.overriddenLimits ?? []);
  const limitText = (value: number | undefined | null) =>
    value === undefined || value === null || Number(value) < 0 ? 'Unlimited' : String(value);
  const plannedLimitLabel = (key: string) => {
    const published = subscription.plan.publishedLimits?.[key];
    return published === undefined ? '' : limitText(published);
  };
  /**
   * Only count an override the page can actually point at. An overridden
   * storage quota is real but has no card here, so announcing "some limits
   * have been set for this workspace" would send an admin looking for a
   * difference that is nowhere on the screen.
   */
  const shownOverrides = METERED.filter((key) => overridden.has(key));

  /**
   * The plan cards list only ACTIVE plans. A workspace sitting on one that has
   * since been retired would therefore read "Current plan: X" above three
   * cards, none of them marked current and none of them X — which is exactly
   * "the selected plan is shown wrong". Its own card is added when the list
   * does not already contain it.
   */
  const currentIsListed = plans.some((p) => p.id === subscription.plan.id);
  const cards = currentIsListed ? plans : [
    {
      ...subscription.plan,
      /**
       * Trimmed the way `/plans` trims every published plan. The subscription
       * carries the whole limits object, including seeded entitlements the
       * product does not promise (storage, AI quota), and a retired plan's
       * card must not become the one place they are advertised.
       */
      limits: Object.fromEntries(
        METERED
          .filter((key) => subscription.plan.publishedLimits?.[key] !== undefined)
          .map((key) => [key, subscription.plan.publishedLimits![key]]),
      ),
    },
    ...plans,
  ];

  const request = async (plan: Plan) => {
    if (!await confirm({ title: `Request ${plan.name}?`, description: `${subscription.requestedPlan ? 'This replaces your pending request. ' : ''}Pathment will arrange a manual invoice. Your current plan and limits stay in effect until an operator confirms and activates the change. No payment is taken here.`, confirmLabel: 'Request plan' })) return;
    setRequesting(plan.key);
    try { await organizationsApi.requestPlan(plan.key); await refresh(); toast.success(`${plan.name} plan requested`); }
    catch (error) { toast.error(extractApiErrorMessage(error, 'Could not request this plan')); }
    finally { setRequesting(null); }
  };

  return (
    <div className="space-y-7">
      <div className="flex items-start justify-between gap-4"><div><h2 className="font-semibold text-foreground">Plan &amp; usage</h2><p className="text-sm text-muted-foreground">Current plan: {subscription.plan.name}. Limits apply to this workspace.</p></div><span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold capitalize text-foreground">{subscription.status}</span></div>
      <p className="text-sm text-muted-foreground">Plan changes use manual invoicing: request a plan → Pathment arranges an invoice → an operator confirms and activates the change. No payment is taken here. <a href="https://pathment.me/pricing" target="_blank" rel="noreferrer" className="text-brand-700 underline">Browse public plans (opens a new tab)</a></p>
      {!canManage && <p className="text-sm text-muted-foreground">Only people with full workspace administration access can request a plan change.</p>}
      {/*
          These three cards are the only numbers on the page that are about
          THIS workspace. Everything below is the price list.

          That distinction is the whole bug. The cards used to say "1089 /
          Unlimited · Custom limit for this workspace · Growth publishes 1500"
          — three facts, no sentence, and "custom limit" sitting over the word
          "Unlimited", which is the absence of one. Now each card states what
          is enforced here, and names the plan's own figure underneath only
          when the two actually differ.
      */}
      <div className="grid gap-3 sm:grid-cols-3">
        {METERED.map((key) => {
          const used = overview?.usage[key] || 0;
          const raw = subscription.plan.limits?.[key];
          // An absent limit is no limit. `Number(undefined)` is NaN, and NaN
          // fails every comparison, so this used to render "1089 / NaN".
          const limit = raw === undefined || raw === null ? -1 : Number(raw);
          const unlimited = !Number.isFinite(limit) || limit < 0;
          const custom = overridden.has(key);
          const published = plannedLimitLabel(key);
          return (
            <div key={key} className="rounded-2xl border border-border p-4">
              <p className="text-xs font-medium capitalize text-muted-foreground">{METRIC_LABELS[key] || key}</p>
              <p className="mt-1 text-2xl font-semibold">
                {used}
                <span className="text-sm font-normal text-muted-foreground"> / {unlimited ? 'Unlimited' : limit}</span>
              </p>
              {!unlimited && (
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.min(100, (used / Math.max(1, limit)) * 100)}%` }} />
                </div>
              )}
              {custom && (
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                  <span className="font-medium text-brand-700 dark:text-brand-300">
                    {unlimited ? 'No cap here' : `Set to ${limit} here`}
                  </span>
                  {published ? ` — ${subscription.plan.name} publishes ${published}` : ''}
                </p>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">Participants are the mentees in this workspace. Mentors and admins are always free and never count toward a limit.</p>
      {shownOverrides.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {shownOverrides.length === 1 ? 'One limit has' : `${shownOverrides.length} limits have`} been set for this
          workspace directly, so {shownOverrides.length === 1 ? 'it does' : 'they do'} not match what the
          {' '}{subscription.plan.name} plan publishes. The figures above are the ones enforced here; the plans
          below are what each plan comes with.
        </p>
      )}
      {subscription.requestedPlan && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Plan change requested: <strong>{subscription.requestedPlan.name}</strong>. Not active yet. Pathment will arrange an invoice; your current plan and limits stay in effect until an operator confirms and activates the change.</div>}
      {error && <div role="status"><p>Could not load available plans.</p><button onClick={() => { setError(false); setLoading(true); setAttempt(n => n + 1); }} className="text-brand-700 underline">Try again</button></div>}
      {!error && plans.length === 0 && <p role="status">No plans are currently published.</p>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((plan) => { const active = plan.id === subscription.plan.id; const pending = plan.id === subscription.requestedPlan?.id; return (
          <article key={plan.id} className={`rounded-2xl border p-5 ${active ? 'border-brand-400 ring-2 ring-brand-500/15' : 'border-border'}`}>
            <div className="flex items-center justify-between"><h3 className="font-semibold">{plan.name}</h3>{active && <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">Current</span>}</div>
            <p className="mt-2 min-h-10 text-sm text-muted-foreground">{plan.description}</p>
            {(() => { const price = priceParts(plan); return (
              <div className="mt-4">
                <p className="text-2xl font-semibold">{price.headline}<span className="text-sm font-normal text-muted-foreground">{price.unit}</span></p>
                {price.note && <p className="mt-0.5 text-xs text-muted-foreground">{price.note}</p>}
              </div>
            ); })()}
            {/*
                What this PLAN comes with — on every card, the current one
                included. It used to swap in the workspace's own limits here,
                so a Dev Weekends admin on an overridden Growth subscription
                read "Growth: Unlimited members" and had no way to find out
                what Growth actually is. A price list that changes depending
                on who is reading it is not a price list. What applies to this
                workspace is stated once, in the usage cards above.
            */}
            <ul className="mt-4 space-y-2 text-sm">{Object.entries(plan.limits).map(([key, limit]) => (
              <li key={key}>{limitText(limit)} {METRIC_LABELS[key] || key}</li>
            ))}</ul>
            {active && shownOverrides.length > 0 && (
              <p className="mt-2 text-xs text-brand-700 dark:text-brand-300">
                Your workspace runs on its own limits — see the figures above.
              </p>
            )}
            <ul className="mt-5 space-y-2 text-sm">{Object.entries(plan.features).filter(([, enabled]) => enabled).map(([key]) => <li key={key} className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-600" />{LABELS[key] || key}</li>)}</ul>
            {!active && canManage && <button onClick={() => request(plan)} disabled={requesting !== null || pending} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-brand-300 px-4 py-2.5 text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50">{requesting === plan.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{pending ? 'Requested — awaiting activation' : `Request ${plan.name}`}</button>}
          </article>
        ); })}
      </div>
    </div>
  );
}
