'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Blocks, PencilLine, Plug, PlusCircle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { qk, useApiQuery, STALE } from '@/lib/query';
import {
  platformApi, CATALOG_APP_TYPES,
  type CatalogApp, type CatalogAppInput, type CatalogAppType, type CatalogIntegration,
} from '@/lib/services/platform-api';
import { PageHeader, useGate } from '@/components/platform/PlatformShell';
import { btn, OrgMark, RelativeTime, SectionCard, StatusPill, TableSkeleton } from '@/components/platform/primitives';
import { ErrorState } from '@/components/shared/ErrorState';
import { EmptyState } from '@/components/shared/EmptyState';
import { SelectMenu } from '@/components/shared/SelectMenu';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { cn } from '@/components/ui/utils';

const TYPE_OPTIONS = CATALOG_APP_TYPES.map((value) => ({ value, label: value.charAt(0).toUpperCase() + value.slice(1) }));

const EMPTY_FORM: CatalogAppInput = {
  name: '', type: 'other', description: '', iconUrl: '', integrationKey: null, backendUrl: '', frontendUrl: '', isActive: true,
};

const isHttpUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

function AppRow({ app, integrationLabel, canWrite, onEdit }: {
  app: CatalogApp; integrationLabel: string | null; canWrite: boolean; onEdit: () => void;
}) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: qk.platform.apps });
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const toggle = useMutation({
    mutationFn: () => platformApi.apps.update(app.id, { isActive: !app.isActive }),
    onSuccess: (updated) => { toast.success(updated.isActive ? `${updated.name} is visible to workspaces` : `${updated.name} is hidden from workspaces`); refresh(); },
    onError: (error) => toast.error(extractApiErrorMessage(error, 'Could not update the app')),
  });
  const remove = useMutation({
    mutationFn: () => platformApi.apps.remove(app.id),
    onSuccess: () => { toast.success(`${app.name} deleted`); refresh(); },
    onError: (error) => toast.error(extractApiErrorMessage(error, 'Could not delete the app')),
  });

  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-4">
      <OrgMark name={app.name} logoUrl={app.iconUrl} color="#0f766e" />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
          {app.name}
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium capitalize text-muted-foreground">{app.type}</span>
          {app.integrationKey ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-500/10 px-2 py-0.5 text-[11px] font-medium text-brand-700 dark:text-brand-400">
              <Plug className="h-3 w-3" aria-hidden /> {integrationLabel || app.integrationKey}
            </span>
          ) : (
            <span className="rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground">listing only</span>
          )}
          <StatusPill status={app.isActive ? 'active' : 'disabled'} />
        </p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {app.description || 'No description'} · {app.connections === 1 ? '1 workspace connected' : `${app.connections} workspaces connected`} · added <RelativeTime date={app.createdAt} />
        </p>
      </div>
      {canWrite ? (
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={onEdit} className={btn.ghostSm}>
            <PencilLine className="h-3.5 w-3.5" aria-hidden /> Edit
          </button>
          <button type="button" disabled={toggle.isPending} onClick={() => toggle.mutate()} className={btn.ghostSm}>
            {app.isActive ? 'Deactivate' : 'Activate'}
          </button>
          {confirmingDelete ? (
            <>
              <button type="button" disabled={remove.isPending} onClick={() => remove.mutate()} className={btn.dangerSm}>
                {remove.isPending ? 'Deleting…' : `Yes, delete${app.connections ? ` (${app.connections} connected)` : ''}`}
              </button>
              <button type="button" onClick={() => setConfirmingDelete(false)} className={btn.ghostSm}>Keep</button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className={btn.ghostSm}
              title={app.connections ? `Deleting also disconnects ${app.connections} workspace(s)` : 'Delete from the catalog'}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
        </div>
      ) : null}
    </li>
  );
}

function AppForm({ editing, integrations, onDone }: {
  editing: CatalogApp | null; integrations: CatalogIntegration[]; onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CatalogAppInput>(editing ? {
    name: editing.name, type: editing.type, description: editing.description || '',
    iconUrl: editing.iconUrl || '', integrationKey: editing.integrationKey,
    backendUrl: editing.backendUrl || '', frontendUrl: editing.frontendUrl || '', isActive: editing.isActive,
  } : EMPTY_FORM);

  const backendUrl = form.backendUrl?.trim() || '';
  const frontendUrl = form.frontendUrl?.trim() || '';
  // Any app may carry URLs; an integration needs the Backend URL to call.
  const urlError = form.integrationKey && !backendUrl ? 'Backend URL is required for an integration'
    : backendUrl && !isHttpUrl(backendUrl) ? 'Backend URL must start with http:// or https://'
      : frontendUrl && !isHttpUrl(frontendUrl) ? 'Frontend URL must start with http:// or https://'
        : null;
  const canSave = form.name.trim().length >= 2 && !urlError;

  const save = useMutation({
    mutationFn: () => {
      const payload: CatalogAppInput = {
        ...form,
        name: form.name.trim(),
        description: form.description?.trim() || null,
        iconUrl: form.iconUrl?.trim() || null,
        integrationKey: form.integrationKey || null,
        backendUrl: backendUrl || null,
        frontendUrl: frontendUrl || null,
      };
      return editing ? platformApi.apps.update(editing.id, payload) : platformApi.apps.create(payload);
    },
    onSuccess: (app) => {
      toast.success(editing ? `${app.name} updated` : `${app.name} added to the catalog`);
      queryClient.invalidateQueries({ queryKey: qk.platform.apps });
      onDone();
    },
    onError: (error) => toast.error(extractApiErrorMessage(error, 'Could not save the app')),
  });

  const integrationOptions = [
    { value: '', label: 'None — listing only', description: 'Shown in the catalog, no connect button yet' },
    ...integrations.map((integration) => {
      const taken = Boolean(integration.usedBy && integration.usedBy !== editing?.name);
      return {
        value: integration.key,
        label: integration.label || integration.key,
        description: taken
          ? `Already used by ${integration.usedBy} — keys are one app each`
          : `Asks for: ${integration.credentialFields.map((field) => field.label).join(', ')}`,
        meta: taken ? 'in use' : undefined,
      };
    }),
  ];
  const inputClass = 'mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500/40';

  return (
    <SectionCard
      title={editing ? `Edit ${editing.name}` : 'Add an app'}
      description={editing ? undefined : 'It appears on every workspace’s Apps page once active.'}
    >
      <form onSubmit={(event) => { event.preventDefault(); if (canSave) save.mutate(); }}>
        <label className="block">
          <span className="text-xs font-medium">Name</span>
          <input value={form.name} onChange={(event) => setForm((c) => ({ ...c, name: event.target.value }))} className={inputClass} placeholder="Edorax" />
        </label>
        <div className="mt-3">
          <span className="text-xs font-medium">Type</span>
          <SelectMenu
            value={form.type}
            onChange={(value) => setForm((c) => ({ ...c, type: value as CatalogAppType }))}
            options={TYPE_OPTIONS}
            ariaLabel="App type"
            className="mt-1.5 w-full"
          />
        </div>
        <label className="mt-3 block">
          <span className="text-xs font-medium">Description</span>
          <textarea
            value={form.description || ''}
            onChange={(event) => setForm((c) => ({ ...c, description: event.target.value }))}
            rows={3}
            className={inputClass}
            placeholder="What workspace admins see under the app's name."
          />
        </label>
        <label className="mt-3 block">
          <span className="text-xs font-medium">Icon URL <span className="font-normal text-muted-foreground">(optional)</span></span>
          <input value={form.iconUrl || ''} onChange={(event) => setForm((c) => ({ ...c, iconUrl: event.target.value }))} className={inputClass} placeholder="https://… or /apps/app-icon.svg" />
        </label>
        <div className="mt-3">
          <span className="text-xs font-medium">Integration</span>
          <SelectMenu
            value={form.integrationKey || ''}
            onChange={(value) => setForm((c) => ({ ...c, integrationKey: value || null }))}
            options={integrationOptions}
            ariaLabel="Server-side integration"
            className="mt-1.5 w-full"
          />
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            An integration makes the app connectable: admins enter the provider&apos;s keys, which are verified and stored encrypted. New keys ship with a server release.
          </p>
        </div>
        <label className="mt-3 block">
          <span className="text-xs font-medium">
            Backend URL{' '}
            <span className="font-normal text-muted-foreground">{form.integrationKey ? '(required for an integration)' : '(optional)'}</span>
          </span>
          <input
            type="url"
            value={form.backendUrl || ''}
            onChange={(event) => setForm((c) => ({ ...c, backendUrl: event.target.value }))}
            className={inputClass}
            placeholder="https://api.example.com"
          />
          <span className="mt-1 block text-[11px] text-muted-foreground">The app&apos;s server Pathment calls. Changing it applies to every connected workspace.</span>
        </label>
        <label className="mt-3 block">
          <span className="text-xs font-medium">Frontend URL <span className="font-normal text-muted-foreground">(optional)</span></span>
          <input
            type="url"
            value={form.frontendUrl || ''}
            onChange={(event) => setForm((c) => ({ ...c, frontendUrl: event.target.value }))}
            className={inputClass}
            placeholder="https://app.example.com"
          />
          <span className="mt-1 block text-[11px] text-muted-foreground">Where users open the app. Leave empty to use the Backend URL.</span>
        </label>
        {urlError && (backendUrl || frontendUrl) ? (
          <p className="mt-1.5 text-[11px] text-red-600 dark:text-red-400">{urlError}</p>
        ) : null}
        <label className="mt-3 flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={form.isActive !== false}
            onChange={(event) => setForm((c) => ({ ...c, isActive: event.target.checked }))}
          />
          <span className="text-xs">Active — visible to workspaces</span>
        </label>
        <div className="mt-4 flex gap-2">
          <button type="submit" disabled={!canSave || save.isPending} className={cn(btn.primary, 'flex-1')}>
            <PlusCircle className="h-4 w-4" aria-hidden />
            {save.isPending ? 'Saving…' : editing ? 'Save changes' : 'Add to catalog'}
          </button>
          {editing ? (
            <button type="button" onClick={onDone} className={btn.ghost}>Cancel</button>
          ) : null}
        </div>
      </form>
    </SectionCard>
  );
}

export default function PlatformAppsPage() {
  const canWrite = useGate('owner');
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data, loading, error, refetch } = useApiQuery({
    queryKey: qk.platform.apps,
    queryFn: () => platformApi.apps.list(),
    staleTime: STALE.short,
  });

  const apps = data?.apps || [];
  const editing = apps.find((app) => app.id === editingId) || null;

  return (
    <div>
      <PageHeader
        title="App catalog"
        description="Third-party apps every workspace's admins can see and connect from their Apps page. The catalog is global: a change here lands in all workspaces at once."
      />

      {loading ? (
        <div className="overflow-hidden rounded-3xl border border-border bg-card"><TableSkeleton rows={4} /></div>
      ) : error ? (
        <ErrorState message={error || undefined} onRetry={refetch} variant="page" />
      ) : (
        <div className={cn('grid gap-5', canWrite && 'lg:grid-cols-3')}>
          <div className={cn(canWrite && 'lg:col-span-2')}>
            {apps.length ? (
              <ul className="divide-y divide-border overflow-hidden rounded-3xl border border-border bg-card">
                {apps.map((app) => (
                  <AppRow
                    key={app.id}
                    app={app}
                    integrationLabel={data?.integrations?.find((integration) => integration.key === app.integrationKey)?.label || null}
                    canWrite={canWrite}
                    onEdit={() => setEditingId(app.id)}
                  />
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={<Blocks className="h-8 w-8" />}
                title="No apps in the catalog"
                description={canWrite ? 'Add the first app — it will appear on every workspace’s Apps page.' : 'A platform owner can add apps to the catalog.'}
              />
            )}
          </div>
          {canWrite ? (
            <AppForm
              key={editingId || 'create'}
              editing={editing}
              integrations={data?.integrations || []}
              onDone={() => setEditingId(null)}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
