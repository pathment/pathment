'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Loader2, LogIn, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/lib/context/AuthContext';
import { apiClient } from '@/lib/services/api-client';
import type { OrganizationSummary } from '@/lib/services/organizations-api';
import { switchWorkspace } from '@/lib/services/workspace-scope';
import { useApiQuery } from '@/lib/query/useApiQuery';
import { CreateWorkspaceDrawer } from '@/components/settings/OrganizationSettingsTab';
import { tokenStore } from '@/lib/services/token-store';
import { WorkspaceChooser } from '@/components/shared/WorkspaceChooser';
import { activeWorkspaceSlug } from '@/lib/services/workspace-scope';

export default function WorkspacesPage() {
  const { user, isLoading } = useAuth();
  const hasSession = Boolean(tokenStore.getToken());
  const [creating, setCreating] = useState(false);
  const { data, loading, error, refetch } = useApiQuery({
    queryKey: ['account-workspaces', user?.id ?? 'account'],
    enabled: hasSession,
    queryFn: () => apiClient.get<{ data: { organizations: OrganizationSummary[]; workspaceCreationEnabled: boolean } }>('/organizations/me').then(response => response.data),
    errorMessage: 'Could not load your workspaces',
  });
  const workspaces = data?.organizations ?? [];
  const canCreate = data?.workspaceCreationEnabled ?? false;

  if (isLoading) return <div role="status" className="grid min-h-screen place-items-center bg-slate-50"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /><span className="sr-only">Loading account</span></div>;

  return <main className="relative min-h-screen overflow-hidden bg-slate-50 px-5 py-8 sm:px-8">
    <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-brand-50/90 to-transparent" />
    <div className="relative mx-auto max-w-2xl pt-8 sm:pt-14">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-tile.png" alt="" className="h-11 w-11 rounded-xl shadow-sm" />
        <div><p className="font-bold leading-tight text-slate-950">Pathment</p><p className="text-xs text-slate-500">Workspace switcher</p></div>
      </div>
      <div className="mt-10">
        {hasSession && user?.email && <p className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white/80 px-3 py-1 text-xs font-semibold text-brand-700"><ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />Signed in as {user.email}</p>}
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Your workspaces</h1>
        <p className="mt-3 leading-7 text-slate-600">Switch organizations without signing in again. Your people, programs, and roles stay separate.</p>
      </div>
      {!hasSession ? <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><p className="text-sm text-slate-600">Your session has ended. Choose a workspace to sign in again.</p><Link href="/" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white"><LogIn className="h-4 w-4" aria-hidden="true" />Choose a workspace</Link></div> : <>
        {loading ? <div role="status" className="mt-10 flex items-center gap-3 text-sm text-slate-600"><Loader2 className="h-5 w-5 animate-spin text-brand-600" />Loading your organizations…</div> : error ? <div role="alert" className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950"><p>{error}</p><button onClick={() => void refetch()} className="mt-3 font-semibold text-brand-700">Try again</button></div> : <div className="mt-8"><WorkspaceChooser organizations={workspaces} recentSlug={activeWorkspaceSlug()} onOpen={switchWorkspace} canCreate={canCreate} onCreate={() => setCreating(true)} /></div>}
        {!loading && !error && !canCreate && <p className="mt-6 text-center text-xs text-slate-500">Only active organization memberships are shown.</p>}
        {creating && canCreate && <CreateWorkspaceDrawer onClose={() => setCreating(false)} onCreated={switchWorkspace} />}
      </>}
    </div>
  </main>;
}
