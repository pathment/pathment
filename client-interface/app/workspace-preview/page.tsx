'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/context/AuthContext';
import { useOrganization } from '@/lib/context/OrganizationContext';
import { apiClient } from '@/lib/services/api-client';
import { organizationsApi, type Plan } from '@/lib/services/organizations-api';
import { workspacePath } from '@/lib/services/workspace-scope';
import { extractApiErrorMessage } from '@/lib/utils/api-error';

type Preview = {
  members: { id: string; name: string; workspaceRole: string; clanRoles: string[] }[];
  programs: { id: string; name: string }[];
  clans: { id: string; name: string; programId: string }[];
};

export default function WorkspacePreviewPage() {
  const { user, isLoading, logout } = useAuth();
  const { current, organizations, overview, switchTo, refresh } = useOrganization();
  const [data, setData] = useState<Preview | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [retry, setRetry] = useState(0);
  const userId = user?.id;
  const organizationId = current?.id;
  useEffect(() => {
    if (!userId || !organizationId) return;
    let active = true;
    setData(null);
    setError('');
    Promise.all([apiClient.get<{ data: Preview }>('/organizations/demo'), organizationsApi.plans()])
      .then(([response, catalog]) => { if (active) { setData(response.data); setPlans(catalog); } })
      .catch(e => { if (active) setError(extractApiErrorMessage(e, 'Could not load this workspace')); });
    return () => { active = false; };
  }, [userId, organizationId, retry]);

  const requestPlan = async (key: string) => {
    setPending(true);
    setError('');
    try { await organizationsApi.requestPlan(key); await refresh(); }
    catch (e) { setError(extractApiErrorMessage(e, 'Could not request plan')); }
    finally { setPending(false); }
  };
  const canManage = overview?.canManageOrganization === true;
  const button = 'rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted disabled:opacity-50';
  return <main className="mx-auto max-w-5xl space-y-7 px-6 py-10">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div><p className="text-sm font-medium text-brand-600">Pathment · Staging</p><h1 className="text-2xl font-bold">{current?.name || 'Workspace preview'}</h1></div>
      {user && <button className={button} onClick={() => void logout()}>Sign out</button>}
    </header>
    <div className="rounded-xl border border-border bg-muted p-4 text-sm">Restricted demo: explore workspace URLs, membership, switching and plans. Teaching, messages, certificates and background jobs are not enabled in these two demo workspaces while isolation work continues.</div>
    {isLoading ? <p>Loading session…</p> : !user ? <a className={button} href={workspacePath('/login?next=/workspace-preview')}>Sign in to this workspace</a> : <>
      <p className="text-sm text-muted-foreground">Signed in as {user.email}</p>
      <label className="block space-y-2"><span className="text-sm font-medium">Workspace</span><select className="block w-full rounded-lg border border-border bg-background p-3" value={current?.slug || ''} onChange={e => switchTo(e.target.value)}>
        {!current && <option value="">Select workspace</option>}
        {organizations.map(o => <option key={o.id} value={o.slug}>{o.name} · /w/{o.slug}</option>)}
      </select></label>
      {!current && <p role="alert">Workspace access is unavailable for this account. <a className="underline" href={workspacePath('/login?next=/workspace-preview')}>Return to sign in</a></p>}
      {error && <div role="alert" className="rounded-lg border border-border p-4">{error} <button className={button} onClick={() => { void refresh(); setRetry(n => n + 1); }}>Retry</button></div>}
      {current && !data && !error && <p>Loading workspace details…</p>}
      {data && <>
        <section className="rounded-xl border border-border p-5"><h2 className="mb-4 font-semibold">Members · {data.members.length}</h2><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-border"><th className="pb-3">Name</th><th>Workspace role</th><th>Clan roles</th></tr></thead><tbody>{data.members.map(m => <tr key={m.id} className="border-b border-border"><td className="py-3">{m.name}</td><td>{m.workspaceRole}</td><td>{m.clanRoles.join(', ') || '—'}</td></tr>)}</tbody></table></div></section>
        <section className="rounded-xl border border-border p-5"><h2 className="mb-3 font-semibold">Programs and clans</h2>{data.programs.map(p => <div key={p.id}><p>{p.name}</p><p className="text-sm text-muted-foreground">{data.clans.filter(c => c.programId === p.id).map(c => c.name).join(', ')}</p></div>)}</section>
        <section className="space-y-4"><h2 className="font-semibold">Plans · currently {overview?.subscription.plan.name}</h2><p className="text-sm text-muted-foreground">Requests are reviewed for manual invoicing. Nothing is charged or activated automatically.</p>{overview?.subscription.requestedPlan && <p role="status">Requested: {overview.subscription.requestedPlan.name} · awaiting review</p>}<div className="grid gap-4 md:grid-cols-3">{plans.map(p => <div className="rounded-xl border border-border p-5" key={p.id}><h3 className="font-semibold">{p.name}</h3><p className="my-3 text-sm">{p.description}</p><p className="mb-4 text-sm">Members: {p.limits.members === -1 ? 'Unlimited' : p.limits.members}</p>{canManage && <button className={button} disabled={pending || p.key === overview?.subscription.plan.key || p.key === overview?.subscription.requestedPlan?.key} onClick={() => void requestPlan(p.key)}>{p.key === overview?.subscription.plan.key ? 'Current plan' : 'Request plan'}</button>}</div>)}</div></section>
      </>}
    </>}
  </main>;
}
