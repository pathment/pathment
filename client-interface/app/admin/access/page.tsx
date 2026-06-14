'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Search, ShieldCheck, SlidersHorizontal, Trash2, UserPlus, X, Pencil } from 'lucide-react';
import { toast } from 'sonner';

import { apiClient } from '@/lib/services/api-client';
import { CoMentorPermissionsDrawer } from '@/components/shared/CoMentorPermissionsDrawer';
import {
  accessApi,
  type CustomRole,
  type DirectoryUser,
  type RoleCatalogEntry,
  type UserAccess,
} from '@/lib/services/access-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { Drawer } from '@/components/shared/Drawer';

const PERMISSION_GROUPS = [
  { label: 'Programs & curriculum', perms: ['program.create', 'program.manage', 'program.publish', 'cohort.manage', 'roadmap.author', 'roadmap.publish_local'] },
  { label: 'Intake', perms: ['intake.manage', 'assessment.author', 'invite.create'] },
  { label: 'People & clans', perms: ['clan.create', 'clan.manage_members', 'mentee.view', 'mentee.manage', 'user.manage'] },
  { label: 'Work', perms: ['task.assign', 'task.review', 'library.manage'] },
  { label: 'Community & rewards', perms: ['community.post', 'community.moderate', 'announcement.post', 'gamification.manage'] },
  { label: 'Platform', perms: ['analytics.view', 'access.manage', 'system.settings'] },
];
const prettyPerm = (p: string) => p.replace(/[._]/g, ' ');
const SCOPE_LABEL: Record<string, string> = { org: 'Organization-wide', program: 'A program', clan: 'A clan', self: 'The user only' };

/** Shows exactly what a selected role can do, so the admin grants with eyes open. */
function RolePermissionList({ role }: { role?: RoleCatalogEntry }) {
  if (!role) return null;
  const perms = role.permissions;
  return (
    <div className="mt-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400 mb-1.5">What this role can do</p>
      {perms === '*' ? (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 dark:text-brand-300"><ShieldCheck className="w-3.5 h-3.5" /> Full access — every permission</span>
      ) : perms.length === 0 ? (
        <p className="text-xs text-slate-400">No permissions granted.</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {perms.map((p) => (
            <span key={p} className="px-1.5 py-0.5 rounded bg-card border border-slate-200 dark:border-slate-700 text-[11px] text-slate-600 dark:text-slate-300 capitalize">{prettyPerm(p)}</span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function RolesAccessPage() {
  const [tab, setTab] = useState<'people' | 'roles'>('people');
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-slate-900 mb-2 inline-flex items-center gap-2"><ShieldCheck className="w-6 h-6 text-brand-600" /> Roles &amp; Access</h1>
        <p className="text-slate-600">Grant scoped roles to people, and define your own custom roles. Changes take effect immediately.</p>
      </div>

      <div className="flex gap-0 border-b border-slate-200">
        {(['people', 'roles'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${tab === t ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
          >
            {t === 'people' ? 'People' : 'Custom roles'}
          </button>
        ))}
      </div>

      {tab === 'people' ? <PeopleTab /> : <CustomRolesTab />}
    </div>
  );
}

/* ─────────────────────────── People ─────────────────────────── */
function PeopleTab() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DirectoryUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<DirectoryUser | null>(null);
  const [inviting, setInviting] = useState(false);

  // Load the directory on mount (empty query) and whenever the search changes.
  useEffect(() => {
    const q = query.trim();
    const t = setTimeout(() => {
      setSearching(true);
      accessApi.searchUsers(q).then(setResults).catch(() => setResults([])).finally(() => setSearching(false));
    }, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <div className="grid lg:grid-cols-12 gap-6">
      <div className="lg:col-span-5">
        <div className="rounded-2xl border border-slate-200 bg-card p-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search people by name or email…"
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-card"
              />
            </div>
            <button onClick={() => setInviting(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 shrink-0">
              <UserPlus className="w-4 h-4" /> Invite
            </button>
          </div>
          <div className="mt-3 max-h-[60vh] overflow-y-auto divide-y divide-slate-100">
            {searching ? (
              <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-brand-600" /></div>
            ) : results.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">{query.trim() ? 'No matches.' : 'No users yet - invite someone to get started.'}</p>
            ) : results.map((u) => (
              <button
                key={u.id}
                onClick={() => setSelected(u)}
                className={`w-full text-left px-2 py-2.5 rounded-lg ${selected?.id === u.id ? 'bg-brand-50 dark:bg-brand-500/15' : 'hover:bg-slate-50'}`}
              >
                <p className="text-sm font-medium text-slate-900">{`${u.firstName} ${u.lastName}`.trim() || u.email}</p>
                <p className="text-xs text-slate-500">{u.email} · {u.role}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="lg:col-span-7">
        {selected ? <AccessPanel user={selected} /> : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-card p-12 text-center text-slate-400">
            Select someone to view and manage their roles - or <button onClick={() => setInviting(true)} className="text-brand-600 font-medium">invite a new person</button> with a role.
          </div>
        )}
      </div>

      {inviting && <InviteWithAccessDrawer onClose={() => setInviting(false)} onInvited={() => { setInviting(false); setQuery(''); }} />}
    </div>
  );
}

function InviteWithAccessDrawer({ onClose, onInvited }: { onClose: () => void; onInvited: () => void }) {
  const [catalog, setCatalog] = useState<RoleCatalogEntry[]>([]);
  const [email, setEmail] = useState('');
  const [baseRole, setBaseRole] = useState<'mentor' | 'mentee'>('mentor');
  const [roleKey, setRoleKey] = useState('');
  const [scopeId, setScopeId] = useState('');
  const [programs, setPrograms] = useState<{ id: string; name: string }[]>([]);
  const [clans, setClans] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    accessApi.roleCatalog().then(setCatalog).catch(() => {});
    apiClient.get<any>('/programs', { params: { limit: 100 } }).then((r) => setPrograms((r.data || []).map((p: any) => ({ id: p.id, name: p.name })))).catch(() => {});
    apiClient.get<any>('/clans').then((r) => setClans(((r.data?.clans) || r.data || []).map((c: any) => ({ id: c.id, name: c.name })))).catch(() => {});
  }, []);

  const role = catalog.find((r) => r.key === roleKey);
  const scopeLevel = role?.scope || 'org';
  const needsTarget = scopeLevel === 'program' || scopeLevel === 'clan';
  const builtIn = catalog.filter((r) => !r.custom);
  const custom = catalog.filter((r) => r.custom);

  const submit = async () => {
    if (!email.trim()) { toast.error('Enter an email'); return; }
    if (!roleKey) { toast.error('Pick a role to grant'); return; }
    if (needsTarget && !scopeId) { toast.error(`Select a ${scopeLevel}`); return; }
    setSaving(true);
    try {
      await accessApi.invite({
        email: email.trim(),
        baseRole,
        role: roleKey,
        scopeType: scopeLevel,
        scopeId: scopeLevel === 'self' ? null : needsTarget ? scopeId : null,
      });
      toast.success('Invite sent - the role applies when they register');
      onInvited();
    } catch (e) { toast.error(extractApiErrorMessage(e, 'Could not send invite')); }
    finally { setSaving(false); }
  };

  return (
    <Drawer open onClose={onClose} title="Invite someone" subtitle="They'll get the role automatically when they register"
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm">Cancel</button>
          <button onClick={submit} disabled={saving} className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium disabled:opacity-50 inline-flex items-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Send invite
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="person@example.com" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Account type</label>
          <div className="grid grid-cols-2 gap-2">
            {(['mentor', 'mentee'] as const).map((r) => (
              <button key={r} type="button" onClick={() => setBaseRole(r)}
                className={`rounded-lg border px-3 py-2 text-sm capitalize ${baseRole === r ? 'border-brand-400 bg-brand-50 dark:bg-brand-500/15 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                {r}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-500">Their base account; the role below is layered on top.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Role to grant</label>
          <select value={roleKey} onChange={(e) => { setRoleKey(e.target.value); setScopeId(''); }} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500">
            <option value="">Select a role…</option>
            <optgroup label="Built-in">{builtIn.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}</optgroup>
            {custom.length > 0 && <optgroup label="Custom">{custom.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}</optgroup>}
          </select>
          {role && <p className="mt-1 text-xs text-slate-500">{role.description} · Scope: {SCOPE_LABEL[role.scope]}</p>}
          <RolePermissionList role={role} />
        </div>
        {needsTarget && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{scopeLevel === 'program' ? 'Program' : 'Clan'}</label>
            <select value={scopeId} onChange={(e) => setScopeId(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="">Select…</option>
              {(scopeLevel === 'program' ? programs : clans).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
        )}
      </div>
    </Drawer>
  );
}

function AccessPanel({ user }: { user: DirectoryUser }) {
  const [access, setAccess] = useState<UserAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [granting, setGranting] = useState(false);
  const [permClanId, setPermClanId] = useState<string | null>(null);
  const userName = `${user.firstName} ${user.lastName}`.trim() || user.email;

  const load = useCallback(() => {
    setLoading(true);
    accessApi.userAccess(user.id).then(setAccess).catch(() => toast.error('Could not load access')).finally(() => setLoading(false));
  }, [user.id]);
  useEffect(load, [load]);

  const revoke = async (id: string) => {
    try { await accessApi.revoke(id); toast.success('Role revoked'); load(); }
    catch (e) { toast.error(extractApiErrorMessage(e, 'Could not revoke')); }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-card p-5">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-semibold text-slate-900">{`${user.firstName} ${user.lastName}`.trim() || user.email}</h2>
          <p className="text-sm text-slate-500">{user.email}</p>
        </div>
        <button onClick={() => setGranting(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700">
          <UserPlus className="w-4 h-4" /> Grant role
        </button>
      </div>

      {loading ? (
        <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-brand-600" /></div>
      ) : (
        <div className="mt-5 space-y-5">
          <section>
            <h3 className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-2">Granted roles</h3>
            {access && access.explicit.length > 0 ? (
              <div className="space-y-2">
                {access.explicit.map((a) => (
                  <div key={a.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{a.roleLabel}</p>
                      <p className="text-xs text-slate-500">{a.scopeLabel}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      {a.role === 'co_mentor' && a.scopeType === 'clan' && a.scopeId && (
                        <button onClick={() => setPermClanId(a.scopeId)} className="p-1.5 rounded-md text-slate-400 hover:text-brand-600 hover:bg-brand-50" aria-label="Edit permissions" title="Edit co-mentor permissions"><SlidersHorizontal className="w-4 h-4" /></button>
                      )}
                      <button onClick={() => revoke(a.id)} className="p-1.5 rounded-md text-rose-500 hover:bg-rose-50" aria-label="Revoke"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-slate-400">No directly-granted roles yet.</p>}
          </section>

          <section>
            <h3 className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-2">From clans &amp; account (read-only)</h3>
            {access && access.derived.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {access.derived.map((d, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                    {d.roleLabel} <span className="text-slate-400">· {d.scopeLabel}</span>
                  </span>
                ))}
              </div>
            ) : <p className="text-sm text-slate-400">None.</p>}
          </section>
        </div>
      )}

      {granting && <GrantDrawer user={user} onClose={() => setGranting(false)} onGranted={() => { setGranting(false); load(); }} />}
      {permClanId && (
        <CoMentorPermissionsDrawer clanId={permClanId} userId={user.id} name={userName} onClose={() => setPermClanId(null)} />
      )}
    </div>
  );
}

function GrantDrawer({ user, onClose, onGranted }: { user: DirectoryUser; onClose: () => void; onGranted: () => void }) {
  const [catalog, setCatalog] = useState<RoleCatalogEntry[]>([]);
  const [roleKey, setRoleKey] = useState('');
  const [scopeId, setScopeId] = useState('');
  const [programs, setPrograms] = useState<{ id: string; name: string }[]>([]);
  const [clans, setClans] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    accessApi.roleCatalog().then(setCatalog).catch(() => {});
    apiClient.get<any>('/programs', { params: { limit: 100 } }).then((r) => setPrograms((r.data || []).map((p: any) => ({ id: p.id, name: p.name })))).catch(() => {});
    apiClient.get<any>('/clans').then((r) => setClans(((r.data?.clans) || r.data || []).map((c: any) => ({ id: c.id, name: c.name })))).catch(() => {});
  }, []);

  const role = catalog.find((r) => r.key === roleKey);
  const scopeLevel = role?.scope || 'org';
  const needsTarget = scopeLevel === 'program' || scopeLevel === 'clan';

  const grant = async () => {
    if (!roleKey) { toast.error('Pick a role'); return; }
    if (needsTarget && !scopeId) { toast.error(`Select a ${scopeLevel}`); return; }
    setSaving(true);
    try {
      await accessApi.grant({
        userId: user.id, role: roleKey, scopeType: scopeLevel,
        scopeId: scopeLevel === 'self' ? user.id : needsTarget ? scopeId : null,
      });
      toast.success('Role granted');
      onGranted();
    } catch (e) { toast.error(extractApiErrorMessage(e, 'Could not grant role')); }
    finally { setSaving(false); }
  };

  const builtIn = catalog.filter((r) => !r.custom);
  const custom = catalog.filter((r) => r.custom);

  return (
    <Drawer open onClose={onClose} title="Grant a role" subtitle={`To ${user.firstName} ${user.lastName}`.trim()}
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm">Cancel</button>
          <button onClick={grant} disabled={saving} className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium disabled:opacity-50 inline-flex items-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Grant
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
          <select value={roleKey} onChange={(e) => { setRoleKey(e.target.value); setScopeId(''); }} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500">
            <option value="">Select a role…</option>
            <optgroup label="Built-in">
              {builtIn.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
            </optgroup>
            {custom.length > 0 && (
              <optgroup label="Custom">
                {custom.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
              </optgroup>
            )}
          </select>
          {role && <p className="mt-1 text-xs text-slate-500">{role.description} · Scope: {SCOPE_LABEL[role.scope]}</p>}
          <RolePermissionList role={role} />
        </div>

        {needsTarget && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{scopeLevel === 'program' ? 'Program' : 'Clan'}</label>
            <select value={scopeId} onChange={(e) => setScopeId(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="">Select…</option>
              {(scopeLevel === 'program' ? programs : clans).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
        )}
      </div>
    </Drawer>
  );
}

/* ─────────────────────────── Custom roles ─────────────────────────── */
function CustomRolesTab() {
  const [roles, setRoles] = useState<CustomRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<CustomRole | 'new' | null>(null);

  const load = () => { setLoading(true); accessApi.listCustomRoles().then(setRoles).catch(() => {}).finally(() => setLoading(false)); };
  useEffect(load, []);

  const remove = async (id: string) => {
    if (!confirm('Delete this custom role?')) return;
    try { await accessApi.deleteCustomRole(id); toast.success('Deleted'); load(); }
    catch (e) { toast.error(extractApiErrorMessage(e, 'Could not delete')); }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setEditing('new')} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
          <Plus className="w-4 h-4" /> New custom role
        </button>
      </div>
      {loading ? (
        <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-brand-600" /></div>
      ) : roles.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-card p-12 text-center text-slate-400">No custom roles yet. Create one to bundle permissions your way.</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {roles.map((r) => (
            <div key={r.id} className="rounded-2xl border border-slate-200 bg-card p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-slate-900">{r.label}</p>
                  <p className="text-xs text-slate-500">{SCOPE_LABEL[r.scopeLevel]}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setEditing(r)} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => remove(r.id)} className="p-1.5 rounded-md hover:bg-rose-50 text-rose-500"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
              {r.description && <p className="mt-1.5 text-sm text-slate-500 line-clamp-2">{r.description}</p>}
              <p className="mt-3 text-xs text-slate-400">{r.permissions.length} permissions</p>
            </div>
          ))}
        </div>
      )}
      {editing && <CustomRoleDrawer role={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function CustomRoleDrawer({ role, onClose, onSaved }: { role: CustomRole | null; onClose: () => void; onSaved: () => void }) {
  const [label, setLabel] = useState(role?.label || '');
  const [description, setDescription] = useState(role?.description || '');
  const [scopeLevel, setScopeLevel] = useState(role?.scopeLevel || 'org');
  const [perms, setPerms] = useState<string[]>(role?.permissions || []);
  const [saving, setSaving] = useState(false);

  const toggle = (p: string) => setPerms((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);

  const save = async () => {
    if (!label.trim()) { toast.error('Give the role a name'); return; }
    if (perms.length === 0) { toast.error('Pick at least one permission'); return; }
    setSaving(true);
    try {
      if (role) await accessApi.updateCustomRole(role.id, { label: label.trim(), description, scopeLevel, permissions: perms });
      else await accessApi.createCustomRole({ label: label.trim(), description, scopeLevel, permissions: perms });
      toast.success('Saved');
      onSaved();
    } catch (e) { toast.error(extractApiErrorMessage(e, 'Could not save')); }
    finally { setSaving(false); }
  };

  return (
    <Drawer open onClose={onClose} title={role ? 'Edit custom role' : 'New custom role'} width="lg"
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium disabled:opacity-50 inline-flex items-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. TA Lead" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
          <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Scope level</label>
          <select value={scopeLevel} onChange={(e) => setScopeLevel(e.target.value as any)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500">
            <option value="org">Organization-wide</option>
            <option value="program">Per program</option>
            <option value="clan">Per clan</option>
            <option value="self">Self only</option>
          </select>
          <p className="mt-1 text-xs text-slate-500">Where this role is granted. It applies to that scope and everything beneath it.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Permissions</label>
          <div className="space-y-4">
            {PERMISSION_GROUPS.map((g) => (
              <div key={g.label}>
                <p className="text-xs font-medium text-slate-500 mb-1.5">{g.label}</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {g.perms.map((p) => (
                    <label key={p} className="flex items-center gap-2 text-sm text-slate-700 rounded-lg px-2 py-1 hover:bg-slate-50 cursor-pointer">
                      <input type="checkbox" checked={perms.includes(p)} onChange={() => toggle(p)} className="accent-brand-600" />
                      <span className="capitalize">{prettyPerm(p)}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Drawer>
  );
}
