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
    <div className="space-y-3" aria-label="Your workspaces">
      {organizations.map((workspace) => {
        const recent = workspace.slug === recentSlug;
        return (
          <button
            key={workspace.id}
            type="button"
            onClick={() => onOpen(workspace.slug)}
            className="group flex w-full items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 sm:p-5"
          >
            <WorkspaceLogo name={workspace.name} src={workspace.logoUrl} size="xl" className="rounded-xl" />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="truncate text-base font-semibold text-slate-950">{workspace.name}</span>
                {recent && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
                    <Check className="h-3 w-3" aria-hidden="true" /> Recent
                  </span>
                )}
              </span>
              <span className="mt-1 block truncate text-sm text-slate-500">
                {roleLabel(workspace.membershipRole)} · app.pathment.me/w/{workspace.slug}
              </span>
            </span>
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-50 text-slate-500 transition group-hover:bg-brand-50 group-hover:text-brand-700">
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </span>
          </button>
        );
      })}

      {!organizations.length && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 px-5 py-8 text-center">
          <p className="font-semibold text-slate-900">No workspace memberships yet</p>
          <p className="mt-1 text-sm leading-6 text-slate-500">Open an invitation from your workspace administrator to join their organization.</p>
        </div>
      )}

      {canCreate && onCreate && (
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 transition hover:border-brand-300 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> Create a workspace
        </button>
      )}
    </div>
  );
}
