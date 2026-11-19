'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, BookOpen, Cable, CheckCircle2, Copy, Download, Eye, KeyRound, Loader2, Plus, RefreshCw, Send, Trash2, Wand2, Webhook, XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Drawer } from '@/components/shared/Drawer';
import { useConfirm } from '@/lib/context/ConfirmContext';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { cohortApi } from '@/lib/services/intake-api';
import {
  integrationsApi, type ApiKeyInfo, type FieldMapping, type IntegrationMeta, type MappingRule, type PreviewRow,
  type SyncConnection, type SyncRun, type WebhookDelivery, type WebhookEndpoint,
} from '@/lib/services/integrations-api';

/**
 * Settings → Integrations: what another system needs to bring people into an
 * intake — an API key, a connection (how its field names map to ours), and the
 * history of every sync with what happened to each record.
 * Docs for developers: https://pathment.me/docs
 */

const DOCS = 'https://pathment.me/docs';
const field = 'w-full bg-background border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-slate-700';
const ghostBtn = 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 text-xs font-medium hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-white/5';
const primaryBtn = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50';
const card = 'rounded-2xl border border-slate-200 bg-card dark:border-slate-700';

const FIELD_LABEL: Record<string, string> = {
  email: 'Email', firstName: 'First name', lastName: 'Last name', phone: 'Phone', level: 'Level', country: 'Country', externalId: 'Their ID',
};
const FIELD_HINT: Record<string, string> = {
  email: 'Required. How a person is matched when there is no ID.',
  externalId: 'Strongly recommended: how a later sync finds the same person.',
  level: 'Must be one of the intake’s levels — use the value map to translate.',
};
const TRANSFORM_LABEL: Record<string, string> = {
  trim: 'As is', lowercase: 'lowercase', uppercase: 'UPPERCASE', titlecase: 'Title Case',
  first_name: 'First word (first name)', last_name: 'The rest (last name)', digits: 'Digits only (phones)', date: 'Date (YYYY-MM-DD)',
};

const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');

async function copy(text: string, what = 'Copied') {
  try { await navigator.clipboard.writeText(text); toast.success(what); } catch { toast.error('Could not copy — select it and copy by hand'); }
}

type Section = 'keys' | 'connections' | 'history' | 'webhooks';

export default function IntegrationsTab() {
  const [section, setSection] = useState<Section>('keys');
  const [meta, setMeta] = useState<IntegrationMeta | null>(null);
  useEffect(() => { integrationsApi.meta().then(setMeta).catch(() => setMeta(null)); }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-slate-900 flex items-center gap-2"><Cable className="w-5 h-5 text-brand-600" /> Integrations</h2>
          <p className="text-slate-500 text-sm mt-0.5 max-w-2xl">
            Bring people into an intake from your other systems. A system sends its records with an API key; a connection
            says how its field names match ours; every sync is recorded below with what happened to each record.
          </p>
        </div>
        <a href={DOCS} target="_blank" rel="noreferrer" className={ghostBtn}><BookOpen className="w-3.5 h-3.5" />Developer docs</a>
      </div>

      {meta && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-white/5">
          <span className="font-medium">API base URL</span>
          <code className="rounded bg-white px-1.5 py-0.5 font-mono dark:bg-slate-900">{meta.baseUrl}</code>
          <button onClick={() => void copy(meta.baseUrl, 'Base URL copied')} className="text-brand-700 hover:underline">Copy</button>
        </div>
      )}

      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
        {([['keys', 'API keys'], ['connections', 'Connections'], ['history', 'Sync history'], ['webhooks', 'Webhooks']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setSection(id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${section === id ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            {label}
          </button>
        ))}
      </div>

      {section === 'keys' && <ApiKeysSection meta={meta} />}
      {section === 'connections' && <ConnectionsSection meta={meta} onRan={() => setSection('history')} />}
      {section === 'history' && <HistorySection />}
      {section === 'webhooks' && <WebhooksSection meta={meta} />}
    </div>
  );
}

// ── API keys ──────────────────────────────────────────────────────────────────
function ApiKeysSection({ meta }: { meta: IntegrationMeta | null }) {
  const confirm = useConfirm();
  const [keys, setKeys] = useState<ApiKeyInfo[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [revealed, setRevealed] = useState<{ key: string; name: string } | null>(null);
  const load = useCallback(() => integrationsApi.listKeys().then(setKeys).catch((e) => { toast.error(extractApiErrorMessage(e, 'Could not load API keys')); setKeys([]); }), []);
  useEffect(() => { void load(); }, [load]);

  const revoke = async (k: ApiKeyInfo) => {
    if (!(await confirm({
      title: `Revoke “${k.name}”?`,
      description: 'Anything using this key stops working straight away. This cannot be undone — create a new key if you need one.',
      confirmLabel: 'Revoke key', variant: 'danger',
    }))) return;
    try { await integrationsApi.revokeKey(k.id); toast.success('Key revoked'); void load(); }
    catch (e) { toast.error(extractApiErrorMessage(e, 'Could not revoke the key')); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">One key per system that connects, so you can revoke one without breaking the others.</p>
        <button onClick={() => setCreating(true)} className={primaryBtn}><Plus className="w-4 h-4" />Create API key</button>
      </div>
      {keys === null ? <Spinner /> : keys.length === 0 ? (
        <Empty icon={<KeyRound className="w-9 h-9 text-slate-300" />} title="No API keys yet" body="Create one for the system that will send people to Pathment." />
      ) : (
        <div className={`${card} divide-y divide-slate-100 dark:divide-slate-800`}>
          {keys.map((k) => (
            <div key={k.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900">{k.name}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                  <code className="font-mono">{k.prefix}••••••••</code>
                  <span>Created {when(k.createdAt)}</span>
                  <span>{k.lastUsedAt ? `Last used ${when(k.lastUsedAt)}` : 'Never used'}</span>
                  {k.expiresAt && <span>Expires {when(k.expiresAt)}</span>}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {k.scopes.map((s) => <span key={s} className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-600 dark:bg-white/10">{s}</span>)}
                </div>
              </div>
              <StatusPill status={k.status} />
              {k.status === 'active' && <button onClick={() => void revoke(k)} className={`${ghostBtn} hover:text-rose-700`}>Revoke</button>}
            </div>
          ))}
        </div>
      )}

      {creating && (
        <CreateKeyDrawer meta={meta} onClose={() => setCreating(false)}
          onCreated={(key, name) => { setCreating(false); setRevealed({ key, name }); void load(); }} />
      )}
      {revealed && (
        <Drawer open onClose={() => setRevealed(null)} title="Copy your API key" subtitle={revealed.name} width="md"
          footer={<button onClick={() => setRevealed(null)} className={primaryBtn}>I&apos;ve copied it</button>}>
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>This is the only time the whole key is shown. Store it in your other system&apos;s secrets now — Pathment keeps only a fingerprint of it.</span>
            </div>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-sm dark:border-slate-700 dark:bg-slate-900">{revealed.key}</code>
              <button onClick={() => void copy(revealed.key, 'Key copied')} className={ghostBtn}><Copy className="h-3.5 w-3.5" />Copy</button>
            </div>
            <p className="text-xs text-slate-500">Send it as <code className="font-mono">Authorization: Bearer {revealed.key.slice(0, 12)}…</code> — see the <a href={`${DOCS}/authentication`} target="_blank" rel="noreferrer" className="text-brand-700 underline">authentication guide</a>.</p>
          </div>
        </Drawer>
      )}
    </div>
  );
}

function CreateKeyDrawer({ meta, onClose, onCreated }: { meta: IntegrationMeta | null; onClose: () => void; onCreated: (key: string, name: string) => void }) {
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>(['intakes:read', 'applicants:write']);
  const [expires, setExpires] = useState('');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      const { key, apiKey } = await integrationsApi.createKey({ name: name.trim(), scopes, expiresAt: expires ? new Date(`${expires}T23:59:59`).toISOString() : null });
      onCreated(key, apiKey.name);
    } catch (e) { toast.error(extractApiErrorMessage(e, 'Could not create the key')); } finally { setSaving(false); }
  };
  return (
    <Drawer open onClose={onClose} title="Create an API key" subtitle="For one system that connects to this workspace" width="md"
      footer={<>
        <button onClick={onClose} className={ghostBtn}>Cancel</button>
        <button onClick={() => void save()} disabled={saving || !name.trim() || !scopes.length} className={primaryBtn}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}Create key
        </button>
      </>}>
      <div className="space-y-5">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Name</span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. HubSpot sync, Admissions portal" maxLength={100} className={field} />
          <span className="mt-1 block text-xs text-slate-500">What uses it, so you know which one to revoke later.</span>
        </label>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-slate-700">What it can do</legend>
          <div className="space-y-2">
            {(meta?.scopes || []).map((s) => (
              <label key={s.key} className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 p-2.5 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-white/5">
                <input type="checkbox" checked={scopes.includes(s.key)} onChange={(e) => setScopes((p) => (e.target.checked ? [...p, s.key] : p.filter((x) => x !== s.key)))} className="mt-0.5 accent-brand-600" />
                <span><code className="font-mono text-xs text-slate-800">{s.key}</code><span className="block text-xs text-slate-500">{s.description}</span></span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Expires <span className="font-normal text-slate-400">(optional)</span></span>
          <input type="date" value={expires} min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)} onChange={(e) => setExpires(e.target.value)} className={field} />
        </label>
      </div>
    </Drawer>
  );
}

// ── Connections ─────────────────────────────────────────────────────────────────
function ConnectionsSection({ meta, onRan }: { meta: IntegrationMeta | null; onRan: () => void }) {
  const confirm = useConfirm();
  const [list, setList] = useState<SyncConnection[] | null>(null);
  const [editing, setEditing] = useState<SyncConnection | 'new' | null>(null);
  const [running, setRunning] = useState<SyncConnection | null>(null);
  const [intakes, setIntakes] = useState<{ id: string; name: string }[]>([]);
  const load = useCallback(() => integrationsApi.listConnections().then(setList).catch((e) => { toast.error(extractApiErrorMessage(e, 'Could not load connections')); setList([]); }), []);
  useEffect(() => {
    void load();
    cohortApi.list().then((r: { data?: { cohorts?: { id: string; name: string }[] } }) => setIntakes((r.data?.cohorts || []).map((c) => ({ id: c.id, name: c.name })))).catch(() => setIntakes([]));
  }, [load]);

  const remove = async (c: SyncConnection) => {
    if (!(await confirm({ title: `Remove “${c.name}”?`, description: 'Syncs that name this connection will be refused. People already synced stay where they are.', confirmLabel: 'Remove', variant: 'danger' }))) return;
    try { await integrationsApi.removeConnection(c.id); toast.success('Connection removed'); void load(); }
    catch (e) { toast.error(extractApiErrorMessage(e, 'Could not remove it')); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500 max-w-2xl">A connection tells Pathment how another system names its fields — <em>email_address</em>, <em>full_name</em>, <em>track</em> — so its records arrive as applicants without anyone renaming columns.</p>
        <button onClick={() => setEditing('new')} className={primaryBtn}><Plus className="w-4 h-4" />New connection</button>
      </div>
      {list === null ? <Spinner /> : list.length === 0 ? (
        <Empty icon={<Cable className="w-9 h-9 text-slate-300" />} title="No connections yet" body="Without one, a system must send Pathment's own field names (email, firstName, …). Add one to map theirs." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.map((c) => (
            <div key={c.id} className={`${card} p-4`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">{c.name}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{c.cohort ? `Default intake: ${c.cohort.name}` : 'No default intake'} · {c.afterSync === 'send_assessment' ? 'Sends the assessment to new people' : 'Adds people only'}</p>
                </div>
                <button onClick={() => void remove(c)} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label={`Remove ${c.name}`}><Trash2 className="h-4 w-4" /></button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {Object.entries(c.mapping?.fields || {}).map(([k, r]) => (
                  <span key={k} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 dark:bg-white/10">{FIELD_LABEL[k] || k} ← <span className="font-mono">{r.from || `"${r.default}"`}</span></span>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button onClick={() => setEditing(c)} className={ghostBtn}>Edit mapping</button>
                <button onClick={() => setRunning(c)} className={ghostBtn}>Try a sync</button>
                <button onClick={() => void copy(c.id, 'Connection ID copied')} className={`${ghostBtn} font-mono`} title="Send this as `connection` in the API"><Copy className="h-3 w-3" />{c.id.slice(0, 8)}…</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <ConnectionDrawer meta={meta} intakes={intakes} connection={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />
      )}
      {running && <RunDrawer connection={running} intakes={intakes} onClose={() => setRunning(null)} onQueued={() => { setRunning(null); onRan(); }} />}
    </div>
  );
}

const SAMPLE_HINT = `{
  "id": "u_93",
  "full_name": "Ada Lovelace",
  "email_address": "ada@example.com",
  "mobile": "+44 20 7946 0000",
  "track": "Advanced"
}`;

function ConnectionDrawer({ meta, intakes, connection, onClose, onSaved }: {
  meta: IntegrationMeta | null; intakes: { id: string; name: string }[]; connection: SyncConnection | null; onClose: () => void; onSaved: () => void;
}) {
  const fields = meta?.fields || ['email', 'firstName', 'lastName', 'phone', 'level', 'country', 'externalId'];
  const [name, setName] = useState(connection?.name || '');
  const [cohortId, setCohortId] = useState(connection?.cohortId || '');
  const [afterSync, setAfterSync] = useState<'none' | 'send_assessment'>(connection?.afterSync || 'none');
  const [rules, setRules] = useState<Record<string, MappingRule>>(connection?.mapping?.fields || {});
  const [keepUnmapped, setKeepUnmapped] = useState(connection?.mapping?.keepUnmapped !== false);
  const [sample, setSample] = useState('');
  const [preview, setPreview] = useState<{ problems: string[]; rows: PreviewRow[] } | null>(null);
  const [busy, setBusy] = useState<'suggest' | 'preview' | 'save' | null>(null);

  const mapping: FieldMapping = useMemo(() => ({
    fields: Object.fromEntries(Object.entries(rules).filter(([, r]) => r && (r.from?.trim() || r.default?.trim())).map(([k, r]) => [k, {
      ...(r.from?.trim() ? { from: r.from.trim() } : {}),
      ...(r.transform && r.transform !== 'trim' ? { transform: r.transform } : {}),
      ...(r.map && Object.keys(r.map).length ? { map: r.map } : {}),
      ...(r.default?.trim() ? { default: r.default.trim() } : {}),
    }])),
    keepUnmapped,
  }), [rules, keepUnmapped]);

  const samples = (): unknown[] | null => {
    if (!sample.trim()) return null;
    try { const v = JSON.parse(sample); return Array.isArray(v) ? v : [v]; } catch { toast.error('The sample is not valid JSON'); return null; }
  };

  const suggest = async () => {
    const s = samples(); if (!s) return;
    setBusy('suggest');
    try {
      const m = await integrationsApi.suggest(s[0]);
      setRules((prev) => ({ ...m.fields, ...Object.fromEntries(Object.entries(prev).filter(([, r]) => r.from || r.default)) }));
      toast.success(`Matched ${Object.keys(m.fields).length} field${Object.keys(m.fields).length === 1 ? '' : 's'} — check them below`);
    } catch (e) { toast.error(extractApiErrorMessage(e, 'Could not suggest a mapping')); } finally { setBusy(null); }
  };

  const runPreview = async () => {
    const s = samples(); if (!s) return;
    setBusy('preview');
    try { setPreview(await integrationsApi.preview(mapping, s.slice(0, 5))); }
    catch (e) { toast.error(extractApiErrorMessage(e, 'Could not preview')); } finally { setBusy(null); }
  };

  const save = async () => {
    setBusy('save');
    try {
      const body = { name: name.trim(), cohortId: cohortId || null, afterSync, mapping };
      if (connection) await integrationsApi.updateConnection(connection.id, body);
      else await integrationsApi.createConnection(body);
      toast.success(connection ? 'Connection saved' : 'Connection created');
      onSaved();
    } catch (e) { toast.error(extractApiErrorMessage(e, 'Could not save')); } finally { setBusy(null); }
  };

  const setRule = (k: string, patch: Partial<MappingRule>) => setRules((p) => ({ ...p, [k]: { ...(p[k] || {}), ...patch } }));

  return (
    <Drawer open onClose={onClose} width="xl" title={connection ? `Edit “${connection.name}”` : 'New connection'} subtitle="How another system's fields become Pathment applicants"
      footer={<>
        <button onClick={onClose} className={ghostBtn}>Cancel</button>
        <button onClick={() => void save()} disabled={busy !== null || !name.trim() || !mapping.fields.email} className={primaryBtn}>
          {busy === 'save' && <Loader2 className="h-4 w-4 animate-spin" />}{connection ? 'Save' : 'Create connection'}
        </button>
      </>}>
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Applications CRM" className={field} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Default intake <span className="font-normal text-slate-400">(for “Try a sync”)</span></span>
            <select value={cohortId} onChange={(e) => setCohortId(e.target.value)} className={field}>
              <option value="">None</option>
              {intakes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        </div>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-slate-700">After each sync</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {([['none', 'Add people only', 'They wait at “Added” until you send the assessment.'], ['send_assessment', 'Send the assessment', 'Each new person gets the assessment for their level by email.']] as const).map(([v, label, hint]) => (
              <button key={v} type="button" onClick={() => setAfterSync(v)}
                className={`rounded-lg border p-2.5 text-left ${afterSync === v ? 'border-brand-400 bg-brand-50 dark:bg-brand-500/10' : 'border-slate-200 hover:border-slate-300 dark:border-slate-700'}`}>
                <span className="block text-sm font-medium text-slate-800">{label}</span>
                <span className="mt-0.5 block text-[11px] text-slate-500">{hint}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-slate-700">A sample record from their system</span>
            <div className="flex gap-2">
              <button onClick={() => void suggest()} disabled={busy !== null || !sample.trim()} className={ghostBtn}>{busy === 'suggest' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}Suggest mapping</button>
              <button onClick={() => void runPreview()} disabled={busy !== null || !sample.trim()} className={ghostBtn}>{busy === 'preview' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Preview</button>
            </div>
          </div>
          <textarea value={sample} onChange={(e) => setSample(e.target.value)} rows={6} placeholder={SAMPLE_HINT} spellCheck={false} className={`${field} font-mono text-xs`} />
          <p className="mt-1 text-xs text-slate-500">Paste one record (or an array). It stays in your browser except for the preview — nothing is imported.</p>
        </div>

        <div className={`${card} overflow-hidden`}>
          <div className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_minmax(0,10rem)] gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-white/5">
            <span>Pathment field</span><span>Their field (path)</span><span>Tidy it</span>
          </div>
          {fields.map((k) => {
            const r = rules[k] || {};
            return (
              <div key={k} className="border-b border-slate-100 px-3 py-2.5 last:border-0 dark:border-slate-800">
                <div className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_minmax(0,10rem)] items-center gap-2">
                  <span className="text-sm text-slate-800">{FIELD_LABEL[k] || k}{k === 'email' && <span className="text-rose-500"> *</span>}</span>
                  <input value={r.from || ''} onChange={(e) => setRule(k, { from: e.target.value })} placeholder={k === 'email' ? 'email_address' : k === 'externalId' ? 'id' : '—'} className={`${field} py-1.5 font-mono text-xs`} />
                  <select value={r.transform || 'trim'} onChange={(e) => setRule(k, { transform: e.target.value })} className={`${field} py-1.5 text-xs`}>
                    {(meta?.transforms || Object.keys(TRANSFORM_LABEL)).map((t) => <option key={t} value={t}>{TRANSFORM_LABEL[t] || t}</option>)}
                  </select>
                </div>
                {FIELD_HINT[k] && <p className="mt-1 text-[11px] text-slate-400">{FIELD_HINT[k]}</p>}
                {k === 'level' && (
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <textarea rows={2} value={Object.entries(r.map || {}).map(([a, b]) => `${a} = ${b}`).join('\n')} spellCheck={false}
                      onChange={(e) => setRule(k, { map: Object.fromEntries(e.target.value.split('\n').map((l) => l.split('=').map((x) => x.trim())).filter(([a, b]) => a && b)) })}
                      placeholder={'Their value = our level key\nAdvanced = senior'} className={`${field} font-mono text-xs`} />
                    <input value={r.default || ''} onChange={(e) => setRule(k, { default: e.target.value })} placeholder="Default when unmatched, e.g. beginner" className={`${field} text-xs`} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={keepUnmapped} onChange={(e) => setKeepUnmapped(e.target.checked)} className="mt-0.5 accent-brand-600" />
          <span>Keep every other field as an answer <span className="block text-xs text-slate-500">Reviewers see them on the applicant; nothing they send is lost.</span></span>
        </label>

        {preview && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700">Preview</p>
            {preview.problems.length > 0 && <p className="rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{preview.problems.join(' · ')}</p>}
            {preview.rows.map((row, i) => (
              <div key={i} className={`${card} p-3 text-xs`}>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {Object.entries(row.values).map(([k, v]) => <span key={k}><span className="text-slate-400">{FIELD_LABEL[k] || k}:</span> <span className="font-medium text-slate-800">{v}</span></span>)}
                </div>
                {Object.keys(row.responses).length > 0 && <p className="mt-1 text-slate-500">Kept as answers: {Object.keys(row.responses).join(', ')}</p>}
                {row.errors.map((e) => <p key={e.code} className="mt-1 inline-flex items-center gap-1 text-rose-600"><XCircle className="h-3.5 w-3.5" />{e.message}</p>)}
                {!row.errors.length && <p className="mt-1 inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" />Ready</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </Drawer>
  );
}

function RunDrawer({ connection, intakes, onClose, onQueued }: { connection: SyncConnection; intakes: { id: string; name: string }[]; onClose: () => void; onQueued: () => void }) {
  const [cohortId, setCohortId] = useState(connection.cohortId || '');
  const [records, setRecords] = useState('');
  const [dryRun, setDryRun] = useState(true);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    let parsed: unknown;
    try { parsed = JSON.parse(records); } catch { toast.error('The records are not valid JSON'); return; }
    const list = Array.isArray(parsed) ? parsed : [parsed];
    setBusy(true);
    try {
      await integrationsApi.startRun({ cohortId, connectionId: connection.id, records: list, dryRun });
      toast.success(dryRun ? 'Dry run queued — nothing will be written' : `Sync of ${list.length} record${list.length === 1 ? '' : 's'} queued`);
      onQueued();
    } catch (e) { toast.error(extractApiErrorMessage(e, 'Could not start the sync')); } finally { setBusy(false); }
  };
  return (
    <Drawer open onClose={onClose} width="lg" title={`Try a sync — ${connection.name}`} subtitle="Paste records exported from their system"
      footer={<>
        <button onClick={onClose} className={ghostBtn}>Cancel</button>
        <button onClick={() => void run()} disabled={busy || !cohortId || !records.trim()} className={primaryBtn}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{dryRun ? 'Run a dry run' : 'Sync now'}</button>
      </>}>
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Into intake</span>
          <select value={cohortId} onChange={(e) => setCohortId(e.target.value)} className={field}>
            <option value="">Choose an intake</option>
            {intakes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <textarea value={records} onChange={(e) => setRecords(e.target.value)} rows={12} spellCheck={false} placeholder={`[\n${SAMPLE_HINT}\n]`} className={`${field} font-mono text-xs`} />
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} className="mt-0.5 accent-brand-600" />
          <span>Dry run <span className="block text-xs text-slate-500">Check the mapping and matching and see the report — without adding anyone or sending anything.</span></span>
        </label>
      </div>
    </Drawer>
  );
}

// ── History ─────────────────────────────────────────────────────────────────────
function HistorySection() {
  const [runs, setRuns] = useState<SyncRun[] | null>(null);
  const [open, setOpen] = useState<SyncRun | null>(null);
  const load = useCallback(() => integrationsApi.listRuns().then(setRuns).catch((e) => { toast.error(extractApiErrorMessage(e, 'Could not load the history')); setRuns([]); }), []);
  useEffect(() => { void load(); }, [load]);
  // Keep it live while anything is still waiting or running.
  useEffect(() => {
    if (!runs?.some((r) => r.status === 'queued' || r.status === 'running')) return;
    const id = setInterval(() => void load(), 3000);
    return () => clearInterval(id);
  }, [runs, load]);

  const downloadErrors = async (r: SyncRun) => {
    try {
      const csv = await integrationsApi.errorsCsv(r.id);
      const url = URL.createObjectURL(new Blob([typeof csv === 'string' ? csv : String(csv)], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url; a.download = `sync-${r.id.slice(0, 8)}-errors.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { toast.error(extractApiErrorMessage(e, 'Could not download')); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">Every sync — from the API or from here — and what happened to each record.</p>
        <button onClick={() => void load()} className={ghostBtn}><RefreshCw className="h-3.5 w-3.5" />Refresh</button>
      </div>
      {runs === null ? <Spinner /> : runs.length === 0 ? (
        <Empty icon={<RefreshCw className="w-9 h-9 text-slate-300" />} title="No syncs yet" body="When a system sends people, or you try a sync, it shows here." />
      ) : (
        <div className={`${card} divide-y divide-slate-100 dark:divide-slate-800`}>
          {runs.map((r) => (
            <button key={r.id} onClick={() => setOpen(r)} className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-white/5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900">
                  {r.intakeName || 'Intake'}{r.dryRun && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-normal text-slate-600 dark:bg-white/10">Dry run</span>}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {when(r.createdAt)} · {r.source === 'app' ? 'From the app' : r.apiKey ? `API key “${r.apiKey.name}”` : 'API'}{r.connectionName ? ` · ${r.connectionName}` : ''}
                </p>
              </div>
              <Counts run={r} />
              <StatusPill status={r.status} />
            </button>
          ))}
        </div>
      )}

      {open && (
        <Drawer open onClose={() => setOpen(null)} width="lg" title={`${open.dryRun ? 'Dry run' : 'Sync'} · ${open.intakeName || ''}`} subtitle={when(open.createdAt)}
          footer={open.errors.length ? <button onClick={() => void downloadErrors(open)} className={ghostBtn}><Download className="h-3.5 w-3.5" />Download errors (CSV)</button> : undefined}>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3"><StatusPill status={open.status} /><Counts run={open} /></div>
            {open.assessmentsSent > 0 && <p className="text-sm text-slate-600">Assessment sent to {open.assessmentsSent} new {open.assessmentsSent === 1 ? 'person' : 'people'}.</p>}
            {open.message && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{open.message}</p>}
            {open.errors.length === 0 ? (
              <p className="inline-flex items-center gap-1.5 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" />Every record went through.</p>
            ) : (
              <div className={`${card} divide-y divide-slate-100 text-sm dark:divide-slate-800`}>
                {open.errors.map((e, i) => (
                  <div key={i} className="px-3 py-2">
                    <p className="text-slate-800">Record {e.index + 1}{e.email ? ` · ${e.email}` : ''}{e.externalId ? ` · ${e.externalId}` : ''}</p>
                    <p className="text-xs text-slate-500"><code className="font-mono">{e.code}</code> — {e.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Drawer>
      )}
    </div>
  );
}

function Counts({ run }: { run: SyncRun }) {
  const c = run.counts;
  const parts: [string, number, string][] = [
    ['added', c.created, 'text-emerald-700'], ['updated', c.updated, 'text-brand-700'], ['unchanged', c.unchanged, 'text-slate-500'],
    ['skipped', c.skipped, 'text-amber-700'], ['failed', c.failed, 'text-rose-700'],
  ];
  if (run.status === 'queued' || run.status === 'running') return <span className="text-xs text-slate-500">{run.total} record{run.total === 1 ? '' : 's'}</span>;
  return (
    <span className="flex flex-wrap gap-x-2.5 text-xs">
      {parts.filter(([, n]) => n > 0).map(([label, n, cls]) => <span key={label} className={cls}>{n} {label}</span>)}
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: 'bg-emerald-50 text-emerald-700', succeeded: 'bg-emerald-50 text-emerald-700',
    queued: 'bg-slate-100 text-slate-600', running: 'bg-brand-50 text-brand-700',
    partial: 'bg-amber-50 text-amber-700', expired: 'bg-amber-50 text-amber-700',
    failed: 'bg-rose-50 text-rose-700', revoked: 'bg-slate-100 text-slate-500',
    enabled: 'bg-emerald-50 text-emerald-700', disabled: 'bg-slate-100 text-slate-500',
    pending: 'bg-slate-100 text-slate-600', retrying: 'bg-amber-50 text-amber-700',
  };
  const label: Record<string, string> = {
    enabled: 'On', disabled: 'Off', pending: 'Waiting', retrying: 'Retrying', succeeded: 'Done', partial: 'Done with errors', running: 'Running', queued: 'Queued', failed: 'Failed', active: 'Active', revoked: 'Revoked', expired: 'Expired' };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${map[status] || 'bg-slate-100 text-slate-600'}`}>
      {status === 'running' && <Loader2 className="h-3 w-3 animate-spin" />}{label[status] || status}
    </span>
  );
}

// ── Webhooks ────────────────────────────────────────────────────────────────────
function WebhooksSection({ meta }: { meta: IntegrationMeta | null }) {
  const confirm = useConfirm();
  const [list, setList] = useState<WebhookEndpoint[] | null>(null);
  const [editing, setEditing] = useState<WebhookEndpoint | 'new' | null>(null);
  const [secret, setSecret] = useState<{ secret: string; url: string; fresh: boolean } | null>(null);
  const [open, setOpen] = useState<WebhookEndpoint | null>(null);
  const load = useCallback(() => integrationsApi.listWebhooks().then(setList).catch((e) => { toast.error(extractApiErrorMessage(e, 'Could not load webhooks')); setList([]); }), []);
  useEffect(() => { void load(); }, [load]);

  const toggle = async (w: WebhookEndpoint) => {
    try {
      await integrationsApi.updateWebhook(w.id, { status: w.status === 'enabled' ? 'disabled' : 'enabled' });
      toast.success(w.status === 'enabled' ? 'Turned off — nothing more is sent to it' : 'Turned on');
      void load();
    } catch (e) { toast.error(extractApiErrorMessage(e, 'Could not change it')); }
  };
  const remove = async (w: WebhookEndpoint) => {
    if (!(await confirm({
      title: 'Delete this endpoint?',
      description: `${w.url} stops getting events, and its delivery log goes with it. This cannot be undone.`,
      confirmLabel: 'Delete endpoint', variant: 'danger',
    }))) return;
    try { await integrationsApi.removeWebhook(w.id); toast.success('Endpoint deleted'); void load(); }
    catch (e) { toast.error(extractApiErrorMessage(e, 'Could not delete it')); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          Pathment tells your systems when something happens — an applicant is accepted, a mentee finishes a roadmap — with a signed POST to the URL you give.{' '}
          <a href={`${DOCS}/guides/webhooks`} target="_blank" rel="noreferrer" className="text-brand-700 underline">How to receive them</a>
        </p>
        <button onClick={() => setEditing('new')} className={`${primaryBtn} shrink-0`}><Plus className="w-4 h-4" />Add endpoint</button>
      </div>
      {list === null ? <Spinner /> : list.length === 0 ? (
        <Empty icon={<Webhook className="w-9 h-9 text-slate-300" />} title="No endpoints yet" body="Add the URL of the system that should hear about applicants, mentees and syncs." />
      ) : (
        <div className={`${card} divide-y divide-slate-100 dark:divide-slate-800`}>
          {list.map((w) => (
            <div key={w.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <button onClick={() => setOpen(w)} className="min-w-0 flex-1 text-left">
                <p className="truncate font-mono text-sm text-slate-900">{w.url}</p>
                <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                  {w.description && <span>{w.description}</span>}
                  <span>{w.events.length} event{w.events.length === 1 ? '' : 's'}</span>
                  <span>{w.lastSuccessAt ? `Last delivered ${when(w.lastSuccessAt)}` : 'Nothing delivered yet'}</span>
                  {w.consecutiveFailures > 0 && <span className="text-amber-700">{w.consecutiveFailures} failed in a row</span>}
                </p>
                {w.status === 'disabled' && w.disabledReason && <p className="mt-1 text-xs text-rose-700">{w.disabledReason}</p>}
              </button>
              <StatusPill status={w.status} />
              <button onClick={() => setOpen(w)} className={ghostBtn}>Deliveries</button>
              <button onClick={() => setEditing(w)} className={ghostBtn}>Edit</button>
              <button onClick={() => void toggle(w)} className={ghostBtn}>{w.status === 'enabled' ? 'Turn off' : 'Turn on'}</button>
              <button onClick={() => void remove(w)} className={`${ghostBtn} hover:text-rose-700`} aria-label="Delete endpoint"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <WebhookDrawer meta={meta} endpoint={editing === 'new' ? null : editing} onClose={() => setEditing(null)}
          onSaved={(created) => { setEditing(null); if (created) setSecret({ ...created, fresh: true }); void load(); }} />
      )}
      {open && (
        <DeliveriesDrawer endpoint={open} onClose={() => { setOpen(null); void load(); }}
          onSecret={(s) => setSecret({ secret: s, url: open.url, fresh: false })} />
      )}
      {secret && (
        <Drawer open onClose={() => setSecret(null)} title="Signing secret" subtitle={secret.url} width="md"
          footer={<button onClick={() => setSecret(null)} className={primaryBtn}>Done</button>}>
          <div className="space-y-4">
            {secret.fresh && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Put this in your receiver now. It proves each request really came from Pathment. You can show it again later from the endpoint&apos;s deliveries.</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-sm dark:border-slate-700 dark:bg-slate-900">{secret.secret}</code>
              <button onClick={() => void copy(secret.secret, 'Secret copied')} className={ghostBtn}><Copy className="h-3.5 w-3.5" />Copy</button>
            </div>
            <p className="text-xs text-slate-500">
              Each request carries a <code className="font-mono">Pathment-Signature</code> header — see{' '}
              <a href={`${DOCS}/guides/webhooks`} target="_blank" rel="noreferrer" className="text-brand-700 underline">verifying signatures</a>.
            </p>
          </div>
        </Drawer>
      )}
    </div>
  );
}

function WebhookDrawer({ meta, endpoint, onClose, onSaved }: {
  meta: IntegrationMeta | null; endpoint: WebhookEndpoint | null; onClose: () => void;
  onSaved: (created: { secret: string; url: string } | null) => void;
}) {
  const events = useMemo(() => meta?.webhookEvents || [], [meta]);
  const [url, setUrl] = useState(endpoint?.url || '');
  const [description, setDescription] = useState(endpoint?.description || '');
  const [chosen, setChosen] = useState<string[]>(endpoint?.events || []);
  const [saving, setSaving] = useState(false);
  const all = events.length > 0 && chosen.length === events.length;
  const groups = useMemo(() => {
    const out: Record<string, { key: string; description: string }[]> = {};
    for (const e of events) (out[e.key.split('.')[0]] ||= []).push(e);
    return Object.entries(out);
  }, [events]);

  const save = async () => {
    setSaving(true);
    try {
      if (endpoint) {
        await integrationsApi.updateWebhook(endpoint.id, { url: url.trim(), description: description.trim() || null, events: chosen });
        toast.success('Endpoint saved');
        onSaved(null);
      } else {
        const out = await integrationsApi.createWebhook({ url: url.trim(), description: description.trim() || undefined, events: chosen });
        toast.success('Endpoint added');
        onSaved({ secret: out.secret, url: out.endpoint.url });
      }
    } catch (e) { toast.error(extractApiErrorMessage(e, 'Could not save the endpoint')); }
    finally { setSaving(false); }
  };

  return (
    <Drawer open onClose={onClose} width="md" title={endpoint ? 'Edit endpoint' : 'Add a webhook endpoint'}
      footer={(
        <button onClick={() => void save()} disabled={saving || !url.trim() || !chosen.length} className={primaryBtn}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}{endpoint ? 'Save' : 'Add endpoint'}
        </button>
      )}>
      <div className="space-y-5">
        <label className="block">
          <span className="text-sm font-medium text-slate-800">URL</span>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://your-system.example.com/pathment/webhooks" className={`${field} mt-1 font-mono`} />
          <span className="mt-1 block text-xs text-slate-500">Must be https and reachable from the internet. Answer with any 2xx within 10 seconds.</span>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-800">Description <span className="font-normal text-slate-400">(optional)</span></span>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. CRM — admissions" className={`${field} mt-1`} maxLength={200} />
        </label>
        <div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-800">Events to send</span>
            <button onClick={() => setChosen(all ? [] : events.map((e) => e.key))} className="text-xs text-brand-700 hover:underline">{all ? 'Clear all' : 'Select all'}</button>
          </div>
          <div className="mt-2 space-y-3">
            {groups.map(([group, items]) => (
              <div key={group}>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{group}</p>
                <div className="space-y-1">
                  {items.map((e) => (
                    <label key={e.key} className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-white/5">
                      <input type="checkbox" className="mt-0.5" checked={chosen.includes(e.key)}
                        onChange={(ev) => setChosen((c) => (ev.target.checked ? [...c, e.key] : c.filter((k) => k !== e.key)))} />
                      <span>
                        <code className="font-mono text-xs text-slate-800">{e.key}</code>
                        <span className="block text-xs text-slate-500">{e.description}</span>
                      </span>
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

function DeliveriesDrawer({ endpoint, onClose, onSecret }: { endpoint: WebhookEndpoint; onClose: () => void; onSecret: (s: string) => void }) {
  const confirm = useConfirm();
  const [rows, setRows] = useState<WebhookDelivery[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(
    () => integrationsApi.listDeliveries(endpoint.id).then(setRows).catch((e) => { toast.error(extractApiErrorMessage(e, 'Could not load deliveries')); setRows([]); }),
    [endpoint.id],
  );
  useEffect(() => { void load(); }, [load]);
  // Keep it live while something is about to be sent.
  useEffect(() => {
    if (!rows?.some((r) => r.status === 'pending')) return;
    const id = setInterval(() => void load(), 3000);
    return () => clearInterval(id);
  }, [rows, load]);

  const ping = async () => {
    setBusy('ping');
    try {
      const d = await integrationsApi.pingWebhook(endpoint.id);
      if (d.status === 'succeeded') toast.success(`Test event delivered — HTTP ${d.lastStatusCode}`);
      else toast.error(`Test event failed — ${d.lastError || `HTTP ${d.lastStatusCode}`}`);
      void load();
    } catch (e) { toast.error(extractApiErrorMessage(e, 'Could not send the test event')); }
    finally { setBusy(null); }
  };
  const reveal = async () => {
    setBusy('reveal');
    try { onSecret(await integrationsApi.revealWebhookSecret(endpoint.id)); }
    catch (e) { toast.error(extractApiErrorMessage(e, 'Could not show the secret')); }
    finally { setBusy(null); }
  };
  const rotate = async () => {
    if (!(await confirm({
      title: 'Make a new signing secret?',
      description: 'The old secret stops working straight away, so your receiver will reject events until you give it the new one.',
      confirmLabel: 'Make new secret', variant: 'danger',
    }))) return;
    setBusy('rotate');
    try { onSecret(await integrationsApi.rotateWebhookSecret(endpoint.id)); toast.success('New secret made'); }
    catch (e) { toast.error(extractApiErrorMessage(e, 'Could not make a new secret')); }
    finally { setBusy(null); }
  };
  const redeliver = async (d: WebhookDelivery) => {
    setBusy(d.id);
    try { await integrationsApi.redeliver(d.id); toast.success('Sending it again'); void load(); }
    catch (e) { toast.error(extractApiErrorMessage(e, 'Could not send it again')); }
    finally { setBusy(null); }
  };

  return (
    <Drawer open onClose={onClose} width="lg" title="Deliveries" subtitle={endpoint.url}
      footer={(
        <div className="flex flex-wrap gap-2">
          <button onClick={() => void ping()} disabled={!!busy} className={primaryBtn}>
            {busy === 'ping' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Send test event
          </button>
          <button onClick={() => void reveal()} disabled={!!busy} className={ghostBtn}><Eye className="h-3.5 w-3.5" />Show secret</button>
          <button onClick={() => void rotate()} disabled={!!busy} className={ghostBtn}><KeyRound className="h-3.5 w-3.5" />New secret</button>
        </div>
      )}>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-slate-500">The last 50 events sent here. A failed one is retried for just under two days.</p>
          <button onClick={() => void load()} className={ghostBtn}><RefreshCw className="h-3.5 w-3.5" />Refresh</button>
        </div>
        {rows === null ? <Spinner /> : rows.length === 0 ? (
          <Empty icon={<Send className="w-9 h-9 text-slate-300" />} title="Nothing sent yet" body="Send a test event to check your receiver, or wait for something to happen." />
        ) : (
          <div className={`${card} divide-y divide-slate-100 dark:divide-slate-800`}>
            {rows.map((d) => (
              <div key={d.id} className="px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={() => setExpanded(expanded === d.id ? null : d.id)} className="min-w-0 flex-1 text-left">
                    <p className="font-mono text-xs text-slate-900">{d.type}</p>
                    <p className="text-xs text-slate-500">
                      {when(d.createdAt)} · {d.attempts} attempt{d.attempts === 1 ? '' : 's'}
                      {d.lastStatusCode ? ` · HTTP ${d.lastStatusCode}` : ''}{d.lastDurationMs != null ? ` · ${d.lastDurationMs} ms` : ''}
                      {d.status === 'retrying' && d.nextAttemptAt ? ` · next try ${when(d.nextAttemptAt)}` : ''}
                    </p>
                    {d.lastError && d.status !== 'succeeded' && <p className="text-xs text-rose-700">{d.lastError}</p>}
                  </button>
                  <StatusPill status={d.status} />
                  {d.status !== 'pending' && (
                    <button onClick={() => void redeliver(d)} disabled={busy === d.id} className={ghostBtn}>
                      {busy === d.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}Resend
                    </button>
                  )}
                </div>
                {expanded === d.id && (
                  <div className="mt-2 space-y-2">
                    <pre className="max-h-64 overflow-auto rounded-lg bg-slate-50 p-2 font-mono text-[11px] text-slate-700 dark:bg-slate-900 dark:text-slate-200">{JSON.stringify(d.payload, null, 2)}</pre>
                    {d.lastResponseBody && <p className="text-xs text-slate-500">Your server answered: <code className="font-mono">{d.lastResponseBody.slice(0, 300)}</code></p>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Drawer>
  );
}

const Spinner = () => <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div>;

function Empty({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center dark:border-slate-700 dark:bg-white/5">
      <div className="mx-auto mb-3 flex justify-center">{icon}</div>
      <p className="font-medium text-slate-700">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{body}</p>
    </div>
  );
}
