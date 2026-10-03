'use client';

import { useEffect, useState } from 'react';
import { Building2, Loader2, Plus, Save } from 'lucide-react';
import { toast } from 'sonner';
import { useOrganization } from '@/lib/context/OrganizationContext';
import { organizationsApi } from '@/lib/services/organizations-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { Drawer } from '@/components/shared/Drawer';
import { OrganizationAvatarEditor } from '@/components/shared/OrganizationAvatarEditor';

export function OrganizationSettingsTab() {
  const { current, overview, refresh, switchTo } = useOrganization();
  const [name, setName] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [timezone, setTimezone] = useState('UTC');
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const creationEnabled = overview?.workspaceCreationEnabled === true;
  const canEdit = ['owner', 'admin'].includes(overview?.membership?.role || '');

  useEffect(() => {
    if (!current) return;
    setName(current.name);
    setLogoUrl(current.logoUrl);
    setTimezone(current.timezone || 'UTC');
  }, [current]);

  if (!current) return <div className="py-12 text-center text-sm text-muted-foreground">Organization information is unavailable.</div>;

  const save = async () => {
    setSaving(true);
    try {
      await organizationsApi.update({ name: name.trim(), timezone });
      await refresh();
      toast.success('Organization updated');
    } catch (error) { toast.error(extractApiErrorMessage(error, 'Could not update the organization')); }
    finally { setSaving(false); }
  };

  const updateLogo = async (value: string | null) => {
    setLogoUrl(value);
    await refresh();
  };

  const field = 'w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-60';
  return (
    <div className="space-y-7">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-700"><Building2 className="h-5 w-5" /></span>
        <div><h2 className="font-semibold text-foreground">Organization</h2><p className="text-sm text-muted-foreground">Workspace identity and regional defaults.</p></div>
      </div>
      <OrganizationAvatarEditor name={name || current.name} logoUrl={logoUrl} disabled={!canEdit} onChanged={updateLogo} />
      <div className="grid gap-5 md:grid-cols-2">
        <label className="space-y-2"><span className="text-sm font-medium">Name</span><input className={field} value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} /></label>
        <label className="space-y-2"><span className="text-sm font-medium">Workspace URL</span><input className={field} value={`app.pathment.me/w/${current.slug}`} disabled /></label>
        <label className="space-y-2"><span className="text-sm font-medium">Default timezone</span><input className={field} value={timezone} onChange={(e) => setTimezone(e.target.value)} disabled={!canEdit} placeholder="Asia/Karachi" /></label>
      </div>
      {canEdit && <button onClick={save} disabled={saving || !name.trim()} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save organization</button>}
      <div className="border-t border-border pt-6"><h3 className="text-sm font-semibold text-foreground">More workspaces</h3><p className="mt-1 text-sm text-muted-foreground">A new workspace starts with you as owner. Member directories and data from other workspaces are not imported.</p><p className="mt-2 text-sm text-muted-foreground">{creationEnabled ? 'New workspaces start on Starter.' : 'Workspace creation is not available yet. You can continue using your current workspace.'} <a href="https://pathment.me/pricing" target="_blank" rel="noreferrer" className="text-brand-700 underline">Browse plans (opens a new tab)</a></p><button disabled={!creationEnabled} onClick={() => setCreating(true)} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"><Plus className="h-4 w-4" />Create workspace</button></div>
      {creating && creationEnabled && <CreateWorkspaceDrawer onClose={() => setCreating(false)} onCreated={switchTo} />}
    </div>
  );
}

export function CreateWorkspaceDrawer({ onClose, onCreated }: { onClose: () => void; onCreated: (slug: string) => void }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const [saving, setSaving] = useState(false);
  const field = 'w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';
  const setWorkspaceName = (value: string) => {
    setName(value);
    setSlug(value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 63));
  };
  const submit = async () => {
    setSaving(true);
    try { const organization = await organizationsApi.create({ name: name.trim(), slug, timezone }); toast.success('Workspace created'); onCreated(organization.slug); }
    catch (error) { toast.error(extractApiErrorMessage(error, 'Could not create the workspace')); setSaving(false); }
  };
  return <Drawer open onClose={onClose} title="Create workspace" subtitle="Start on Starter with you as owner. No member directory or data is imported from another workspace. Browse public plans before creating." footer={<><button onClick={onClose} className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted">Cancel</button><button onClick={submit} disabled={saving || name.trim().length < 2 || !slug} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Create workspace</button></>}><div className="space-y-5"><label className="block space-y-2"><span className="text-sm font-medium">Workspace name</span><input autoFocus className={field} value={name} onChange={(e) => setWorkspaceName(e.target.value)} placeholder="Acme Learning" /></label><label className="block space-y-2"><span className="text-sm font-medium">Workspace URL</span><div className="flex items-center rounded-xl border border-border bg-background focus-within:ring-2 focus-within:ring-brand-500"><span className="pl-4 text-sm text-muted-foreground">app.pathment.me/w/</span><input className="min-w-0 flex-1 bg-transparent px-1 py-3 pr-4 text-sm outline-none" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 63))} placeholder="acme-learning" /></div></label><label className="block space-y-2"><span className="text-sm font-medium">Default timezone</span><input className={field} value={timezone} onChange={(e) => setTimezone(e.target.value)} /></label></div></Drawer>;
}
