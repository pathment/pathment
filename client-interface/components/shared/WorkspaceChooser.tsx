'use client';

import { ArrowRight, Check, Plus } from 'lucide-react';
import type { OrganizationSummary } from '@/lib/services/organizations-api';
import { WorkspaceLogo } from '@/components/shared/WorkspaceLogo';

const roleLabel = (role: OrganizationSummary['membershipRole']) => {
  if (!role) return 'Member';
  return role.replace('_', ' ').replace(/^./, (letter) => letter.toUpperCase());
};

export function WorkspaceChooser({
  organizations,
  recentSlug,
  onOpen,
  canCreate = false,
  onCreate,
}: {
  organizations: OrganizationSummary[];
  recentSlug?: string | null;
  onOpen: (slug: string) => void;
  canCreate?: boolean;
  onCreate?: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-950/10" aria-label="Your workspaces">
      {organizations.length > 0 && (
        <div className="border-b border-slate-200 px-5 py-4">
          <p className="text-sm font-semibold text-slate-900">Your workspaces</p>
          <p className="mt-0.5 text-xs text-slate-500">Only active memberships for this account are shown.</p>
        </div>
      )}
      {organizations.map((workspace, index) => {
        const recent = workspace.slug === recentSlug;
        return (
          <button
            key={workspace.id}
            type="button"
            onClick={() => onOpen(workspace.slug)}
            className={`group flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-brand-50/70 focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 ${index ? 'border-t border-slate-100' : ''}`}
          >
            <WorkspaceLogo name={workspace.name} src={workspace.logoUrl} size="xl" className="rounded-xl" />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="truncate text-base font-semibold text-slate-950">{workspace.name}</span>
                {recent && <span className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-semibold text-brand-800"><Check className="h-3 w-3" aria-hidden="true" /> Recent</span>}
              </span>
              <span className="mt-1 block truncate text-sm text-slate-500">{roleLabel(workspace.membershipRole)} · /w/{workspace.slug}</span>
            </span>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-slate-400 transition group-hover:bg-white group-hover:text-brand-700">
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </span>
          </button>
        );
      })}

      {!organizations.length && (
        <div className="px-6 py-10 text-center">
          <p className="font-semibold text-slate-900">No workspace memberships yet</p>
          <p className="mt-1 text-sm leading-6 text-slate-500">Open an invitation from your workspace administrator to join their organization.</p>
        </div>
      )}

      {canCreate && onCreate && (
        <button type="button" onClick={onCreate} className="inline-flex w-full items-center justify-center gap-2 border-t border-slate-200 px-5 py-3.5 text-sm font-semibold text-brand-700 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500">
          <Plus className="h-4 w-4" aria-hidden="true" /> Create a workspace
        </button>
      )}
    </div>
  );
}
