'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Building2, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/lib/context/AuthContext';
import { CreateWorkspaceDrawer } from '@/components/settings/OrganizationSettingsTab';
import { WorkspaceChooser } from '@/components/shared/WorkspaceChooser';
import { restoreAccessToken, SessionExpiredError } from '@/lib/services/auth-session';
import { organizationsApi, OrganizationSummary, resolveWorkspaceEntry } from '@/lib/services/organizations-api';
import { tokenStore } from '@/lib/services/token-store';
import { activeWorkspaceSlug, switchWorkspace, validWorkspaceSlug } from '@/lib/services/workspace-scope';

type GatewayState = 'checking' | 'opening' | 'choose' | 'signed-out' | 'error';

function workspaceSlug(value: string): string {
  const raw = value.trim().toLowerCase().replace(/^https?:\/\//, '');
  return raw.match(/(?:^|\/)w\/([a-z0-9-]+)(?:\/|$)/)?.[1]
    ?? raw.match(/^([a-z0-9-]+)\.pathment\.me(?:\/|$)/)?.[1]
    ?? raw.replace(/^app\.pathment\.me\//, '').replace(/^\/+|\/+$/g, '');
}

function BrandHeader() {
  return (
    <header className="flex items-center justify-between">
      <span className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-tile.png" alt="" className="h-11 w-11 rounded-xl shadow-sm" />
        <span>
          <span className="block text-base font-bold leading-tight text-slate-950">Pathment</span>
          <span className="block text-xs text-slate-500">Your mentorship workspace</span>
        </span>
      </span>
      <Link href="https://pathment.me" className="text-sm font-medium text-slate-600 hover:text-brand-700">About Pathment</Link>
    </header>
  );
}

export default function HomePage() {
  const { isLoading: authLoading } = useAuth();
  const [state, setState] = useState<GatewayState>('checking');
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [workspace, setWorkspace] = useState('');
  const [attempt, setAttempt] = useState(0);
  const recentSlug = activeWorkspaceSlug();
  const cachedUser = tokenStore.getUser<{ firstName?: string; email?: string }>();
  const slug = workspaceSlug(workspace);

  const loadAccount = useCallback(async () => {
    try {
      const token = await restoreAccessToken();
      if (!token) {
        setState('signed-out');
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
        setState('signed-out');
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

  const openWorkspace = (event: FormEvent) => {
    event.preventDefault();
    if (!validWorkspaceSlug(slug)) return;
    window.location.assign(`/w/${slug}/login`);
  };

  if (state === 'checking' || state === 'opening') {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 px-6">
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
    <main className="relative min-h-screen overflow-hidden bg-slate-50 px-5 py-6 sm:px-8 sm:py-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-brand-50/90 to-transparent" />
      <div className="relative mx-auto max-w-5xl">
        <BrandHeader />

        {state === 'choose' && (
          <section className="mx-auto mt-16 max-w-2xl sm:mt-20">
            <div className="mb-7">
              <span className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white/80 px-3 py-1 text-xs font-semibold text-brand-700 shadow-sm">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> Signed in{cachedUser?.email ? ` as ${cachedUser.email}` : ''}
              </span>
              <h1 className="mt-5 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                {cachedUser?.firstName ? `Welcome back, ${cachedUser.firstName}` : 'Choose a workspace'}
              </h1>
              <p className="mt-3 text-base leading-7 text-slate-600">Choose the organization you want to open. Pathment will remember it for next time.</p>
            </div>
            <WorkspaceChooser
              organizations={organizations}
              recentSlug={recentSlug}
              onOpen={switchWorkspace}
              canCreate={canCreate}
              onCreate={() => setCreating(true)}
            />
            {organizations.length > 0 && (
              <p className="mt-5 text-center text-xs text-slate-500">Only organizations where your account has an active membership are shown.</p>
            )}
          </section>
        )}

        {state === 'signed-out' && (
          <section className="mx-auto mt-14 grid max-w-4xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-200/60 lg:mt-20 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="hidden bg-gradient-to-br from-brand-800 to-brand-600 p-10 text-white lg:block">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/20"><Building2 className="h-6 w-6" aria-hidden="true" /></span>
              <h1 className="mt-8 text-3xl font-semibold leading-tight">Get back to the people and progress that matter.</h1>
              <p className="mt-4 text-sm leading-6 text-white/75">Your workspace keeps programs, teams, and roles together in one secure place.</p>
            </div>
            <div className="p-7 sm:p-10">
              <p className="text-sm font-semibold text-brand-700">Open your workspace</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Where do you work?</h1>
              <p className="mt-3 text-sm leading-6 text-slate-600">Enter the workspace from your invitation. You’ll sign in on the next screen.</p>
              <form onSubmit={openWorkspace} className="mt-7 space-y-3">
                <label htmlFor="workspace" className="block text-sm font-semibold text-slate-800">Workspace address</label>
                <div className="flex rounded-xl border border-slate-300 bg-white shadow-sm transition focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
                  <span className="flex items-center pl-4 text-sm text-slate-400">app.pathment.me/w/</span>
                  <input id="workspace" autoFocus autoComplete="organization" value={workspace} onChange={(event) => setWorkspace(event.target.value)} placeholder="your-workspace" className="min-w-0 flex-1 bg-transparent px-1 py-3.5 pr-4 text-sm text-slate-950 outline-none" />
                </div>
                <button type="submit" disabled={!validWorkspaceSlug(slug)} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-45">
                  Continue <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </form>
              <p className="mt-6 text-xs leading-5 text-slate-500">New to Pathment? Use the invitation link sent by your workspace administrator.</p>
            </div>
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
