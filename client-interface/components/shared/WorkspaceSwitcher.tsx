'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Building2, Check, ChevronDown, Plus, Settings2 } from 'lucide-react';
import { useOrganization } from '@/lib/context/OrganizationContext';
import { workspacePath } from '@/lib/services/workspace-scope';
import { CreateWorkspaceDrawer } from '@/components/settings/OrganizationSettingsTab';
import { Avatar } from '@/components/shared/Avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface WorkspaceSwitcherProps {
  compact?: boolean;
  onNavigate?: () => void;
}

export function WorkspaceSwitcher({ compact = false, onNavigate }: WorkspaceSwitcherProps) {
  const { current, organizations, overview, loading, switchTo } = useOrganization();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const creationEnabled = overview?.workspaceCreationEnabled === true;

  const choose = (slug: string) => {
    if (slug === current?.slug) { setOpen(false); return; }
    setOpen(false);
    onNavigate?.();
    switchTo(slug);
  };

  const startCreating = () => {
    setOpen(false);
    setCreating(true);
  };

  return <>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={loading || !current}
          aria-label="Switch workspace"
          className={`flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-card text-left text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-60 ${compact ? 'px-3 py-2' : 'px-3 py-2.5'}`}
        >
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
            <Building2 className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{current?.name || 'Loading workspace…'}</span>
            {!compact && <span className="block truncate text-[11px] capitalize text-slate-500">{current?.membershipRole || 'member'} workspace</span>}
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-[var(--radix-popover-trigger-width)] min-w-64 overflow-hidden rounded-xl border-slate-200 p-0 shadow-xl">
        <div className="border-b border-slate-100 px-3 py-2.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Your workspaces</p>
        </div>
        <div className="max-h-72 overflow-y-auto p-1.5">
          {organizations.map((organization) => {
            const selected = organization.id === current?.id;
            return <button
              key={organization.id}
              type="button"
              onClick={() => choose(organization.slug)}
              aria-current={selected ? 'page' : undefined}
              className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors ${selected ? 'bg-brand-50 text-brand-900' : 'text-slate-700 hover:bg-slate-50'}`}
            >
              <Avatar name={organization.name} src={organization.logoUrl} size="sm" title={organization.name} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{organization.name}</span>
                <span className="block truncate text-xs capitalize text-slate-500">{organization.membershipRole || 'member'}</span>
              </span>
              {selected && <Check className="h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />}
            </button>;
          })}
        </div>
        <div className="space-y-1 border-t border-slate-100 p-1.5">
          <Link
            href={workspacePath('/workspaces')}
            onClick={() => { setOpen(false); onNavigate?.(); }}
            className="flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Settings2 className="h-4 w-4 text-slate-500" aria-hidden="true" />Manage workspaces
          </Link>
          <button
            type="button"
            onClick={startCreating}
            disabled={!creationEnabled}
            title={creationEnabled ? 'Create another workspace' : 'Workspace creation is not available yet'}
            className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />Add workspace
          </button>
        </div>
      </PopoverContent>
    </Popover>
    {creating && creationEnabled && <CreateWorkspaceDrawer
      onClose={() => setCreating(false)}
      onCreated={(slug) => { setCreating(false); onNavigate?.(); switchTo(slug); }}
    />}
  </>;
}
