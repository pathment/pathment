'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Bug, Lightbulb, MessageSquarePlus, Paperclip, Loader2, X, Send } from 'lucide-react';
import { Drawer } from '@/components/shared/Drawer';
import { feedbackApi, type FeedbackType, type FeedbackReport } from '@/lib/services/feedback-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';

const STATUS_CLS: Record<string, string> = {
  open: 'bg-slate-100 text-slate-600', in_review: 'bg-blue-100 text-blue-700',
  planned: 'bg-violet-100 text-violet-700', fixed: 'bg-emerald-100 text-emerald-700',
  added: 'bg-emerald-100 text-emerald-700', declined: 'bg-rose-100 text-rose-700',
};
const TYPES: { value: FeedbackType; label: string; icon: typeof Bug }[] = [
  { value: 'bug', label: 'Bug', icon: Bug },
  { value: 'suggestion', label: 'Suggestion', icon: Lightbulb },
  { value: 'other', label: 'Other', icon: MessageSquarePlus },
];
const MAX = 10 * 1024 * 1024;

/**
 * Global "Send feedback / report a bug" drawer, available to every role. Submit
 * with an optional screenshot or short clip (the current page + browser are
 * captured automatically), and track your own reports + their status.
 */
export function FeedbackDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<'send' | 'mine'>('send');
  const [type, setType] = useState<FeedbackType>('bug');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [mine, setMine] = useState<FeedbackReport[]>([]);
  const [loadingMine, setLoadingMine] = useState(false);

  const loadMine = useCallback(async () => {
    setLoadingMine(true);
    try { const r = await feedbackApi.listMine(); setMine(r?.data?.reports ?? []); }
    catch { /* ignore */ } finally { setLoadingMine(false); }
  }, []);
  useEffect(() => { if (open && tab === 'mine') loadMine(); }, [open, tab, loadMine]);
  // Reset the form whenever the drawer opens fresh.
  useEffect(() => { if (open) { setTab('send'); setType('bug'); setTitle(''); setDescription(''); setFile(null); } }, [open]);

  const pickFile = (f: File | null) => {
    if (f && f.size > MAX) { toast.error('File is too large (max 10MB).'); return; }
    if (f && !(f.type.startsWith('image/') || f.type.startsWith('video/'))) { toast.error('Attach an image or a short video clip.'); return; }
    setFile(f);
  };

  const submit = async () => {
    if (!title.trim()) { toast.error('Add a short title.'); return; }
    setSubmitting(true);
    try {
      await feedbackApi.submit({
        type, title: title.trim(), description: description.trim() || undefined,
        pageUrl: typeof window !== 'undefined' ? window.location.pathname + window.location.search : undefined,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
        file,
      });
      toast.success('Thanks! Your feedback was sent.');
      setTitle(''); setDescription(''); setFile(null);
      setTab('mine'); loadMine();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not send your feedback'));
    } finally { setSubmitting(false); }
  };

  return (
    <Drawer open={open} onClose={onClose} width="md" title="Feedback" subtitle="Report a bug or suggest an improvement">
      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl mb-4">
        {(['send', 'mine'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${tab === t ? 'bg-card text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
            {t === 'send' ? 'Send feedback' : 'My reports'}
          </button>
        ))}
      </div>

      {tab === 'send' ? (
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-700 mb-2">Type</label>
            <div className="grid grid-cols-3 gap-2">
              {TYPES.map(({ value, label, icon: Icon }) => (
                <button key={value} type="button" onClick={() => setType(value)}
                  className={`flex flex-col items-center gap-1 py-3 rounded-xl border text-xs font-medium transition-colors ${type === value ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                  <Icon className="w-5 h-5" />{label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm text-slate-700 mb-1">Title <span className="text-red-500">*</span></label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200}
              placeholder={type === 'bug' ? 'e.g. Approvals page crashes on submit' : 'e.g. Add a dark mode'}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-sm text-slate-700 mb-1">Details</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4}
              placeholder="What happened, what did you expect, steps to reproduce…"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-sm text-slate-700 mb-1">Screenshot or short clip <span className="text-slate-400">(optional)</span></label>
            {file ? (
              <div className="flex items-center justify-between gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm">
                <span className="inline-flex items-center gap-2 min-w-0"><Paperclip className="w-4 h-4 text-slate-400 shrink-0" /><span className="truncate">{file.name}</span></span>
                <button onClick={() => setFile(null)} className="text-slate-400 hover:text-red-500 shrink-0"><X className="w-4 h-4" /></button>
              </div>
            ) : (
              <label className="flex items-center gap-2 px-3 py-2 border border-dashed border-slate-300 rounded-lg text-sm text-slate-500 cursor-pointer hover:border-brand-400">
                <Paperclip className="w-4 h-4" />Attach image or video (max 10MB)
                <input type="file" accept="image/*,video/*" className="hidden" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
              </label>
            )}
            <p className="mt-1 text-xs text-slate-400">We also capture the page you're on and your browser to help us debug.</p>
          </div>
          <div className="flex justify-end pt-2">
            <button onClick={submit} disabled={submitting}
              className="px-5 py-2 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50 inline-flex items-center gap-2">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}Send feedback
            </button>
          </div>
        </div>
      ) : (
        <div>
          {loadingMine ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-brand-500" /></div>
          ) : mine.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-10">You haven't submitted any feedback yet.</p>
          ) : (
            <div className="space-y-2">
              {mine.map((r) => (
                <div key={r.id} className="rounded-xl border border-slate-200 px-3.5 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-900 truncate">{r.title}</span>
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 ${STATUS_CLS[r.status] || 'bg-slate-100 text-slate-600'}`}>{r.statusLabel}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{r.typeLabel} · {new Date(r.createdAt).toLocaleDateString()}</p>
                  {r.resolutionNote && (
                    <p className="mt-2 text-xs text-slate-600 bg-slate-50 rounded-lg px-2.5 py-2"><span className="font-medium text-slate-700">Reply:</span> {r.resolutionNote}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}
