'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Sparkles, Loader2, BookmarkPlus, MessageSquareText, Trash2, X, Check } from 'lucide-react';
import { Dropdown } from '@/components/shared/Dropdown';
import { mentorApi } from '@/lib/services/mentor-api';
import { useFeedbackSnippets } from '@/lib/hooks/mentor';
import { extractApiErrorMessage } from '@/lib/utils/api-error';

export interface DraftContext {
  taskTitle: string;
  brief?: string | null;
  criteria?: string[];
  decision: 'approved' | 'approved_notes' | 'changes' | 'rejected';
  count?: number;
}

/**
 * FeedbackAssist — the shared feedback toolbar for both review drawers. Bundles:
 *  • "Draft with AI" — drafts constructive feedback from the task context and
 *    hands the text back via onApplyDraft (drawer owns the field state).
 *  • "Snippets" menu — quick built-in templates + the mentor's saved snippets,
 *    each inserted via onInsert; "Save current as snippet" persists the current
 *    field text; per-snippet delete (x).
 *
 * The drawer owns the field, so insertion/replacement is the caller's call.
 */
export function FeedbackAssist({
  templates = [],
  getDraftContext,
  getCurrentText,
  onInsert,
  onApplyDraft,
}: {
  /** Quick built-in templates shown alongside saved snippets. */
  templates?: string[];
  /** Build the task context for the AI draft at click time (so it reflects current decision/mode). */
  getDraftContext: () => DraftContext;
  /** The current feedback field value (used by "Save current as snippet"). */
  getCurrentText: () => string;
  /** Insert a snippet/template into the field (drawer decides append vs replace). */
  onInsert: (text: string) => void;
  /** Apply the AI draft to the field (drawer decides replace-if-empty / replace). */
  onApplyDraft: (text: string) => void;
}) {
  const { snippets, loading, create, remove } = useFeedbackSnippets();
  const [drafting, setDrafting] = useState(false);
  const [savingOpen, setSavingOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [savingBusy, setSavingBusy] = useState(false);

  const draft = async () => {
    try {
      setDrafting(true);
      const { text } = await mentorApi.draftFeedback(getDraftContext());
      const clean = (text || '').trim();
      if (!clean) {
        toast.error('The AI returned an empty draft. Try again.');
        return;
      }
      onApplyDraft(clean);
      toast.success('Drafted with AI');
    } catch (err) {
      toast.error(extractApiErrorMessage(err, 'Could not draft feedback'));
    } finally {
      setDrafting(false);
    }
  };

  const saveSnippet = async () => {
    const body = getCurrentText().trim();
    if (!body) {
      toast.error('Write some feedback first, then save it as a snippet');
      return;
    }
    if (!savingOpen) {
      setLabel('');
      setSavingOpen(true);
      return;
    }
    const cleanLabel = label.trim();
    if (!cleanLabel) {
      toast.error('Give the snippet a short label');
      return;
    }
    try {
      setSavingBusy(true);
      await create({ label: cleanLabel, body });
      toast.success('Snippet saved');
      setSavingOpen(false);
      setLabel('');
    } catch (err) {
      toast.error(extractApiErrorMessage(err, 'Could not save snippet'));
    } finally {
      setSavingBusy(false);
    }
  };

  const removeSnippet = async (id: string) => {
    try {
      await remove(id);
    } catch (err) {
      toast.error(extractApiErrorMessage(err, 'Could not remove snippet'));
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={draft}
          disabled={drafting}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-brand-300 dark:border-brand-500/30 bg-brand-50 dark:bg-brand-500/15 text-xs font-medium text-brand-700 dark:text-brand-300 hover:bg-brand-100 dark:hover:bg-brand-500/25 disabled:opacity-50"
        >
          {drafting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          Draft with AI
        </button>

        <Dropdown
          align="start"
          width="w-72"
          menuClassName="max-h-80 overflow-y-auto"
          trigger={({ toggle }) => (
            <button
              type="button"
              onClick={toggle}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:border-brand-300 hover:text-brand-700"
            >
              <MessageSquareText className="w-3.5 h-3.5" />
              Snippets
            </button>
          )}
        >
          {(close) => (
            <div className="py-1.5 text-sm">
              {templates.length > 0 && (
                <>
                  <p className="px-3 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Quick templates</p>
                  {templates.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => { onInsert(t); close(); }}
                      className="block w-full text-left px-3 py-1.5 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      {t}
                    </button>
                  ))}
                </>
              )}

              <p className="px-3 pt-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Saved snippets</p>
              {loading ? (
                <p className="px-3 py-1.5 text-xs text-slate-400">Loading…</p>
              ) : snippets.length === 0 ? (
                <p className="px-3 py-1.5 text-xs text-slate-400">No saved snippets yet.</p>
              ) : (
                snippets.map((s) => (
                  <div key={s.id} className="group flex items-start gap-1 px-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg">
                    <button
                      type="button"
                      onClick={() => { onInsert(s.body); close(); }}
                      className="flex-1 min-w-0 text-left px-1.5 py-1.5"
                    >
                      <span className="block text-slate-800 dark:text-slate-200 font-medium truncate">{s.label}</span>
                      <span className="block text-xs text-slate-400 truncate">{s.body}</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeSnippet(s.id); }}
                      aria-label={`Delete snippet ${s.label}`}
                      className="mt-1.5 p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/15"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </Dropdown>

        {!savingOpen && (
          <button
            type="button"
            onClick={saveSnippet}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:border-brand-300 hover:text-brand-700"
          >
            <BookmarkPlus className="w-3.5 h-3.5" />
            Save current as snippet
          </button>
        )}
      </div>

      {savingOpen && (
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-2">
          <input
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveSnippet(); } if (e.key === 'Escape') setSavingOpen(false); }}
            maxLength={80}
            placeholder="Short label for this snippet…"
            className="flex-1 border border-slate-300 dark:border-slate-700 dark:bg-slate-900 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <button
            type="button"
            onClick={saveSnippet}
            disabled={savingBusy}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-medium disabled:opacity-50"
          >
            {savingBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Save
          </button>
          <button
            type="button"
            onClick={() => setSavingOpen(false)}
            aria-label="Cancel saving snippet"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

export default FeedbackAssist;
