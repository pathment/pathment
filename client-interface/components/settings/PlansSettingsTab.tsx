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
      <div className="grid gap-3 sm:grid-cols-3">
        {(['members', 'programs', 'clans'] as const).map((key) => {
          const used = overview?.usage[key] || 0; const limit = Number(subscription.plan.limits[key]); const unlimited = limit < 0;
          return <div key={key} className="rounded-2xl border border-border p-4"><p className="text-xs font-medium capitalize text-muted-foreground">{key}</p><p className="mt-1 text-2xl font-semibold">{used}<span className="text-sm font-normal text-muted-foreground"> / {unlimited ? 'Unlimited' : limit}</span></p>{!unlimited && <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.min(100, (used / Math.max(1, limit)) * 100)}%` }} /></div>}</div>;
        })}
      </div>
      {subscription.requestedPlan && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Plan change requested: <strong>{subscription.requestedPlan.name}</strong>. Not active yet. Pathment will arrange an invoice; your current plan and limits stay in effect until an operator confirms and activates the change.</div>}
      {error && <div role="status"><p>Could not load available plans.</p><button onClick={() => { setError(false); setLoading(true); setAttempt(n => n + 1); }} className="text-brand-700 underline">Try again</button></div>}
      {!error && plans.length === 0 && <p role="status">No plans are currently published.</p>}
      <div className="grid gap-4 xl:grid-cols-3">
        {plans.map((plan) => { const active = plan.id === subscription.plan.id; const pending = plan.id === subscription.requestedPlan?.id; return (
          <article key={plan.id} className={`rounded-2xl border p-5 ${active ? 'border-brand-400 ring-2 ring-brand-500/15' : 'border-border'}`}>
            <div className="flex items-center justify-between"><h3 className="font-semibold">{plan.name}</h3>{active && <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">Current</span>}</div>
            <p className="mt-2 min-h-10 text-sm text-muted-foreground">{plan.description}</p>
            <p className="mt-4 text-2xl font-semibold">{plan.monthlyPriceCents ? new Intl.NumberFormat('en', { style: 'currency', currency: plan.currency, currencyDisplay: 'code' }).format(plan.monthlyPriceCents / 100) : 'Free'}<span className="text-sm font-normal text-muted-foreground">{plan.monthlyPriceCents ? '/month' : ''}</span></p>
            <ul className="mt-4 space-y-2 text-sm">{Object.entries(plan.limits).map(([key, limit]) => <li key={key}>{limit < 0 ? 'Unlimited' : limit} {key}</li>)}</ul>
            <ul className="mt-5 space-y-2 text-sm">{Object.entries(plan.features).filter(([, enabled]) => enabled).map(([key]) => <li key={key} className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-600" />{LABELS[key] || key}</li>)}</ul>
            {!active && canManage && <button onClick={() => request(plan)} disabled={requesting !== null || pending} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-brand-300 px-4 py-2.5 text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50">{requesting === plan.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{pending ? 'Requested — awaiting activation' : `Request ${plan.name}`}</button>}
          </article>
        ); })}
      </div>
    </div>
  );
}
