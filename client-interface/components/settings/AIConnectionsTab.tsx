'use client';

import { useState } from 'react';
import { KeyRound, Plus, Trash2, X, Loader2, Zap, CheckCircle2, AlertTriangle, Circle } from 'lucide-react';
import { useAIConnections } from '@/lib/hooks/admin';
import type { AIProvider, AIFeature, AIKeyStatus } from '@/lib/services/ai-connections-api';

const PROVIDER_META: Record<AIProvider, { label: string; hint: string; keyPrefix: string; models: string[] }> = {
  groq: { label: 'Groq', hint: 'Fastest — great for summaries & nudges.', keyPrefix: 'gsk_', models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b'] },
  openai: { label: 'OpenAI', hint: 'Strong reasoning for delay analysis.', keyPrefix: 'sk-', models: ['gpt-4o', 'gpt-4o-mini'] },
  anthropic: { label: 'Anthropic', hint: 'Nuanced, careful coaching language.', keyPrefix: 'sk-ant-', models: ['claude-sonnet-4', 'claude-haiku-4'] },
  gemini: { label: 'Google Gemini', hint: 'Long context, low cost.', keyPrefix: 'AIza', models: ['gemini-2.0-flash', 'gemini-1.5-pro'] },
  custom: { label: 'Custom / self-hosted', hint: 'Any OpenAI-compatible endpoint.', keyPrefix: '', models: ['custom'] },
};

const FEATURE_META: { key: AIFeature; label: string; hint: string }[] = [
  { key: 'summary', label: 'Mentee summaries', hint: 'Per-mentee progress digests' },
  { key: 'delay', label: 'Delay reasoning', hint: 'Explain why a mentee is behind' },
  { key: 'atrisk', label: 'At-risk ranking', hint: 'Rank who needs attention' },
  { key: 'nudge', label: 'Automatic nudges', hint: 'Draft check-in messages' },
  { key: 'stall', label: 'Stall warnings', hint: 'Detect stalled progress' },
  { key: 'coaching', label: 'Coaching suggestions', hint: 'Mentor talking points' },
  { key: 'feedback', label: 'Draft feedback', hint: 'Suggest task feedback' },
];

const STATUS_META: Record<AIKeyStatus, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  connected: { label: 'Connected', cls: 'bg-emerald-50 text-emerald-700', Icon: CheckCircle2 },
  error: { label: 'Error', cls: 'bg-red-50 text-red-600', Icon: AlertTriangle },
  untested: { label: 'Untested', cls: 'bg-slate-100 text-slate-500', Icon: Circle },
};

const field = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';

export default function AIConnectionsTab() {
  const { connections, routing, loading, busyId, addKey, removeKey, testKey, setRoute } = useAIConnections();
  const [adding, setAdding] = useState(false);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 animate-spin text-indigo-600" /></div>;

  return (
    <div className="space-y-8">
      {/* Connections */}
      <section>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-slate-900 flex items-center gap-2"><KeyRound className="w-5 h-5 text-indigo-600" /> AI connections</h2>
            <p className="text-slate-500 text-sm mt-0.5">Bring your own provider keys. Keys are encrypted and only ever shown masked.</p>
          </div>
          <button onClick={() => setAdding(true)} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 shrink-0">
            <Plus className="w-4 h-4" /> Add key
          </button>
        </div>

        {connections.length === 0 ? (
          <div className="bg-slate-50 rounded-2xl border border-dashed border-slate-200 p-10 text-center">
            <KeyRound className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600">No AI connections yet — add a provider key to power AI features.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {connections.map((c) => {
              const sm = STATUS_META[c.status];
              return (
                <div key={c.id} className="flex items-center gap-3 p-4 rounded-xl border border-slate-200 bg-white">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-900">{c.label}</span>
                      <span className="text-xs text-slate-400">{PROVIDER_META[c.provider]?.label || c.provider}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                      <code className="font-mono">{c.keyMasked}</code>
                      {c.model && <span>· {c.model}</span>}
                    </div>
                  </div>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${sm.cls}`}><sm.Icon className="w-3 h-3" />{sm.label}</span>
                  <button onClick={() => testKey(c.id)} disabled={busyId === c.id} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 text-xs font-medium hover:bg-slate-50 disabled:opacity-50">
                    {busyId === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}Test
                  </button>
                  <button onClick={() => removeKey(c.id)} disabled={busyId === c.id} aria-label="Remove" className="p-1.5 text-slate-400 hover:text-red-600 disabled:opacity-50"><Trash2 className="w-4 h-4" /></button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Feature routing */}
      <section>
        <h2 className="text-slate-900">Feature routing</h2>
        <p className="text-slate-500 text-sm mt-0.5 mb-4">Choose which connection powers each AI feature, or turn it off.</p>
        <div className="grid sm:grid-cols-2 gap-3">
          {FEATURE_META.map((f) => (
            <div key={f.key} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800">{f.label}</p>
                <p className="text-xs text-slate-400">{f.hint}</p>
              </div>
              <select
                value={routing[f.key] ?? ''}
                onChange={(e) => setRoute(f.key, e.target.value || null)}
                disabled={connections.length === 0}
                className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 max-w-[160px] disabled:opacity-50"
              >
                <option value="">Off</option>
                {connections.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
          ))}
        </div>
      </section>

      {adding && <AddKeyModal onClose={() => setAdding(false)} onAdd={addKey} />}
    </div>
  );
}

function AddKeyModal({ onClose, onAdd }: { onClose: () => void; onAdd: (d: { provider: AIProvider; label: string; model?: string; baseUrl?: string; key: string }) => Promise<boolean> }) {
  const [provider, setProvider] = useState<AIProvider>('groq');
  const [label, setLabel] = useState('');
  const [model, setModel] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [key, setKey] = useState('');
  const [saving, setSaving] = useState(false);
  const meta = PROVIDER_META[provider];

  const submit = async () => {
    if (!label.trim() || !key.trim()) return;
    setSaving(true);
    const ok = await onAdd({ provider, label: label.trim(), model: model || undefined, baseUrl: baseUrl || undefined, key: key.trim() });
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div role="dialog" aria-modal="true" className="relative w-full max-w-md bg-white rounded-2xl shadow-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">Add AI connection</h3>
          <button onClick={onClose} aria-label="Close" className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Provider</label>
          <select value={provider} onChange={(e) => { setProvider(e.target.value as AIProvider); setModel(''); }} className={field}>
            {(Object.keys(PROVIDER_META) as AIProvider[]).map((p) => <option key={p} value={p}>{PROVIDER_META[p].label}</option>)}
          </select>
          <p className="text-xs text-slate-400 mt-1">{meta.hint}</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Label</label>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Primary Groq key" className={field} />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">API key</label>
          <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder={meta.keyPrefix ? `${meta.keyPrefix}…` : 'your key'} className={`${field} font-mono`} />
        </div>
        {provider === 'custom' && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Base URL</label>
            <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://…/v1" className={field} />
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Model <span className="text-slate-400 font-normal">(optional)</span></label>
          <select value={model} onChange={(e) => setModel(e.target.value)} className={field}>
            <option value="">Default</option>
            {meta.models.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-sm hover:bg-slate-50">Cancel</button>
          <button onClick={submit} disabled={saving || !label.trim() || !key.trim()} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm inline-flex items-center gap-2 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add key
          </button>
        </div>
      </div>
    </div>
  );
}
