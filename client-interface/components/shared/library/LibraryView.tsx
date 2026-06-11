'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  BookOpen, GraduationCap, FileText, ShieldCheck, Search, Plus, Pin, Trash2, ExternalLink,
  Clock, Loader2, Pencil, FileText as FileIcon, Link2, ArrowRight,
} from 'lucide-react';
import { useLibrary, type LibraryDoc } from '@/lib/hooks/mentor';
import { libraryApi } from '@/lib/services/library-api';
import { Drawer } from '@/components/shared/Drawer';
import RichTextEditor from '@/components/shared/RichTextEditor';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import DOMPurify from 'isomorphic-dompurify';

// Library content is authored as rich-text HTML and rendered via dangerouslySetInnerHTML.
// The server already sanitizes on write + read; this is defense-in-depth at the render
// sink so unsafe markup can never execute even if it somehow reaches the client.
const RICH_TEXT_ALLOWED_TAGS = [
  'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'b', 'em', 'i', 's', 'strike', 'u', 'code', 'pre', 'blockquote',
  'ul', 'ol', 'li', 'a',
];

const CATEGORIES = ['guidance', 'reading', 'template', 'policy'] as const;
const CAT_META: Record<string, { icon: typeof BookOpen; cls: string; label: string }> = {
  guidance: { icon: GraduationCap, cls: 'bg-brand-50 text-brand-700 dark:bg-brand-500/15', label: 'Guidance' },
  reading: { icon: BookOpen, cls: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15', label: 'Reading' },
  template: { icon: FileText, cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15', label: 'Template' },
  policy: { icon: ShieldCheck, cls: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15', label: 'Policy' },
};

/**
 * The org Library, shared across roles. `canCurate` (admin/mentor) enables
 * add / edit / pin / delete; mentees get a clean read-only view.
 */
export default function LibraryView({ canCurate = false }: { canCurate?: boolean }) {
  const { documents, loading, error, refetch } = useLibrary();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [editing, setEditing] = useState<LibraryDoc | 'new' | null>(null);
  const [reading, setReading] = useState<LibraryDoc | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return documents.filter((d) => {
      if (category !== 'all' && d.category !== category) return false;
      if (q && !`${d.title} ${d.summary || ''} ${d.author || ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [documents, query, category]);

  const pinned = filtered.filter((d) => d.pinned);
  const rest = filtered.filter((d) => !d.pinned);

  const act = async (id: string, fn: () => Promise<unknown>, msg?: string) => {
    try { setBusy(id); await fn(); if (msg) toast.success(msg); await refetch(); }
    catch (e) { toast.error(extractApiErrorMessage(e, 'Action failed')); }
    finally { setBusy(null); }
  };

  const open = (d: LibraryDoc) => {
    if (d.hasContent) setReading(d);
    else if (d.url) window.open(d.url, '_blank', 'noopener,noreferrer');
  };

  const cardProps = (d: LibraryDoc) => ({
    d,
    canCurate,
    busy: busy === d.id,
    onOpen: () => open(d),
    onEdit: () => setEditing(d),
    onPin: () => act(d.id, () => libraryApi.togglePin(d.id)),
    onRemove: () => { if (confirm('Delete this resource?')) act(d.id, () => libraryApi.remove(d.id), 'Deleted'); },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-slate-900 mb-1">Library</h1>
          <p className="text-slate-600">
            {canCurate
              ? 'Write and share mentoring guidance, templates, reading and policies - the team’s shared playbook.'
              : 'Guidance, templates, reading and policies shared by your mentors and the team.'}
          </p>
        </div>
        {canCurate && (
          <button onClick={() => setEditing('new')} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 shrink-0">
            <Plus className="w-4 h-4" /> Add resource
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the library…"
            className="w-full border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-card" />
        </div>
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
          {['all', ...CATEGORIES].map((c) => (
            <button key={c} onClick={() => setCategory(c)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${category === c ? 'bg-card text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
              {c === 'all' ? 'All' : CAT_META[c].label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-7 h-7 animate-spin text-brand-600" /></div>
      ) : error ? (
        <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center text-slate-600">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="bg-card rounded-2xl border border-dashed border-slate-200 py-16 text-center">
          <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600">{documents.length === 0 ? (canCurate ? 'Your library is empty.' : 'Nothing here yet.') : 'No resources match.'}</p>
          {documents.length === 0 && canCurate && (
            <button onClick={() => setEditing('new')} className="mt-3 text-sm font-medium text-brand-600 hover:text-brand-700">Write your first resource →</button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {pinned.length > 0 && (
            <section>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-2 inline-flex items-center gap-1"><Pin className="w-3 h-3" /> Pinned</p>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {pinned.map((d) => <ResourceCard key={d.id} {...cardProps(d)} />)}
              </div>
            </section>
          )}
          <section>
            {pinned.length > 0 && <p className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-2">All resources</p>}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {rest.map((d) => <ResourceCard key={d.id} {...cardProps(d)} />)}
            </div>
          </section>
        </div>
      )}

      {canCurate && editing && <EditorDrawer doc={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refetch(); }} />}
      {reading && <ReaderDrawer docId={reading.id} canCurate={canCurate} onClose={() => setReading(null)} onEdit={(d) => { setReading(null); setEditing(d); }} />}
    </div>
  );
}

function ResourceCard({ d, canCurate, busy, onOpen, onEdit, onPin, onRemove }: {
  d: LibraryDoc; canCurate: boolean; busy: boolean; onOpen: () => void; onEdit: () => void; onPin: () => void; onRemove: () => void;
}) {
  const meta = CAT_META[d.category] || CAT_META.guidance;
  const Icon = meta.icon;
  return (
    <div className={`group relative bg-card rounded-2xl border p-5 flex flex-col transition-all hover:shadow-sm ${d.pinned ? 'border-brand-200' : 'border-slate-200 hover:border-brand-300'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${meta.cls}`}><Icon className="w-4 h-4" /></div>
        {canCurate && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={onPin} disabled={busy} title={d.pinned ? 'Unpin' : 'Pin'} className={`p-1.5 rounded-lg hover:bg-slate-100 ${d.pinned ? 'text-brand-600' : 'text-slate-400'}`}><Pin className="w-4 h-4" /></button>
            <button onClick={onEdit} disabled={busy} title="Edit" className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><Pencil className="w-4 h-4" /></button>
            <button onClick={onRemove} disabled={busy} title="Delete" className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50"><Trash2 className="w-4 h-4" /></button>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 mt-3">
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${meta.cls}`}>{meta.label}</span>
        <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
          {d.hasContent ? <><FileIcon className="w-3 h-3" /> Article</> : <><Link2 className="w-3 h-3" /> Link</>}
        </span>
        {d.pinned && <span className="inline-flex items-center gap-1 text-[11px] text-brand-600"><Pin className="w-3 h-3" /> Pinned</span>}
      </div>
      <button onClick={onOpen} className="mt-2 text-left">
        <h3 className="font-medium text-slate-900 leading-snug group-hover:text-brand-700">{d.title}</h3>
        {d.summary && <p className="text-sm text-slate-500 mt-1 line-clamp-2">{d.summary}</p>}
      </button>
      <div className="mt-auto pt-3 flex items-center gap-2 text-xs text-slate-400">
        {d.author && <span className="truncate">{d.author}</span>}
        {d.readMins ? <span className="inline-flex items-center gap-1">· <Clock className="w-3 h-3" /> {d.readMins} min</span> : null}
        <button onClick={onOpen} className="ml-auto inline-flex items-center gap-1 text-brand-600 hover:text-brand-700 font-medium">
          {d.hasContent ? <>Read <ArrowRight className="w-3 h-3" /></> : <>Open <ExternalLink className="w-3 h-3" /></>}
        </button>
      </div>
    </div>
  );
}

function ReaderDrawer({ docId, canCurate, onClose, onEdit }: { docId: string; canCurate: boolean; onClose: () => void; onEdit: (d: LibraryDoc) => void }) {
  const [doc, setDoc] = useState<LibraryDoc | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    libraryApi.get(docId).then((r: any) => setDoc(r?.data?.document || null)).catch(() => {}).finally(() => setLoading(false));
  }, [docId]);

  const meta = doc ? (CAT_META[doc.category] || CAT_META.guidance) : CAT_META.guidance;
  const showFooter = Boolean(doc && (doc.url || canCurate));
  const content = doc?.content;
  const safeContent = useMemo(
    () => (content
      ? DOMPurify.sanitize(content, { ALLOWED_TAGS: RICH_TEXT_ALLOWED_TAGS, ALLOWED_ATTR: ['href', 'title', 'class', 'target', 'rel'] })
      : ''),
    [content]
  );

  return (
    <Drawer open onClose={onClose} title={doc?.title || 'Resource'} subtitle={doc ? meta.label : undefined} width="lg"
      footer={showFooter && doc ? (
        <div className="flex justify-between gap-2">
          {doc.url ? (
            <a href={doc.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm hover:bg-slate-50">
              <ExternalLink className="w-4 h-4" /> Open original
            </a>
          ) : <span />}
          {canCurate && (
            <button onClick={() => onEdit(doc)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700">
              <Pencil className="w-4 h-4" /> Edit
            </button>
          )}
        </div>
      ) : undefined}
    >
      {loading ? (
        <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-brand-600" /></div>
      ) : !doc ? (
        <p className="text-slate-500">Could not load this resource.</p>
      ) : (
        <div>
          <div className="flex items-center gap-3 text-xs text-slate-400 mb-4">
            {doc.author && <span>{doc.author}</span>}
            {doc.readMins ? <span className="inline-flex items-center gap-1">· <Clock className="w-3 h-3" /> {doc.readMins} min read</span> : null}
          </div>
          {doc.summary && <p className="text-slate-600 mb-4 pb-4 border-b border-slate-100">{doc.summary}</p>}
          {doc.content
            ? <div className="rich-content" dangerouslySetInnerHTML={{ __html: safeContent }} />
            : <p className="text-slate-500">This is a link-only resource. Use &ldquo;Open original&rdquo; below.</p>}
        </div>
      )}
    </Drawer>
  );
}

function EditorDrawer({ doc, onClose, onSaved }: { doc: LibraryDoc | null; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(doc?.title || '');
  const [category, setCategory] = useState<string>(doc?.category || 'guidance');
  const [summary, setSummary] = useState(doc?.summary || '');
  const [content, setContent] = useState('');
  const [url, setUrl] = useState(doc?.url || '');
  const [readMins, setReadMins] = useState(doc?.readMins ? String(doc.readMins) : '');
  const [saving, setSaving] = useState(false);
  const [loadingBody, setLoadingBody] = useState(Boolean(doc?.id));

  useEffect(() => {
    if (!doc?.id) return;
    libraryApi.get(doc.id).then((r: any) => setContent(r?.data?.document?.content || '')).catch(() => {}).finally(() => setLoadingBody(false));
  }, [doc?.id]);

  const save = async () => {
    if (!title.trim()) { toast.error('Give it a title'); return; }
    const hasBody = Boolean(content && content.replace(/<[^>]*>/g, '').trim());
    if (!hasBody && !url.trim()) { toast.error('Add written content or a link'); return; }
    setSaving(true);
    try {
      const payload = { title: title.trim(), category, summary: summary.trim(), content: hasBody ? content : '', url: url.trim(), readMins: readMins ? Number(readMins) : undefined };
      if (doc) await libraryApi.update(doc.id, payload);
      else await libraryApi.create(payload);
      toast.success(doc ? 'Resource updated' : 'Resource added');
      onSaved();
    } catch (e) { toast.error(extractApiErrorMessage(e, 'Could not save')); }
    finally { setSaving(false); }
  };

  return (
    <Drawer open onClose={onClose} title={doc ? 'Edit resource' : 'Add resource'} width="lg"
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium disabled:opacity-50 inline-flex items-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} {doc ? 'Save changes' : 'Publish'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. How to give feedback that lands" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-card" />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {CATEGORIES.map((c) => {
              const m = CAT_META[c]; const Icon = m.icon; const active = category === c;
              return (
                <button key={c} type="button" onClick={() => setCategory(c)}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${active ? 'border-brand-400 bg-brand-50 dark:bg-brand-500/15 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                  <Icon className="w-4 h-4" /> {m.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Summary <span className="text-slate-400">(shown on the card)</span></label>
          <textarea rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-card" />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Content</label>
          {loadingBody ? (
            <div className="py-10 flex justify-center border border-slate-200 rounded-lg"><Loader2 className="w-5 h-5 animate-spin text-brand-600" /></div>
          ) : (
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <RichTextEditor content={content} onChange={setContent} placeholder="Write the guidance, template, or notes here…" minHeight="220px" />
            </div>
          )}
          <p className="mt-1 text-xs text-slate-400">Write a full article, or leave this empty and just add a link below.</p>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">External link <span className="text-slate-400">(optional)</span></label>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-card" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Read time (min)</label>
            <input type="number" min={0} value={readMins} onChange={(e) => setReadMins(e.target.value)} placeholder="-" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-card" />
          </div>
        </div>
      </div>
    </Drawer>
  );
}
