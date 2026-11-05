'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Check, Info, Loader2 } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import {
  DEFAULT_CRITERIA, DISCUSSION_CRITERIA, groupDiscussionsApi,
  type CriteriaScores, type MeetingFeedback,
} from '@/lib/services/group-discussions-api';

const NOTE_MAX = 2000;

/**
 * One mentor's feedback on one mentee: five sliders that start at 50%, and an
 * optional note. Used inside the live call (from the roster) and in the
 * summary after it, so it reads and saves the same way in both.
 */
export function FeedbackForm({ groupId, menteeId, menteeName, initial, onSaved, compact = false }: {
  groupId: string;
  menteeId: string;
  menteeName: string;
  initial: MeetingFeedback | null;
  onSaved?: (feedback: MeetingFeedback) => void;
  compact?: boolean;
}) {
  const [scores, setScores] = useState<CriteriaScores>(() => {
    const start = { ...DEFAULT_CRITERIA };
    if (initial) for (const { key } of DISCUSSION_CRITERIA) start[key] = initial[key];
    return start;
  });
  const [note, setNote] = useState(initial?.note ?? '');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(initial?.updatedAt ?? null);
  const [dirty, setDirty] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const saved = await groupDiscussionsApi.saveFeedback(groupId, menteeId, { ...scores, note });
      setSavedAt(saved.updatedAt ?? new Date().toISOString());
      setDirty(false);
      onSaved?.(saved);
      toast.success(saved.taskCompleted
        ? `Feedback saved — ${menteeName}'s group discussion task is approved`
        : `Feedback saved for ${menteeName}`);
    } catch (error) {
      toast.error((error as { message?: string })?.message || 'Could not save the feedback');
    } finally {
      setSaving(false);
    }
  };

  /** Move every slider at once: a quick start the mentor then adjusts. */
  const setAll = (value: number) => {
    setScores(Object.fromEntries(DISCUSSION_CRITERIA.map(({ key }) => [key, value])) as CriteriaScores);
    setDirty(true);
  };
  const allAt = (value: number) => DISCUSSION_CRITERIA.every(({ key }) => scores[key] === value);
  const presetCls = 'rounded-md border border-border px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:border-brand-300 hover:text-brand-700 disabled:cursor-default disabled:opacity-50 dark:text-slate-300';

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      <div className="flex items-center justify-end gap-1.5">
        <span className="mr-0.5 text-[11px] text-muted-foreground">Set all to</span>
        <button type="button" onClick={() => setAll(0)} disabled={allAt(0)} className={presetCls} aria-label="Set every criterion to 0%">0%</button>
        <button type="button" onClick={() => setAll(100)} disabled={allAt(100)} className={presetCls} aria-label="Set every criterion to 100%">100%</button>
      </div>
      <ul className={compact ? 'space-y-3' : 'space-y-4'}>
        {DISCUSSION_CRITERIA.map(({ key, label, hint }) => (
          <li key={key}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 dark:text-slate-300" title={hint}>
                {label}
                {compact && <Info className="h-3 w-3 text-slate-400" aria-hidden />}
              </span>
              <span className="min-w-[2.75rem] rounded-md bg-brand-50 px-1.5 py-0.5 text-center text-xs font-semibold tabular-nums text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
                {scores[key]}%
              </span>
            </div>
            {!compact && <p className="-mt-1 mb-2 text-[11px] text-muted-foreground">{hint}</p>}
            {/* The shared slider, slimmed for a list of five: thinner track, brand colour. */}
            <Slider
              value={[scores[key]]}
              min={0}
              max={100}
              step={5}
              onValueChange={([value]) => { setScores((prev) => ({ ...prev, [key]: value })); setDirty(true); }}
              aria-label={`${label} for ${menteeName}`}
              title={hint}
              className="[&_[data-slot=slider-range]]:!bg-brand-600 [&_[data-slot=slider-thumb]]:!border-brand-600 [&_[data-slot=slider-thumb]]:!size-4 [&_[data-slot=slider-track]]:!h-2"
            />
          </li>
        ))}
      </ul>
      <div>
        <label htmlFor={`note-${menteeId}`} className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
          Note <span className="font-normal text-muted-foreground">(optional, the mentee sees it)</span>
        </label>
        <textarea
          id={`note-${menteeId}`}
          value={note}
          onChange={(e) => { setNote(e.target.value); setDirty(true); }}
          maxLength={NOTE_MAX}
          rows={compact ? 2 : 3}
          placeholder="What went well, and one thing to work on"
          className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">
          {dirty ? 'Unsaved changes' : savedAt ? 'Saved' : 'Not rated yet'}
        </span>
        <button
          type="button"
          onClick={save}
          disabled={saving || (!dirty && !!savedAt)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Save feedback
        </button>
      </div>
    </div>
  );
}
