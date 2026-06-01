import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Search,
  Pin,
  PinOff,
  Clock,
  ExternalLink,
  BookOpen,
  FileText,
  ShieldCheck,
  GraduationCap,
  ArrowUpRight,
  Plus,
  Trash2,
} from 'lucide-react';
import { Page, PageHeader } from '@/components/Page';
import { Drawer, Modal, Field, TextInput, TextArea, SelectInput } from '@/components/overlays';
import { useStore } from '@/store/AppStore';
import { Badge, Button, Card, SectionLabel, cx } from '@/lib/ui';
import type { Document, DocCategory } from '@/lib/types';

/* ----------------------------------------------------------------
   category meta — tone + icon + label for each DocCategory
----------------------------------------------------------------- */
type Tone = 'neutral' | 'brand' | 'emerald' | 'amber' | 'sky' | 'violet';

const CATEGORY_META: Record<
  DocCategory,
  { label: string; tone: Tone; icon: typeof BookOpen }
> = {
  guidance: { label: 'Guidance', tone: 'brand', icon: GraduationCap },
  reading: { label: 'Reading', tone: 'sky', icon: BookOpen },
  template: { label: 'Template', tone: 'emerald', icon: FileText },
  policy: { label: 'Policy', tone: 'amber', icon: ShieldCheck },
};

type CategoryFilter = 'all' | DocCategory;

const CATEGORY_FILTERS: { key: CategoryFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'guidance', label: 'Guidance' },
  { key: 'reading', label: 'Reading' },
  { key: 'template', label: 'Template' },
  { key: 'policy', label: 'Policy' },
];

const CATEGORIES: DocCategory[] = ['guidance', 'reading', 'template', 'policy'];

export function Documents() {
  const { documents, addDocument, togglePinDocument, removeDocument, mentor } = useStore();
  const { pathname } = useLocation();
  const isAdmin = pathname.startsWith('/admin');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [active, setActive] = useState<Document | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  // add-document form
  const [dTitle, setDTitle] = useState('');
  const [dCategory, setDCategory] = useState<DocCategory>('guidance');
  const [dSummary, setDSummary] = useState('');
  const [dUrl, setDUrl] = useState('');
  const [dRead, setDRead] = useState('');

  const resetAdd = () => {
    setDTitle('');
    setDCategory('guidance');
    setDSummary('');
    setDUrl('');
    setDRead('');
  };

  const submitDoc = () => {
    if (!dTitle.trim()) return;
    const mins = parseInt(dRead, 10);
    addDocument({
      title: dTitle.trim(),
      category: dCategory,
      summary: dSummary.trim() || undefined,
      author: isAdmin ? 'Org · Admin' : mentor.name,
      url: dUrl.trim() || undefined,
      readMins: Number.isFinite(mins) ? mins : undefined,
    });
    resetAdd();
    setAddOpen(false);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return documents.filter((d) => {
      if (category !== 'all' && d.category !== category) return false;
      if (!q) return true;
      return (
        d.title.toLowerCase().includes(q) ||
        (d.summary?.toLowerCase().includes(q) ?? false) ||
        d.author.toLowerCase().includes(q)
      );
    });
  }, [documents, query, category]);

  const pinned = filtered.filter((d) => d.pinned);
  const rest = filtered.filter((d) => !d.pinned);

  return (
    <Page>
      <PageHeader
        title="Library"
        subtitle={
          isAdmin
            ? 'Curate the shared mentorship guidance & reading every mentor sees'
            : 'Shared mentorship guidance & reading from the organization'
        }
        actions={
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" /> Add document
          </Button>
        }
      />

      {/* search + category filter chips */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title, summary, author…"
            className="h-10 w-full rounded-r border border-neutral-200 bg-white pl-9 pr-3 text-sm text-ink placeholder:text-ink-faint focus:border-brand-300"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {CATEGORY_FILTERS.map((f) => {
            const activeChip = category === f.key;
            const Icon = f.key === 'all' ? null : CATEGORY_META[f.key].icon;
            return (
              <button
                key={f.key}
                onClick={() => setCategory(f.key)}
                className={cx(
                  'inline-flex items-center gap-1.5 rounded-r px-3 py-1.5 text-sm font-medium transition-colors',
                  activeChip
                    ? 'bg-ink text-white'
                    : 'bg-white text-ink-soft ring-1 ring-neutral-200/70 hover:bg-neutral-50',
                )}
              >
                {Icon && <Icon className="h-3.5 w-3.5" />}
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 text-xs text-ink-mute">
        Showing {filtered.length} of {documents.length} document
        {documents.length === 1 ? '' : 's'}
      </div>

      {filtered.length === 0 ? (
        <Card className="mt-4 grid place-items-center py-20 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-r bg-neutral-100 text-ink-faint">
            <BookOpen className="h-6 w-6" />
          </span>
          <p className="mt-4 text-base font-medium text-ink">Nothing in the library matches that.</p>
          <p className="mt-1 text-sm text-ink-mute">
            Try a different title, author, or category.
          </p>
        </Card>
      ) : (
        <div className="mt-6 space-y-8">
          {/* pinned first — emphasized with a left accent rule */}
          {pinned.length > 0 && (
            <section>
              <SectionLabel>Pinned</SectionLabel>
              <div className="grid gap-3 lg:grid-cols-2">
                {pinned.map((d) => (
                  <DocCard
                    key={d.id}
                    doc={d}
                    pinned
                    onOpen={() => setActive(d)}
                    onPin={() => togglePinDocument(d.id)}
                    onRemove={() => removeDocument(d.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {rest.length > 0 && (
            <section>
              {pinned.length > 0 && <SectionLabel>All documents</SectionLabel>}
              <div className="grid gap-3 lg:grid-cols-2">
                {rest.map((d) => (
                  <DocCard
                    key={d.id}
                    doc={d}
                    onOpen={() => setActive(d)}
                    onPin={() => togglePinDocument(d.id)}
                    onRemove={() => removeDocument(d.id)}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <ReadDrawer doc={active} onClose={() => setActive(null)} />

      {/* add / publish a document — available to mentors & admins */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add a document"
        subtitle={isAdmin ? 'Publishes to every mentor in the org' : 'Share guidance or reading with your peers'}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitDoc} disabled={!dTitle.trim()}>
              <Plus className="h-4 w-4" /> Publish
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field label="Title">
            <TextInput value={dTitle} onChange={(e) => setDTitle(e.target.value)} placeholder="e.g. Running a great 1:1" autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <SelectInput value={dCategory} onChange={(e) => setDCategory(e.target.value as DocCategory)}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_META[c].label}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Read time (min)">
              <TextInput type="number" min={1} value={dRead} onChange={(e) => setDRead(e.target.value)} placeholder="6" className="font-mono tnum" />
            </Field>
          </div>
          <Field label="Summary">
            <TextArea rows={3} value={dSummary} onChange={(e) => setDSummary(e.target.value)} placeholder="A one or two line summary of what this covers." />
          </Field>
          <Field label="Link (optional)" hint="Where the full document lives.">
            <TextInput value={dUrl} onChange={(e) => setDUrl(e.target.value)} placeholder="https://…" className="font-mono text-xs" />
          </Field>
        </div>
      </Modal>
    </Page>
  );
}

/* ----------------------------------------------------------------
   one document card / row
----------------------------------------------------------------- */
function DocCard({
  doc,
  pinned = false,
  onOpen,
  onPin,
  onRemove,
}: {
  doc: Document;
  pinned?: boolean;
  onOpen: () => void;
  onPin: () => void;
  onRemove: () => void;
}) {
  const meta = CATEGORY_META[doc.category];
  const Icon = meta.icon;
  const stop = (e: React.MouseEvent, fn: () => void) => {
    e.stopPropagation();
    fn();
  };

  return (
    <Card
      hover
      onClick={onOpen}
      className={cx(
        'group flex flex-col p-5',
        pinned && 'border-l-2 border-l-[#FF3B30]',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-r border border-hairline text-ink-mute">
          <Icon className="h-4 w-4" />
        </span>
        <div className="flex items-center gap-2">
          {pinned && (
            <span className="inline-flex items-center gap-1 font-mono text-[10px] font-medium uppercase tracking-[0.04em] text-[#FF3B30]">
              <Pin className="h-3 w-3" />
              Pinned
            </span>
          )}
          <Badge tone={meta.tone}>{meta.label}</Badge>
          {/* manage controls — appear on hover */}
          <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              onClick={(e) => stop(e, onPin)}
              title={doc.pinned ? 'Unpin' : 'Pin'}
              className="grid h-7 w-7 place-items-center rounded-r text-ink-faint hover:bg-neutral-100 hover:text-ink"
            >
              {doc.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
            </button>
            <button
              onClick={(e) => stop(e, onRemove)}
              title="Remove"
              className="grid h-7 w-7 place-items-center rounded-r text-ink-faint hover:bg-rose-50 hover:text-[#FF3B30]"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      <h3 className="mt-3 font-semibold leading-snug tracking-tight text-ink">
        {doc.title}
      </h3>
      {doc.summary && (
        <p className="mt-1.5 line-clamp-2 text-sm text-ink-mute">{doc.summary}</p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-neutral-100 pt-3 text-xs text-ink-mute">
        <span className="truncate text-ink-soft">{doc.author}</span>
        <span className="text-ink-faint">Updated {doc.updatedAt}</span>
        {typeof doc.readMins === 'number' && (
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5 text-ink-faint" />
            {doc.readMins} min read
          </span>
        )}
        <span className="ml-auto inline-flex items-center gap-1 font-medium text-brand-600 opacity-0 transition-opacity group-hover:opacity-100">
          Read <ArrowUpRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </Card>
  );
}

/* ----------------------------------------------------------------
   read drawer — title, meta, expanded summary + placeholder body
----------------------------------------------------------------- */
function ReadDrawer({ doc, onClose }: { doc: Document | null; onClose: () => void }) {
  const meta = doc ? CATEGORY_META[doc.category] : null;

  return (
    <Drawer
      open={!!doc}
      onClose={onClose}
      title={doc?.title ?? ''}
      subtitle={doc ? `${doc.author} · Updated ${doc.updatedAt}` : undefined}
      footer={
        doc?.url ? (
          <div className="flex justify-end">
            <Button
              variant="outline"
              onClick={() => window.open(doc.url, '_blank', 'noopener,noreferrer')}
            >
              Open original <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : undefined
      }
    >
      {doc && meta && (
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={meta.tone}>{meta.label}</Badge>
            {doc.pinned && (
              <span className="inline-flex items-center gap-1 font-mono text-[10px] font-medium uppercase tracking-[0.04em] text-[#FF3B30]">
                <Pin className="h-3 w-3" />
                Pinned
              </span>
            )}
            {typeof doc.readMins === 'number' && (
              <span className="inline-flex items-center gap-1 text-xs text-ink-mute">
                <Clock className="h-3.5 w-3.5 text-ink-faint" />
                {doc.readMins} min read
              </span>
            )}
          </div>

          {doc.summary && (
            <p className="mt-5 text-[15px] leading-relaxed text-ink">{doc.summary}</p>
          )}

          <div className="mt-6 space-y-4 text-sm leading-relaxed text-ink-soft">
            <SectionLabel>From the guide</SectionLabel>
            <p>
              Good mentorship is less about having the answers and more about
              asking the question that unlocks the next step. Start every session
              by reading where the mentee actually is &mdash; not where the
              roadmap says they should be. The gap between those two is the work.
            </p>
            <p>
              Hold the relative-versus-absolute lens in mind. A mentee shipping
              steadily through real external friction is outperforming one who
              coasts on an easy week. Reward effort and trajectory, not just raw
              output, and name what you&rsquo;re seeing so it becomes a shared
              vocabulary between you.
            </p>
            <p>
              Keep feedback specific, kind, and actionable. When you approve with
              notes, point to one thing done well and one thing to push on next
              time. When you request changes, make the path back obvious &mdash;
              the goal is momentum, never a dead end. Close by agreeing on the
              single most important thing to move before you next talk.
            </p>
            <p className="text-xs text-ink-faint">
              This is a shared organizational resource. The full version lives in
              the original document.
            </p>
          </div>
        </div>
      )}
    </Drawer>
  );
}
