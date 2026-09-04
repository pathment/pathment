'use client';

import { useState, useEffect } from 'react';
import { KeyRound, Plus, Trash2, Loader2, Zap, CheckCircle2, AlertTriangle, Circle } from 'lucide-react';
import { useAIConnections } from '@/lib/hooks/admin';
import type { AIProvider, AIFeature, AIKeyStatus } from '@/lib/services/ai-connections-api';
import { Drawer } from '@/components/shared/Drawer';

const PROVIDER_META: Record<AIProvider, { label: string; hint: string; keyPrefix: string; models: string[] }> = {
  groq: { label: 'Groq', hint: 'Fastest - great for summaries & nudges.', keyPrefix: 'gsk_', models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b'] },
  openai: { label: 'OpenAI', hint: 'Strong reasoning for delay analysis.', keyPrefix: 'sk-', models: ['gpt-4o', 'gpt-4o-mini'] },
  anthropic: { label: 'Anthropic', hint: 'Nuanced, careful coaching language.', keyPrefix: 'sk-ant-', models: ['claude-sonnet-4', 'claude-haiku-4'] },
  gemini: { label: 'Google Gemini', hint: 'Long context, low cost.', keyPrefix: 'AIza', models: ['gemini-1.5-flash', 'gemini-1.5-pro'] },
  openrouter: { label: 'OpenRouter', hint: 'One key, hundreds of models (vendor/model). Type any model id.', keyPrefix: 'sk-or-', models: ['openai/gpt-4o-mini', 'anthropic/claude-3.5-sonnet', 'google/gemini-flash-1.5', 'meta-llama/llama-3.3-70b-instruct', 'deepseek/deepseek-chat'] },
  custom: { label: 'Custom / self-hosted', hint: 'Any OpenAI-compatible endpoint.', keyPrefix: '', models: ['custom'] },
};
const FREE_MODEL_PROVIDERS: AIProvider[] = ['openrouter', 'custom'];

const FEATURE_META: { key: AIFeature; label: string; hint: string }[] = [
  { key: 'summary', label: 'Mentee summaries', hint: 'Per-mentee progress digests' },
  { key: 'delay', label: 'Delay reasoning', hint: 'Explain why a mentee is behind' },
  { key: 'atrisk', label: 'At-risk ranking', hint: 'Rank who needs attention' },
  { key: 'nudge', label: 'Automatic nudges', hint: 'Draft check-in messages' },
  { key: 'stall', label: 'Stall warnings', hint: 'Detect stalled progress' },
  { key: 'coaching', label: 'Coaching suggestions', hint: 'Mentor talking points' },
  { key: 'feedback', label: 'Draft feedback', hint: 'Suggest task feedback' },
  { key: 'roadmap', label: 'Roadmap generation', hint: 'Draft roadmap steps from a brief' },
  { key: 'rag_generation', label: 'RAG Reply Drafts', hint: 'Generate drafted mentor replies' },
  { key: 'rag_grounding', label: 'RAG Fact-Checking', hint: 'Verify drafted replies' },
  { key: 'rag_embedding', label: 'RAG Vectors (Gemini Only)', hint: 'Generate embeddings for documents' },
  { key: 'certificates', label: 'Certificate AI Evaluation', hint: 'Evaluate mentee criteria & assign certificate tiers' },
];


const STATUS_META: Record<AIKeyStatus, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  connected: { label: 'Connected', cls: 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400', Icon: CheckCircle2 },
  error: { label: 'Error', cls: 'bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400', Icon: AlertTriangle },
  untested: { label: 'Untested', cls: 'bg-slate-100 text-slate-500', Icon: Circle },
};

const field = 'w-full bg-background border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';

interface AIConnectionsTabProps {
  isMentor?: boolean;
}

export default function AIConnectionsTab({ isMentor }: AIConnectionsTabProps = {}) {
  const { connections, routing, quota, loading, busyId, addKey, removeKey, testKey, setRoute, setQuotaLimit } = useAIConnections();
  const [adding, setAdding] = useState(false);
  const [editingQuota, setEditingQuota] = useState(false);
  const [tempQuotaLimit, setTempQuotaLimit] = useState(100);

  useEffect(() => { 
    if (quota) setTempQuotaLimit(quota.limit); 
  }, [quota]);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 animate-spin text-brand-600" /></div>;

  return (
    <div className="space-y-8">
      {}
      {quota && (
        <section>
          <h2 className="text-slate-900 flex items-center gap-2 mb-2"><Zap className="w-5 h-5 text-brand-600" /> Auto-Reply Quota</h2>
          <p className="text-slate-500 text-sm mb-4">Control how many automatic AI replies can be sent on your behalf each month.</p>
          
          <div className="bg-card rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-800">
                {quota.count} of {quota.limit} messages used this month
              </span>
              <button 
                onClick={() => setEditingQuota(!editingQuota)}
                className="text-sm font-medium text-brand-600 hover:text-brand-700"
              >
                {editingQuota ? 'Cancel' : 'Edit Limit'}
              </button>
            </div>
            
            <div className="w-full bg-slate-100 rounded-full h-2.5 mb-4">
              <div 
                className={`h-2.5 rounded-full ${quota.count >= quota.limit ? 'bg-red-500' : 'bg-brand-600'}`}
                style={{ width: `${Math.min(100, (quota.count / Math.max(1, quota.limit)) * 100)}%` }}
              ></div>
            </div>

            {editingQuota && (
              <div className="flex flex-col gap-3 mt-4 pt-4 border-t border-slate-200 max-w-md">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">Monthly Limit: <span className="text-slate-900 font-bold text-sm">{tempQuotaLimit} messages</span></span>
                </div>
                <div className="flex items-center gap-4">
                  <input 
                    type="range" 
                    min="10" 
                    max="500" 
                    step="10"
                    value={tempQuotaLimit} 
                    onChange={(e) => setTempQuotaLimit(parseInt(e.target.value) || 10)}
                    className="flex-1 h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-brand-600 focus:outline-none" 
                  />
                  <button 
                    onClick={() => { setQuotaLimit(tempQuotaLimit); setEditingQuota(false); }}
                    className="px-4 py-2 bg-brand-600 hover:bg-brand-750 text-white rounded-lg text-xs font-medium shrink-0 shadow-sm transition-all"
                  >
                    Save Limit
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {}
      <section>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-slate-900 flex items-center gap-2"><KeyRound className="w-5 h-5 text-brand-600" /> AI connections</h2>
            <p className="text-slate-500 text-sm mt-0.5">Bring your own provider keys. Keys are encrypted and only ever shown masked.</p>
          </div>
          <button onClick={() => setAdding(true)} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 shrink-0">
            <Plus className="w-4 h-4" /> Add key
          </button>
        </div>

        {connections.length === 0 ? (
          <div className="bg-slate-50 rounded-2xl border border-dashed border-slate-200 p-10 text-center">
            <KeyRound className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600">No AI connections yet. Add a provider key to turn on AI features.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {connections.map((c) => {
              const sm = STATUS_META[c.status];
              return (
                <div key={c.id} className="flex items-center gap-3 p-4 rounded-xl border border-slate-200 bg-card">
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

      {}
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
                value={routing[f.key as Exclude<AIFeature, 'auto_reply'>] ?? ''}
                onChange={(e) => setRoute(f.key as Exclude<AIFeature, 'auto_reply'>, e.target.value || null)}
                disabled={connections.length === 0}
                className="bg-background border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 max-w-[160px] disabled:opacity-50"
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
    <Drawer
      open
      onClose={onClose}
      title="Add AI connection"
      subtitle="Bring your own provider key - stored encrypted, shown masked."
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-sm hover:bg-slate-50">Cancel</button>
          <button onClick={submit} disabled={saving || !label.trim() || !key.trim()} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm inline-flex items-center gap-2 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add key
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Provider</label>
          <select value={provider} onChange={(e) => { setProvider(e.target.value as AIProvider); setModel(''); }} className={field}>
            {(Object.keys(PROVIDER_META) as AIProvider[]).map((p) => <option key={p} value={p}>{PROVIDER_META[p].label}</option>)}
          </select>
          <p className="text-xs text-slate-400 mt-1">{meta.hint}</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Label</label>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Primary Groq key" className={field} autoFocus />
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
          {FREE_MODEL_PROVIDERS.includes(provider) ? (
            <>
              <input value={model} onChange={(e) => setModel(e.target.value)}
                placeholder={provider === 'openrouter' ? 'e.g. anthropic/claude-3.5-sonnet' : 'model id'} className={`${field} font-mono`} />
              {provider === 'openrouter' && <p className="text-xs text-slate-400 mt-1">Any model id from openrouter.ai/models — e.g. {meta.models.slice(0, 3).join(', ')}.</p>}
            </>
          ) : (
            <select value={model} onChange={(e) => setModel(e.target.value)} className={field}>
              <option value="">Default</option>
              {meta.models.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          )}
        </div>
      </div>
    </Drawer>
  );
}
