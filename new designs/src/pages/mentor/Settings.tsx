import { useState } from 'react';
import {
  Plus,
  Trash2,
  Zap,
  KeyRound,
  ShieldCheck,
  AlertTriangle,
  Circle,
} from 'lucide-react';
import { Page, PageHeader } from '@/components/Page';
import { Card, Badge, Button, SectionLabel, cx } from '@/lib/ui';
import { Modal, Field, TextInput, SelectInput } from '@/components/overlays';
import { useStore } from '@/store/AppStore';
import { PROVIDER_META, FEATURE_META } from '@/lib/ai';
import type { AIProvider, AIFeature, AIKeyStatus } from '@/lib/types';

const STATUS_META: Record<AIKeyStatus, { tone: 'emerald' | 'rose' | 'neutral'; label: string }> = {
  connected: { tone: 'emerald', label: 'Connected' },
  error: { tone: 'rose', label: 'Error' },
  untested: { tone: 'neutral', label: 'Untested' },
};

export function Settings() {
  const {
    aiKeys,
    routing,
    addKey,
    removeKey,
    testKey,
    setRoute,
    mentor,
    setMentorPref,
    mentees,
  } = useStore();

  const [addOpen, setAddOpen] = useState(false);
  const [provider, setProvider] = useState<AIProvider>('openai');
  const [label, setLabel] = useState('');
  const [key, setKey] = useState('');
  const [model, setModel] = useState('');

  const submitKey = () => {
    if (!key.trim()) return;
    addKey({ provider, label: label.trim(), key: key.trim(), model: model || undefined });
    setAddOpen(false);
    setProvider('openai');
    setLabel('');
    setKey('');
    setModel('');
  };

  const features = Object.keys(FEATURE_META) as AIFeature[];

  return (
    <Page>
      <PageHeader
        title="Settings"
        subtitle="Connect your own AI keys, route them per feature, and set your mentoring capacity."
      />

      {/* AI CONNECTIONS — bring your own key */}
      <Card className="mb-6 p-0">
        <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-ink-mute" />
              <span className="text-sm font-semibold text-ink">AI connections</span>
            </div>
            <p className="mt-0.5 text-xs text-ink-mute">
              Bring your own keys. They stay yours — route different providers to different features.
            </p>
          </div>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" /> Add key
          </Button>
        </div>

        <div className="divide-y divide-hairline">
          {aiKeys.length === 0 && (
            <div className="px-5 py-10 text-center text-sm text-ink-mute">
              No keys connected yet. Add one to power the AI features below.
            </div>
          )}
          {aiKeys.map((k) => {
            const meta = PROVIDER_META[k.provider];
            const status = STATUS_META[k.status];
            return (
              <div key={k.id} className="flex items-center gap-4 px-5 py-3.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-neutral-100 text-ink-mute">
                  <Zap className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-ink">{k.label}</span>
                    <Badge tone={status.tone}>
                      <Circle
                        className={cx(
                          'h-1.5 w-1.5 fill-current',
                          k.status === 'connected'
                            ? 'text-emerald-500'
                            : k.status === 'error'
                              ? 'text-[#FF3B30]'
                              : 'text-ink-faint',
                        )}
                      />
                      {status.label}
                    </Badge>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 font-mono text-[11px] text-ink-faint">
                    <span>{meta.label}</span>
                    <span>·</span>
                    <span>{k.keyMasked}</span>
                    {k.model && (
                      <>
                        <span>·</span>
                        <span>{k.model}</span>
                      </>
                    )}
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => testKey(k.id)}>
                  <ShieldCheck className="h-3.5 w-3.5" /> Test
                </Button>
                <button
                  onClick={() => removeKey(k.id)}
                  className="grid h-8 w-8 place-items-center rounded-lg text-ink-faint hover:bg-rose-50 hover:text-[#FF3B30]"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      </Card>

      {/* FEATURE ROUTING */}
      <Card className="mb-6 p-0">
        <div className="border-b border-hairline px-5 py-4">
          <span className="text-sm font-semibold text-ink">Feature routing</span>
          <p className="mt-0.5 text-xs text-ink-mute">
            Pick which connected key powers each AI feature. Set any to Off to disable it.
          </p>
        </div>
        <div className="divide-y divide-hairline">
          {features.map((f) => {
            const fm = FEATURE_META[f];
            const current = routing[f];
            const offline = current === null || !aiKeys.some((k) => k.id === current);
            return (
              <div
                key={f}
                className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:gap-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm font-medium text-ink">
                    {fm.label}
                    {offline && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-normal text-amber-600">
                        <AlertTriangle className="h-3 w-3" /> off
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-ink-mute">{fm.desc}</p>
                </div>
                <SelectInput
                  value={current ?? ''}
                  onChange={(e) => setRoute(f, e.target.value || null)}
                  className="w-full shrink-0 sm:w-52"
                >
                  <option value="">Off</option>
                  {aiKeys.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.label}
                    </option>
                  ))}
                </SelectInput>
              </div>
            );
          })}
        </div>
      </Card>

      {/* MENTOR CAPACITY */}
      <Card className="p-5">
        <SectionLabel>Mentoring capacity</SectionLabel>
        <div className="grid gap-5 sm:grid-cols-3">
          <label className="flex items-center justify-between gap-3 rounded-xl border border-hairline px-4 py-3 sm:col-span-2">
            <div>
              <div className="text-sm font-medium text-ink">Accepting new mentees</div>
              <div className="text-xs text-ink-mute">Turn off when you&apos;re at capacity.</div>
            </div>
            <button
              onClick={() => setMentorPref({ acceptingMentees: !mentor.acceptingMentees })}
              className={cx(
                'relative h-6 w-11 shrink-0 rounded-full transition-colors',
                mentor.acceptingMentees ? 'bg-emerald-500' : 'bg-neutral-300',
              )}
            >
              <span
                className={cx(
                  'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-soft transition-all',
                  mentor.acceptingMentees ? 'left-[22px]' : 'left-0.5',
                )}
              />
            </button>
          </label>

          <div className="rounded-xl border border-hairline px-4 py-3">
            <div className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
              Current load
            </div>
            <div className="mt-1 font-mono text-lg font-semibold text-ink tnum">
              {mentees.length}
              <span className="text-sm text-ink-faint"> / {mentor.maxMentees}</span>
            </div>
          </div>
        </div>
      </Card>

      {/* ADD KEY MODAL */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add an AI key"
        subtitle="Paste a key from any provider. It powers the features you route to it."
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitKey} disabled={!key.trim()}>
              <Plus className="h-4 w-4" /> Connect
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field label="Provider" hint={PROVIDER_META[provider].hint}>
            <SelectInput
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value as AIProvider);
                setModel('');
              }}
            >
              {(Object.keys(PROVIDER_META) as AIProvider[]).map((p) => (
                <option key={p} value={p}>
                  {PROVIDER_META[p].label}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Label">
            <TextInput
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={`e.g. ${PROVIDER_META[provider].label} — my account`}
            />
          </Field>
          <Field label="API key">
            <TextInput
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={`${PROVIDER_META[provider].keyPrefix}…`}
              className="font-mono"
            />
          </Field>
          <Field label="Model (optional)">
            <SelectInput value={model} onChange={(e) => setModel(e.target.value)}>
              <option value="">Default</option>
              {PROVIDER_META[provider].models.map((mo) => (
                <option key={mo} value={mo}>
                  {mo}
                </option>
              ))}
            </SelectInput>
          </Field>
        </div>
      </Modal>
    </Page>
  );
}
