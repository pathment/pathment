'use client';

import { useEffect, useRef, useState } from 'react';
import { BookmarkPlus, ChevronDown, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { assessmentApi, type RubricSnippet } from '@/lib/services/assessment-api';

/**
 * A rubric textarea with a reusable-snippet library attached: insert a saved
 * snippet, or save what you've written for reuse on the next question / next
 * cohort. Writing the rubric is the slow part of AI scoring, and reusing the
 * same wording is what keeps scoring consistent between intakes.
 */
export function RubricField({
  value, onChange, placeholder, rows = 2, tone = 'violet', label, hint,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  rows?: number;
  tone?: 'violet' | 'slate';
  label?: string;
  hint?: string;
}) {
  const [snippets, setSnippets] = useState<RubricSnippet[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const load = () => { assessmentApi.listSnippets().then(setSnippets).catch(() => {}); };
  useEffect(() => { load(); }, []);

  // Close the picker on an outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const insert = (s: RubricSnippet) => {
    const base = value.trim();
    onChange(base ? `${base}\n${s.body}` : s.body);
    setOpen(false);
  };

  const saveAsSnippet = async () => {
    const body = value.trim();
    if (!body) { toast.error('Write the rubric first, then save it for reuse'); return; }
    const title = window.prompt('Name this snippet (so you can find it later):', body.slice(0, 40));
    if (!title || !title.trim()) return;
    setSaving(true);
    try {
      await assessmentApi.createSnippet({ title: title.trim(), body });
      toast.success('Saved to your snippet library');
      load();
    } catch { toast.error('Could not save the snippet'); }
    finally { setSaving(false); }
  };

  const remove = async (s: RubricSnippet) => {
    try { await assessmentApi.deleteSnippet(s.id); setSnippets((p) => p.filter((x) => x.id !== s.id)); }
    catch { toast.error('Could not delete'); }
  };

  const ring = tone === 'violet' ? 'focus:ring-violet-400 border-violet-200' : 'focus:ring-brand-500 border-slate-200';

  return (
    <div ref={boxRef} className="relative">
      {label && <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>}
      <textarea
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 ${ring}`}
      />
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:border-brand-300 hover:text-brand-700"
        >
          Insert snippet <ChevronDown className="w-3 h-3" />
        </button>
        <button
          type="button"
          onClick={saveAsSnippet}
          disabled={saving}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:border-brand-300 hover:text-brand-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <BookmarkPlus className="w-3 h-3" />} Save for reuse
        </button>
        {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
      </div>

      {open && (
        <div className="absolute z-30 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-card shadow-lg">
          {snippets.length === 0 ? (
            <p className="px-3 py-3 text-xs text-slate-500">No saved snippets yet — write a rubric and hit &ldquo;Save for reuse&rdquo;.</p>
          ) : snippets.map((s) => (
            <div key={s.id} className="group flex items-start gap-2 px-3 py-2 hover:bg-slate-50">
              <button type="button" onClick={() => insert(s)} className="flex-1 text-left min-w-0">
                <p className="text-xs font-medium text-slate-800 truncate">{s.title}</p>
                <p className="text-[11px] text-slate-500 line-clamp-2">{s.body}</p>
              </button>
              <button type="button" onClick={() => remove(s)} aria-label="Delete snippet" className="p-1 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
