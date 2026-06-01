import { useState } from 'react';
import { CheckCircle2, Plus, X, Flag } from 'lucide-react';
import { Drawer, Field, TextArea, TextInput, Segmented, Slider, SelectInput } from './overlays';
import { Button, cx } from '@/lib/ui';
import { useStore } from '@/store/AppStore';
import type { Mentee, Sentiment, Personality, BlockerCategory } from '@/lib/types';

const SENTIMENTS: Array<{ value: Sentiment; label: string }> = [
  { value: 'positive', label: 'Positive' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'low', label: 'Low' },
];

const BLOCKER_CATS: BlockerCategory[] = ['technical', 'knowledge', 'access', 'personal'];

/* A small list editor: type + Enter (or +) to add chips/rows. */
function ListEditor({
  items,
  setItems,
  placeholder,
}: {
  items: string[];
  setItems: (v: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState('');
  const add = () => {
    if (!draft.trim()) return;
    setItems([...items, draft.trim()]);
    setDraft('');
  };
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <TextInput
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
        />
        <Button variant="outline" size="md" onClick={add} type="button">
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {items.length > 0 && (
        <div className="space-y-1">
          {items.map((it, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-1.5 text-sm text-ink-soft"
            >
              <span>{it}</span>
              <button
                type="button"
                onClick={() => setItems(items.filter((_, idx) => idx !== i))}
                className="text-ink-faint hover:text-[#FF3B30]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function OneOnOneDrawer({
  open,
  onClose,
  mentee,
}: {
  open: boolean;
  onClose: () => void;
  mentee: Mentee | null;
}) {
  const { logMeeting } = useStore();
  const [saved, setSaved] = useState(false);

  const [sentiment, setSentiment] = useState<Sentiment>('neutral');
  const [summary, setSummary] = useState('');
  const [personalityRead, setPersonalityRead] = useState('');
  const [issues, setIssues] = useState<string[]>([]);
  const [nextSteps, setNextSteps] = useState<string[]>([]);
  const [personality, setPersonality] = useState<Personality | null>(null);
  const [blockerTitle, setBlockerTitle] = useState('');
  const [blockerCat, setBlockerCat] = useState<BlockerCategory>('knowledge');
  const [blockers, setBlockers] = useState<
    Array<{ title: string; category: BlockerCategory; severity: 'low' | 'medium' | 'high' }>
  >([]);

  // initialize personality sliders from the mentee when opened
  if (open && mentee && personality === null) {
    setPersonality({ ...mentee.personality });
    setSentiment(mentee.sentiment);
  }

  if (!mentee) return null;

  const reset = () => {
    setSaved(false);
    setSentiment('neutral');
    setSummary('');
    setPersonalityRead('');
    setIssues([]);
    setNextSteps([]);
    setPersonality(null);
    setBlockers([]);
    setBlockerTitle('');
  };

  const close = () => {
    reset();
    onClose();
  };

  const addBlocker = () => {
    if (!blockerTitle.trim()) return;
    setBlockers([...blockers, { title: blockerTitle.trim(), category: blockerCat, severity: 'medium' }]);
    setBlockerTitle('');
  };

  const save = () => {
    logMeeting(mentee.id, {
      summary: summary.trim() || 'Quick 1:1 check-in.',
      sentiment,
      personalityRead: personalityRead.trim() || undefined,
      issues: issues.length ? issues : undefined,
      nextSteps: nextSteps.length ? nextSteps : undefined,
      personality: personality ?? undefined,
      blockers: blockers.length ? blockers : undefined,
    });
    setSaved(true);
  };

  return (
    <Drawer
      open={open}
      onClose={close}
      width="max-w-xl"
      title={`1:1 with ${mentee.name}`}
      subtitle="Capture the understanding — not just that you met"
      footer={
        !saved ? (
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-ink-faint">Flows to the profile &amp; AI summary</span>
            <Button onClick={save}>
              <CheckCircle2 className="h-4 w-4" /> Save 1:1
            </Button>
          </div>
        ) : undefined
      }
    >
      {saved ? (
        <div className="grid place-items-center py-16 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <p className="mt-3 text-sm font-medium text-ink">1:1 captured.</p>
          <p className="mt-1 max-w-xs text-xs text-ink-mute">
            Personality, sentiment{blockers.length ? ', blockers' : ''} and next steps are now part of{' '}
            {mentee.name.split(' ')[0]}&apos;s story.
          </p>
          <Button className="mt-4" onClick={close}>
            Done
          </Button>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Sentiment */}
          <Field label="Sentiment / engagement read">
            <div>
              <Segmented value={sentiment} onChange={setSentiment} options={SENTIMENTS} />
            </div>
          </Field>

          {/* Personality read */}
          <Field
            label="Personality read"
            hint="What did you learn about how they think, communicate, stay motivated?"
          >
            <TextArea
              rows={2}
              value={personalityRead}
              onChange={(e) => setPersonalityRead(e.target.value)}
              placeholder="e.g. Responds best to async written feedback; gets discouraged by vague asks."
            />
          </Field>

          {/* Personality sliders */}
          {personality && (
            <div className="rounded-xl border border-hairline p-4">
              <div className="mb-3 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-ink-faint">
                Working-style calibration
              </div>
              <div className="space-y-3">
                <Slider
                  label="Consistency"
                  value={personality.consistency}
                  onChange={(v) => setPersonality({ ...personality, consistency: v })}
                />
                <Slider
                  label="Communication"
                  value={personality.communication}
                  onChange={(v) => setPersonality({ ...personality, communication: v })}
                />
                <Slider
                  label="Resilience"
                  value={personality.resilience}
                  onChange={(v) => setPersonality({ ...personality, resilience: v })}
                />
                <Slider
                  label="Independence"
                  value={personality.independence}
                  onChange={(v) => setPersonality({ ...personality, independence: v })}
                />
              </div>
            </div>
          )}

          {/* Issues */}
          <Field label="Issues raised">
            <ListEditor items={issues} setItems={setIssues} placeholder="Add an issue + Enter" />
          </Field>

          {/* Blockers */}
          <Field label="Blockers to track">
            <div className="space-y-2">
              <div className="flex gap-2">
                <TextInput
                  value={blockerTitle}
                  onChange={(e) => setBlockerTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addBlocker();
                    }
                  }}
                  placeholder="Describe a blocker"
                />
                <SelectInput
                  value={blockerCat}
                  onChange={(e) => setBlockerCat(e.target.value as BlockerCategory)}
                  className="w-36"
                >
                  {BLOCKER_CATS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </SelectInput>
                <Button variant="outline" size="md" onClick={addBlocker} type="button">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {blockers.map((b, i) => (
                <div
                  key={i}
                  className={cx(
                    'flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-1.5 text-sm text-ink-soft',
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Flag className="h-3.5 w-3.5 text-amber-500" />
                    {b.title}
                    <span className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
                      {b.category}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setBlockers(blockers.filter((_, idx) => idx !== i))}
                    className="text-ink-faint hover:text-[#FF3B30]"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </Field>

          {/* Agreements / next steps */}
          <Field label="Agreements / next steps">
            <ListEditor items={nextSteps} setItems={setNextSteps} placeholder="Add a next step + Enter" />
          </Field>

          {/* Summary */}
          <Field label="Summary">
            <TextArea
              rows={3}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="A few lines capturing the conversation…"
            />
          </Field>
        </div>
      )}
    </Drawer>
  );
}
