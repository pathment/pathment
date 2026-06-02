import { useState } from 'react';
import {
  Brain,
  Lightbulb,
  AlertTriangle,
  Star,
  MessageSquare,
  Plus,
} from 'lucide-react';
import { useStore } from '@/store/AppStore';
import { Badge, Button, Card, SectionLabel, cx } from '@/lib/ui';
import { Field, TextArea, Segmented } from '@/components/overlays';
import type { Insight, InsightKind } from '@/lib/types';

type Tone = 'neutral' | 'brand' | 'emerald' | 'amber' | 'rose' | 'sky' | 'violet';

const KIND_META: Record<
  InsightKind,
  { label: string; icon: typeof Brain; tone: Tone }
> = {
  personality: { label: 'Personality', icon: Brain, tone: 'brand' },
  analytical: { label: 'Analytical', icon: Lightbulb, tone: 'sky' },
  issue: { label: 'Issue', icon: AlertTriangle, tone: 'rose' },
  strength: { label: 'Strength', icon: Star, tone: 'emerald' },
  general: { label: 'General', icon: MessageSquare, tone: 'neutral' },
};

const KIND_ORDER: InsightKind[] = [
  'personality',
  'analytical',
  'issue',
  'strength',
  'general',
];

type Source = NonNullable<Insight['source']>;

const SOURCE_OPTIONS: Array<{ value: Source; label: string }> = [
  { value: '1:1', label: '1:1' },
  { value: 'text', label: 'Text' },
  { value: 'observation', label: 'Observed' },
];

export function InsightsPanel({ menteeId }: { menteeId: number }) {
  const { getInsights, logInsight } = useStore();
  const insights = [...getInsights(menteeId)].sort((a, b) => b.id - a.id);

  const [kind, setKind] = useState<InsightKind>('strength');
  const [source, setSource] = useState<Source>('1:1');
  const [note, setNote] = useState('');

  const trimmed = note.trim();

  const submit = () => {
    if (!trimmed) return;
    logInsight(menteeId, kind, trimmed, source);
    setNote('');
  };

  // Summary strip - counts per kind, in a stable order.
  const counts = KIND_ORDER.map((k) => ({
    kind: k,
    label: KIND_META[k].label.toLowerCase(),
    count: insights.filter((i) => i.kind === k).length,
  })).filter((c) => c.count > 0);

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <SectionLabel>Insights</SectionLabel>
        <Badge tone="neutral">{insights.length}</Badge>
      </div>

      {/* Summary strip */}
      {counts.length > 0 && (
        <p className="mb-4 font-mono text-[11px] text-ink-mute">
          {counts.map((c, i) => (
            <span key={c.kind}>
              {i > 0 && <span className="text-ink-faint"> · </span>}
              <span className="text-ink-soft">{c.count}</span> {c.label}
              {c.count > 1 && c.kind !== 'analytical' ? 's' : ''}
            </span>
          ))}
        </p>
      )}

      {/* Quick capture composer */}
      <div className="space-y-3 border-b border-hairline pb-4">
        <div>
          <div className="mb-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-ink-faint">
            Kind
          </div>
          <div className="flex flex-wrap gap-1.5">
            {KIND_ORDER.map((k) => {
              const meta = KIND_META[k];
              const Icon = meta.icon;
              const active = kind === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={cx(
                    'rounded-r inline-flex items-center gap-1.5 border px-2 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.04em] transition-colors',
                    active
                      ? 'border-ink bg-ink text-white'
                      : 'border-hairline bg-white text-ink-mute hover:border-ink hover:text-ink',
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {meta.label}
                </button>
              );
            })}
          </div>
        </div>

        <Field label="Source">
          <div>
            <Segmented value={source} onChange={setSource} options={SOURCE_OPTIONS} />
          </div>
        </Field>

        <Field label="Note">
          <TextArea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What did you learn about this mentee?"
          />
        </Field>

        <div className="flex justify-end">
          <Button size="sm" onClick={submit} disabled={!trimmed}>
            <Plus className="h-3.5 w-3.5" /> Log insight
          </Button>
        </div>
      </div>

      {/* Timeline */}
      {insights.length === 0 ? (
        <p className="pt-4 text-sm text-ink-faint">
          No insights logged yet - capture what you learn in syncs and 1:1s.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {insights.map((i) => {
            const meta = KIND_META[i.kind];
            const Icon = meta.icon;
            return (
              <div key={i.id} className="flex gap-2.5">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-mute" />
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-1.5">
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                  </div>
                  <p className="text-sm leading-relaxed text-ink-soft">{i.note}</p>
                  <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.04em] text-ink-faint">
                    {i.source ? `${i.source} · ` : ''}
                    {i.at} · {i.by}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
