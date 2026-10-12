'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Video,
  Search,
  Plus,
  Trash2,
  ExternalLink,
  Clock,
  Loader2,
  Pencil,
  Tag,
  FolderPlus,
  User,
  Check,
} from 'lucide-react';
import { useTalks, type TalkItem, type TalkCategory } from '@/lib/hooks/mentor/useTalks';
import { talksApi } from '@/lib/services/talks-api';
import { Drawer } from '@/components/shared/Drawer';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { useConfirm } from '@/lib/context/ConfirmContext';
import { toExternalHref } from '@/lib/utils/url';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { usePermissions } from '@/lib/hooks/usePermissions';

export default function TalksView() {
  const confirm = useConfirm();
  const { can } = usePermissions();
  const canManageCategories = can('system.settings');

  const [rawSearch, setRawSearch] = useState('');
  const search = useDebounce(rawSearch, 300);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const {
    talks,
    categories,
    loading,
    error,
    refetch,
    refetchCategories,
  } = useTalks({
    search,
    categoryId: selectedCategory === 'all' ? '' : selectedCategory,
  });

  const [editingTalk, setEditingTalk] = useState<TalkItem | 'new' | null>(null);
  const [categoriesDrawerOpen, setCategoriesDrawerOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const handleDeleteTalk = async (talk: TalkItem) => {
    if (
      await confirm({
        title: 'Delete this talk?',
        message: `"${talk.title}" will be permanently removed from the library.`,
        variant: 'danger',
        confirmLabel: 'Delete',
      })
    ) {
      try {
        setBusy(talk.id);
        await talksApi.remove(talk.id);
        toast.success('Talk removed');
        await refetch();
        await refetchCategories();
      } catch (e) {
        toast.error(extractApiErrorMessage(e, 'Could not delete talk'));
      } finally {
        setBusy(null);
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-3xl border border-border bg-card p-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground mb-2">Talks Library</h1>
          <p className="text-slate-600 dark:text-slate-400">
            A centralized library of talks and workshops shared by mentors and admins across the platform.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canManageCategories && (
            <button
              onClick={() => setCategoriesDrawerOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted shrink-0 transition-colors"
            >
              <FolderPlus className="w-4 h-4 text-slate-500" /> Manage categories
            </button>
          )}
          <button
            onClick={() => setEditingTalk('new')}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 shrink-0 shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" /> Add talk
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={rawSearch}
            onChange={(e) => setRawSearch(e.target.value)}
            aria-label="Search talks"
            placeholder="Search talks by title, speaker, or keywords…"
            className="w-full border border-slate-200 dark:border-slate-800 rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-card text-foreground"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1 p-1 bg-muted rounded-xl">
          <button
            aria-pressed={selectedCategory === 'all'}
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              selectedCategory === 'all'
                ? 'bg-card text-brand-700 dark:text-brand-400 shadow-sm'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              aria-pressed={selectedCategory === c.id}
              onClick={() => setSelectedCategory(c.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-1.5 ${
                selectedCategory === c.id
                  ? 'bg-card text-brand-700 dark:text-brand-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <span>{c.name}</span>
              {typeof c.talkCount === 'number' && c.talkCount > 0 && (
                <span className="text-xs px-1.5 py-0.2 bg-slate-200/60 dark:bg-slate-700/60 rounded-full">
                  {c.talkCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-7 h-7 animate-spin text-brand-600" />
        </div>
      ) : error ? (
        <div className="bg-card rounded-2xl border border-slate-200 dark:border-slate-800 py-16 text-center text-slate-600 dark:text-slate-400">
          {error}
        </div>
      ) : talks.length === 0 ? (
        <div className="bg-card rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 py-16 text-center">
          <Video className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-slate-600 dark:text-slate-400">
            {rawSearch || selectedCategory !== 'all' ? 'No talks match your search or filter.' : 'No talks added yet.'}
          </p>
          <button
            onClick={() => setEditingTalk('new')}
            className="mt-3 text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
          >
            Add the first talk →
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {talks.map((t) => (
            <TalkCard
              key={t.id}
              talk={t}
              busy={busy === t.id}
              onEdit={() => setEditingTalk(t)}
              onDelete={() => handleDeleteTalk(t)}
            />
          ))}
        </div>
      )}

      {editingTalk && (
        <TalkEditorDrawer
          talk={editingTalk === 'new' ? null : editingTalk}
          categories={categories}
          onClose={() => setEditingTalk(null)}
          onSaved={() => {
            setEditingTalk(null);
            refetch();
            refetchCategories();
          }}
        />
      )}

      {categoriesDrawerOpen && (
        <CategoriesManagerDrawer
          categories={categories}
          onClose={() => setCategoriesDrawerOpen(false)}
          onChanged={() => {
            refetchCategories();
            refetch();
          }}
        />
      )}
    </div>
  );
}

function TalkCard({
  talk,
  busy,
  onEdit,
  onDelete,
}: {
  talk: TalkItem;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group relative bg-card rounded-3xl border border-border p-6 flex flex-col transition-all hover:shadow-sm hover:border-brand-300 dark:hover:border-brand-600">
      <div className="flex items-start justify-between gap-3">
        <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-400 shrink-0">
          <Video className="w-5 h-5" />
        </div>
        {talk.canManage && (
          <div className="flex items-center gap-0.5 opacity-90 group-hover:opacity-100">
            <button
              onClick={onEdit}
              disabled={busy}
              title="Edit talk"
              className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 transition-colors"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              onClick={onDelete}
              disabled={busy}
              title="Delete talk"
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mt-3">
        {talk.categories.map((c) => (
          <span
            key={c.id}
            className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-400 border border-brand-200/50 dark:border-brand-500/20"
          >
            {c.name}
          </span>
        ))}
      </div>

      <a
        href={toExternalHref(talk.url)}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 block text-left group-hover:text-brand-700 dark:group-hover:text-brand-400 transition-colors"
      >
        <h3 className="text-lg font-semibold text-foreground leading-snug">{talk.title}</h3>
      </a>

      {talk.speaker && (
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1">
          <User className="w-3.5 h-3.5" /> {talk.speaker}
        </p>
      )}

      {talk.description && (
        <p className="text-sm text-muted-foreground mt-2.5 leading-relaxed line-clamp-3">
          {talk.description}
        </p>
      )}

      <div className="mt-auto pt-4 border-t border-border flex items-center gap-2 text-xs text-slate-400">
        {talk.durationMins ? (
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" /> {talk.durationMins} min
          </span>
        ) : null}
        {talk.uploaderName && (
          <span className="truncate max-w-[140px]" title={`Added by ${talk.uploaderName}`}>
            By {talk.uploaderName}
          </span>
        )}
        <a
          href={toExternalHref(talk.url)}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto inline-flex items-center gap-1 text-brand-600 hover:text-brand-700 dark:text-brand-400 font-medium transition-colors"
        >
          Watch <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  );
}

function TalkEditorDrawer({
  talk,
  categories,
  onClose,
  onSaved,
}: {
  talk: TalkItem | null;
  categories: TalkCategory[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(talk?.title || '');
  const [speaker, setSpeaker] = useState(talk?.speaker || '');
  const [url, setUrl] = useState(talk?.url || '');
  const [durationMins, setDurationMins] = useState(talk?.durationMins ? String(talk.durationMins) : '');
  const [description, setDescription] = useState(talk?.description || '');
  const [selectedCatIds, setSelectedCatIds] = useState<string[]>(
    talk ? talk.categories.map((c) => c.id) : categories[0] ? [categories[0].id] : []
  );
  const [saving, setSaving] = useState(false);

  const toggleCategory = (id: string) => {
    setSelectedCatIds((prev) =>
      prev.includes(id) ? prev.filter((catId) => catId !== id) : [...prev, id]
    );
  };

  const save = async () => {
    if (!title.trim()) {
      toast.error('A title is required');
      return;
    }
    if (!url.trim()) {
      toast.error('A talk resource link is required');
      return;
    }
    if (!selectedCatIds.length) {
      toast.error('Please select at least one category');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        speaker: speaker.trim() || undefined,
        url: url.trim(),
        durationMins: durationMins ? Number(durationMins) : null,
        description: description.trim() || undefined,
        categoryIds: selectedCatIds,
      };

      if (talk) {
        await talksApi.update(talk.id, payload);
        toast.success('Talk updated');
      } else {
        await talksApi.create(payload);
        toast.success('Talk added to library');
      }
      onSaved();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not save talk'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title={talk ? 'Edit talk' : 'Add new talk'}
      subtitle="Share an inspiring or technical talk with mentors and admins"
      width="lg"
      footer={
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50 inline-flex items-center gap-2 shadow-sm transition-colors"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {talk ? 'Save changes' : 'Add talk'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Talk Title <span className="text-rose-500">*</span>
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. How great leaders inspire action"
            className="w-full border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-card text-foreground"
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Speaker / Presenter
            </label>
            <input
              value={speaker}
              onChange={(e) => setSpeaker(e.target.value)}
              placeholder="e.g. Simon Sinek"
              className="w-full border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-card text-foreground"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Duration (minutes)
            </label>
            <input
              type="number"
              min={1}
              value={durationMins}
              onChange={(e) => setDurationMins(e.target.value)}
              placeholder="e.g. 18"
              className="w-full border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-card text-foreground"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Resource URL <span className="text-rose-500">*</span>
          </label>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://youtube.com/watch?v=..."
            className="w-full border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-card text-foreground"
          />
          <p className="mt-1 text-xs text-slate-400">
            YouTube, Vimeo, Loom, or recording link. Duplicate links are automatically prevented.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            Categories <span className="text-rose-500">*</span>{' '}
            <span className="text-slate-400 font-normal">(select one or more)</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => {
              const active = selectedCatIds.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleCategory(c.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                    active
                      ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300'
                      : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {active && <Check className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />}
                  <span>{c.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Description & Key Takeaways
          </label>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Summarize the core message or why mentors should share this with their mentees…"
            className="w-full border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-card text-foreground"
          />
        </div>
      </div>
    </Drawer>
  );
}

function CategoriesManagerDrawer({
  categories,
  onClose,
  onChanged,
}: {
  categories: TalkCategory[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const confirm = useConfirm();
  const [newCatName, setNewCatName] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [busy, setBusy] = useState(false);

  const handleCreate = async () => {
    if (!newCatName.trim()) return;
    setCreating(true);
    try {
      await talksApi.createCategory(newCatName.trim());
      toast.success('Category added');
      setNewCatName('');
      onChanged();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not create category'));
    } finally {
      setCreating(false);
    }
  };

  const handleUpdate = async (id: string) => {
    if (!editName.trim()) return;
    setBusy(true);
    try {
      await talksApi.updateCategory(id, editName.trim());
      toast.success('Category renamed');
      setEditingId(null);
      onChanged();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not update category'));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (cat: TalkCategory) => {
    if (
      await confirm({
        title: `Delete category "${cat.name}"?`,
        message: 'Categories with existing talks cannot be deleted until the talks are moved.',
        variant: 'danger',
        confirmLabel: 'Delete',
      })
    ) {
      setBusy(true);
      try {
        await talksApi.removeCategory(cat.id);
        toast.success('Category removed');
        onChanged();
      } catch (e) {
        toast.error(extractApiErrorMessage(e, 'Could not remove category'));
      } finally {
        setBusy(false);
      }
    }
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title="Manage Talk Categories"
      subtitle="Organize talks by topic, discipline, or focus area"
      width="md"
    >
      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            Create new category
          </label>
          <div className="flex gap-2">
            <input
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              placeholder="e.g. System Design, Public Speaking"
              className="flex-1 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-card text-foreground"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate();
              }}
            />
            <button
              onClick={handleCreate}
              disabled={creating || !newCatName.trim()}
              className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50 inline-flex items-center gap-1.5 shrink-0 transition-colors"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add
            </button>
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
            Existing Categories ({categories.length})
          </h3>
          <div className="space-y-2">
            {categories.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-card hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
              >
                {editingId === c.id ? (
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="flex-1 border border-brand-500 rounded px-2 py-1 text-sm bg-card text-foreground"
                      autoFocus
                    />
                    <button
                      onClick={() => handleUpdate(c.id)}
                      disabled={busy}
                      className="px-2.5 py-1 rounded bg-brand-600 text-white text-xs font-medium"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-2.5 py-1 rounded border text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 truncate">
                      <Tag className="w-4 h-4 text-slate-400 shrink-0" />
                      <span className="text-sm font-medium text-foreground truncate">{c.name}</span>
                      {typeof c.talkCount === 'number' && (
                        <span className="text-xs text-slate-400">({c.talkCount} talks)</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => {
                          setEditingId(c.id);
                          setEditName(c.name);
                        }}
                        disabled={busy}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        title="Rename"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(c)}
                        disabled={busy}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                        title="Delete category"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Drawer>
  );
}
