'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, LogOut, RefreshCw, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/lib/context/AuthContext';
import { CreateWorkspaceDrawer } from '@/components/settings/OrganizationSettingsTab';
import { WorkspaceChooser } from '@/components/shared/WorkspaceChooser';
import { restoreAccessToken, SessionExpiredError } from '@/lib/services/auth-session';
import { organizationsApi, OrganizationSummary, resolveWorkspaceEntry } from '@/lib/services/organizations-api';
import { tokenStore } from '@/lib/services/token-store';
import { activeWorkspaceSlug, switchWorkspace } from '@/lib/services/workspace-scope';
import '@/styles/public-appearance.css';

type GatewayState = 'checking' | 'opening' | 'choose' | 'error';

function BrandHeader() {
  return (
    <header className="flex items-center justify-between">
      <span className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-tile.png" alt="" className="h-11 w-11 rounded-xl shadow-sm" />
        <span>
          <span className="block text-base font-bold leading-tight text-white">Pathment</span>
          <span className="block text-xs text-brand-100">Your mentorship workspace</span>
        </span>
      </span>
      <Link href="https://pathment.me" className="text-sm font-medium text-brand-100 hover:text-white">About Pathment</Link>
    </header>
  );
}

export default function HomePage() {
  const { isLoading: authLoading, logout } = useAuth();
  const [state, setState] = useState<GatewayState>('checking');
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const recentSlug = activeWorkspaceSlug();
  const cachedUser = tokenStore.getUser<{ firstName?: string; email?: string }>();

  const loadAccount = useCallback(async () => {
    try {
      const token = await restoreAccessToken();
      if (!token) {
        window.location.replace('/login');
        return;
      }

      const account = await organizationsApi.account();
      const decision = resolveWorkspaceEntry(account.organizations, activeWorkspaceSlug());
      if (decision.kind === 'open') {
        setState('opening');
        switchWorkspace(decision.workspace.slug);
        return;
      }

      setOrganizations(account.organizations);
      setCanCreate(account.workspaceCreationEnabled);
      setState('choose');
    } catch (error) {
      if (error instanceof SessionExpiredError) {
        tokenStore.clearSession();
        window.location.replace('/login');
        return;
      }
      setState('error');
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    const timer = window.setTimeout(() => { void loadAccount(); }, 0);
    return () => window.clearTimeout(timer);
  }, [authLoading, attempt, loadAccount]);

  const signOutAccount = async () => {
    await logout();
    window.location.replace('/login');
  };

  if (state === 'checking' || state === 'opening') {
    return (
      <main data-public-appearance className="grid min-h-screen place-items-center bg-[var(--background)] px-6">
        <div role="status" className="flex flex-col items-center gap-3 text-sm font-medium text-slate-600">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
            <Loader2 className="h-6 w-6 animate-spin text-brand-600" aria-hidden="true" />
          </span>
          <span>{state === 'opening' ? 'Opening your recent workspace…' : 'Checking your Pathment account…'}</span>
        </div>
      </main>
    );
  }

  return (
    <main data-public-appearance className="relative min-h-screen overflow-hidden bg-[#f4f7f6] px-5 py-6 sm:px-8 sm:py-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[430px] bg-[radial-gradient(circle_at_75%_10%,#118b7c_0,transparent_34%),linear-gradient(135deg,#073f3b,#075e57)]" />
      <div className="relative mx-auto max-w-5xl">
        <BrandHeader />

        {state === 'choose' && (
          <section className="mx-auto mt-14 max-w-3xl sm:mt-20">
            <div className="mb-9 text-center text-white">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-brand-50">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> Signed in{cachedUser?.email ? ` as ${cachedUser.email}` : ''}
              </span>
              <h1 className="mt-5 text-3xl font-semibold tracking-tight text-white sm:text-5xl">
                {organizations.length === 0
                  ? 'You’re signed in — now join a workspace'
                  : cachedUser?.firstName ? `Welcome back, ${cachedUser.firstName}` : 'Choose a workspace'}
              </h1>
              <p className="mt-3 text-base leading-7 text-brand-50/80">
                {organizations.length === 0
                  ? 'Open an invitation from your organization, or create a workspace if workspace creation is available for your account.'
                  : 'Choose where you want to continue.'}
              </p>
            </div>
            <WorkspaceChooser
              organizations={organizations}
              recentSlug={recentSlug}
              onOpen={switchWorkspace}
              canCreate={canCreate}
              onCreate={() => setCreating(true)}
            />
            <button type="button" onClick={() => void signOutAccount()} className="mx-auto mt-6 flex items-center gap-2 text-sm font-medium text-slate-600 transition hover:text-brand-700">
              <LogOut className="h-4 w-4" aria-hidden="true" /> Sign out or use another account
            </button>
          </section>
        )}

        {state === 'error' && (
          <section role="alert" className="mx-auto mt-20 max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-lg shadow-slate-200/50">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-amber-50 text-amber-700"><RefreshCw className="h-5 w-5" aria-hidden="true" /></span>
            <h1 className="mt-5 text-2xl font-semibold text-slate-950">We couldn’t load your workspaces</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">Your session is still safe. Check your connection and try again.</p>
            <button type="button" onClick={() => { setState('checking'); setAttempt((value) => value + 1); }} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-700">
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again
            </button>
          </section>
        )}
      </div>
      {creating && canCreate && <CreateWorkspaceDrawer onClose={() => setCreating(false)} onCreated={switchWorkspace} />}
    </main>
  );
}
