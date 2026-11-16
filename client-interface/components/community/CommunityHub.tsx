'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Users, Loader2, PartyPopper, Trophy, HelpCircle, MessagesSquare, BookOpen, Smile, Sunrise,
  Heart, ThumbsUp, Lightbulb, Send, Search, MessageCircle, Pin, CheckCircle2, MoreHorizontal,
  Trash2, Flag, Link2, Hash, ChevronDown, ChevronRight, Shield, CornerDownRight,
  AtSign, Paperclip, X, Check, Plus,
} from 'lucide-react';
import { useCommunityHub, type CommunityPost, type CommunityComment, type CommunityPerson, type CommunitySpace } from '@/lib/hooks/community/useCommunityHub';
import { communityApi, type PostType, type ReactionType } from '@/lib/services/community-api';
import FileUploader from '@/components/shared/FileUploader';
import { MenuPanel } from '@/components/shared/MenuPanel';
import { ReportPostDialog } from '@/components/community/ReportPostDialog';
import { toExternalHref } from '@/lib/utils/url';
import { Avatar } from '@/components/shared/Avatar';
import { SelectMenu } from '@/components/shared/SelectMenu';
import { useProgramClans } from '@/lib/hooks/shared/useProgramClans';

/* ── Mention picker ─────────────────────────────────────────────────────── */
function MentionPicker({ people, value, onChange }: { people: CommunityPerson[]; value: string[]; onChange: (ids: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const selected = people.filter((p) => value.includes(p.id));
  const filtered = people.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  return (
    <div className="space-y-2">
      <div className="relative inline-block">
        <button type="button" onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:border-slate-300">
          <AtSign className="w-4 h-4" />Mention{value.length > 0 ? ` (${value.length})` : ''}
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <MenuPanel align="start" width="w-60" className="p-2">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people…" className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-brand-500" />
              <div className="max-h-44 overflow-y-auto space-y-0.5">
                {filtered.length === 0 && <p className="text-xs text-slate-400 px-1 py-2">No one to mention.</p>}
                {filtered.map((p) => (
                  <button key={p.id} type="button" onClick={() => toggle(p.id)} className={`w-full text-left px-2 py-1.5 rounded-lg text-sm flex items-center justify-between ${value.includes(p.id) ? 'bg-brand-50 text-brand-700' : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-700'}`}>
                    {p.name}{value.includes(p.id) && <Check className="w-3.5 h-3.5" />}
                  </button>
                ))}
              </div>
            </MenuPanel>
          </>
        )}
      </div>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((p) => (
            <span key={p.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-brand-50 text-brand-700">
              @{p.name}<button type="button" onClick={() => toggle(p.id)}><X className="w-3 h-3" /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

const TYPE_META: Record<PostType, { label: string; icon: typeof Trophy; cls: string }> = {
  kudos:      { label: 'Kudos',      icon: PartyPopper,    cls: 'bg-pink-100 text-pink-700' },
  win:        { label: 'Win',        icon: Trophy,         cls: 'bg-emerald-100 text-emerald-700' },
  question:   { label: 'Question',   icon: HelpCircle,     cls: 'bg-blue-100 text-blue-700' },
  discussion: { label: 'Discussion', icon: MessagesSquare, cls: 'bg-brand-100 text-brand-700' },
  resource:   { label: 'Resource',   icon: BookOpen,       cls: 'bg-violet-100 text-violet-700' },
  meme:       { label: 'Meme',       icon: Smile,          cls: 'bg-amber-100 text-amber-700' },
  standup:    { label: 'Standup',    icon: Sunrise,        cls: 'bg-slate-100 text-slate-700' },
};

const REACTIONS: { key: ReactionType; icon: typeof Heart; label: string; on: string }[] = [
  { key: 'cheers',     icon: Heart,     label: 'Cheers',     on: 'border-pink-300 bg-pink-50 text-pink-700' },
  { key: 'celebrate',  icon: PartyPopper, label: 'Celebrate', on: 'border-amber-300 bg-amber-50 text-amber-700' },
  { key: 'helpful',    icon: ThumbsUp,  label: 'Helpful',    on: 'border-brand-300 bg-brand-50 text-brand-700' },
  { key: 'insightful', icon: Lightbulb, label: 'Insightful', on: 'border-violet-300 bg-violet-50 text-violet-700' },
];

const COMPOSER_TYPES: PostType[] = ['discussion', 'question', 'win', 'kudos', 'resource', 'standup', 'meme'];
const FILTER_TYPES: (PostType | null)[] = [null, 'question', 'win', 'kudos', 'resource', 'discussion'];

function timeAgo(iso: string) {
  if (!iso) return '';
  const d = new Date(iso).getTime();
  const s = Math.floor((Date.now() - d) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString();
}

/* ── Comment thread ─────────────────────────────────────────────────────── */
function Thread({ post, canModerate, readOnly, people, onChanged }: { post: CommunityPost; canModerate: boolean; readOnly: boolean; people: CommunityPerson[]; onChanged: () => void }) {
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [mentions, setMentions] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try { setLoading(true); const r: any = await communityApi.comments(post.id); setComments(r?.data?.comments ?? []); }
    catch { setComments([]); } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [post.id]);

  const submit = async () => {
    if (!body.trim()) return;
    try {
      setBusy(true);
      await communityApi.addComment(post.id, { body: body.trim(), parentId: replyTo || undefined, mentionedUserIds: mentions.length ? mentions : undefined });
      setBody(''); setReplyTo(null); setMentions([]);
      await load(); onChanged();
    } catch { toast.error('Could not reply'); } finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    try { await communityApi.deleteComment(id); await load(); onChanged(); } catch { toast.error('Could not remove'); }
  };
  const accept = async (id: string) => {
    try { await communityApi.acceptAnswer(post.id, id); toast.success('Answer accepted'); await load(); onChanged(); }
    catch { toast.error('Could not accept'); }
  };

  const canAccept = !readOnly && post.type === 'question' && (post.mine || canModerate);

  return (
    <div className="mt-3 border-t border-slate-100 pt-3 space-y-3">
      {loading ? (
        <div className="flex justify-center py-3"><Loader2 className="w-4 h-4 animate-spin text-brand-600" /></div>
      ) : (
        comments.map((c) => (
          <div key={c.id} className={`flex gap-2.5 ${c.parentId ? 'ml-7' : ''}`}>
            {c.parentId && <CornerDownRight className="w-3.5 h-3.5 text-slate-300 mt-2.5 shrink-0" />}
            <Avatar name={c.author.name} initials={c.author.avatar} src={c.author.avatarUrl} size="md" />
            <div className="min-w-0 flex-1">
              <div className={`rounded-xl px-3 py-2 ${c.accepted ? 'bg-emerald-50 border border-emerald-200' : 'bg-slate-50'}`}>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-900">{c.author.name}</span>
                  <span className="text-xs text-slate-400">{timeAgo(c.at)}</span>
                  {c.accepted && <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700"><CheckCircle2 className="w-3.5 h-3.5" />Accepted</span>}
                </div>
                <p className="text-sm text-slate-700 mt-0.5 whitespace-pre-wrap">{c.body}</p>
              </div>
              <div className="flex items-center gap-3 mt-1 ml-1 text-xs text-slate-400">
                {!readOnly && !c.parentId && <button onClick={() => setReplyTo(replyTo === c.id ? null : c.id)} className="hover:text-brand-600">Reply</button>}
                {canAccept && !c.accepted && <button onClick={() => accept(c.id)} className="hover:text-emerald-600">Accept answer</button>}
                {!readOnly && (c.mine || canModerate) && <button onClick={() => remove(c.id)} className="hover:text-red-600">Delete</button>}
              </div>
            </div>
          </div>
        ))
      )}

      {!readOnly && <div className="space-y-2">
        <div className="flex items-center gap-2">
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
            placeholder={replyTo ? 'Write a threaded reply…' : 'Write a reply…'}
            className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <button onClick={submit} disabled={busy || !body.trim()} className="inline-flex items-center justify-center w-9 h-9 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-lg shrink-0">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
        {people.length > 0 && <MentionPicker people={people} value={mentions} onChange={setMentions} />}
      </div>}
    </div>
  );
}

/* ── Post card ──────────────────────────────────────────────────────────── */
function PostCard({ post, canModerate, hub }: { post: CommunityPost; canModerate: boolean; hub: ReturnType<typeof useCommunityHub> }) {
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [reporting, setReporting] = useState(false);
  const meta = TYPE_META[post.type] ?? TYPE_META.discussion;

  return (
    <div className={`bg-card rounded-3xl border p-6 shadow-sm ${post.pinned ? 'border-brand-200 ring-1 ring-brand-100' : 'border-slate-200'}`}>
      {post.pinned && <div className="flex items-center gap-1 text-xs font-medium text-brand-600 mb-2"><Pin className="w-3.5 h-3.5" />Pinned</div>}
      <div className="flex items-center gap-2.5">
        <Avatar name={post.author.name} initials={post.author.avatar} src={post.author.avatarUrl} size="md" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900">
            {post.author.name}
            {post.type === 'kudos' && post.recipient && <span className="text-slate-500 font-normal"> → {post.recipient.name}</span>}
          </p>
          <p className="text-xs text-slate-400">{timeAgo(post.at)}{post.editedAt ? ' · edited' : ''}</p>
        </div>
        <span className={`ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${meta.cls}`}>
          <meta.icon className="w-3 h-3" />{meta.label}
        </span>
        <div className="relative">
          <button aria-label="Post actions" onClick={() => setMenu((m) => !m)} className="p-1 text-slate-400 hover:bg-slate-100 rounded-lg"><MoreHorizontal className="w-4 h-4" /></button>
          {menu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
              <MenuPanel align="end" width="w-40" className="py-1 text-sm">
                {canModerate && (
                  <button onClick={() => { hub.pin(post.id, !post.pinned); setMenu(false); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-slate-700 dark:text-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">
                    <Pin className="w-3.5 h-3.5" />{post.pinned ? 'Unpin' : 'Pin'}
                  </button>
                )}
                {!hub.active?.readOnly && (post.mine || canModerate) && (
                  <button onClick={() => { hub.deletePost(post.id); setMenu(false); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10">
                    <Trash2 className="w-3.5 h-3.5" />Delete
                  </button>
                )}
                <button onClick={() => { setReporting(true); setMenu(false); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-slate-700 dark:text-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">
                  <Flag className="w-3.5 h-3.5" />Report
                </button>
              </MenuPanel>
            </>
          )}
        </div>
      </div>

      {post.title && (
        <div className="mt-3 flex items-center gap-2">
          <h3 className="font-semibold text-slate-900">{post.title}</h3>
          {post.type === 'question' && post.resolved && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700"><CheckCircle2 className="w-3 h-3" />Resolved</span>
          )}
        </div>
      )}
      <p className={`mt-4 leading-7 text-slate-700 ${post.type === 'meme' ? 'text-base' : 'text-sm'} whitespace-pre-wrap`}>{post.body}</p>

      {post.linkUrl && (
        <a href={toExternalHref(post.linkUrl)} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-sm text-brand-600 hover:underline break-all">
          <Link2 className="w-3.5 h-3.5 shrink-0" />{post.linkUrl}
        </a>
      )}

      {post.attachments?.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {post.attachments.map((a, i) => (
            a.kind === 'image' && a.url ? (
              <a key={i} href={a.url} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.url} alt={a.name || 'image'} className="rounded-xl border border-slate-200 max-h-52 w-full object-cover" />
              </a>
            ) : (
              <a key={i} href={a.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:border-slate-300 truncate">
                <Paperclip className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{a.name || 'Attachment'}</span>
              </a>
            )
          ))}
        </div>
      )}

      {post.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {post.tags.map((t) => (
            <button key={t} onClick={() => hub.setTagFilter(t)} className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600 hover:bg-slate-200">
              <Hash className="w-3 h-3" />{t}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center flex-wrap gap-2 mt-5 pt-4 border-t border-border">
        {REACTIONS.map((r) => {
          const on = post.myReactions.includes(r.key);
          const count = post.reactions[r.key] || 0;
          return (
            <button key={r.key} disabled={hub.active?.readOnly} aria-label={`${r.label}, ${count} reactions`} aria-pressed={on} title={r.label} onClick={() => hub.react(post.id, r.key)}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${on ? r.on : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
              <r.icon className="w-3.5 h-3.5" />{count > 0 && count}
            </button>
          );
        })}
        <button onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border border-slate-200 text-slate-600 hover:border-slate-300 ml-auto">
          <MessageCircle className="w-3.5 h-3.5" />{post.commentCount > 0 ? post.commentCount : ''} {open ? 'Hide' : hub.active?.readOnly ? 'View replies' : 'Reply'}
        </button>
      </div>

      {open && <Thread post={post} canModerate={canModerate} readOnly={!!hub.active?.readOnly} people={hub.people} onChanged={hub.refetch} />}

      <ReportPostDialog
        open={reporting}
        onClose={() => setReporting(false)}
        onSubmit={(reason) => hub.report('post', post.id, reason)}
      />
    </div>
  );
}

/* ── Composer ───────────────────────────────────────────────────────────── */
function Composer({ hub, onDone }: { hub: ReturnType<typeof useCommunityHub>; onDone?: () => void }) {
  const [type, setType] = useState<PostType>('discussion');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [toId, setToId] = useState('');
  const [tags, setTags] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [mentions, setMentions] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [showAttach, setShowAttach] = useState(false);
  const [posting, setPosting] = useState(false);

  const needsTitle = type === 'question' || type === 'resource';

  const submit = async () => {
    if (!body.trim()) { toast.error('Say something first'); return; }
    if (type === 'kudos' && !toId) { toast.error('Pick who the kudos is for'); return; }
    setPosting(true);

    let attachments: { url?: string; name?: string; kind?: string }[] | undefined;
    if (files.length) {
      try {
        const r: any = await communityApi.upload(files);
        attachments = r?.data?.attachments ?? [];
      } catch { toast.error('Could not upload attachment'); setPosting(false); return; }
    }

    const okPost = await hub.createPost({
      type,
      title: needsTitle && title.trim() ? title.trim() : undefined,
      body: body.trim(),
      toId: type === 'kudos' ? toId : undefined,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      linkUrl: linkUrl.trim() || undefined,
      mentionedUserIds: mentions.length ? mentions : undefined,
      attachments,
    });
    setPosting(false);
    if (okPost) {
      setTitle(''); setBody(''); setToId(''); setTags(''); setLinkUrl(''); setMentions([]); setFiles([]); setShowAttach(false);
      // Collapse back to the prompt: the thing you now want to see is your post.
      onDone?.();
    }
  };

  const field = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';

  return (
    <div className="space-y-3">
      {/*
          Post type as pills rather than a dropdown. What kind of thing you are
          writing changes the placeholder and the required fields, so it is not
          a setting to go and find — it is the first thing you choose, and in
          every community product it is visible.
      */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Post type">
          {COMPOSER_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={type === t}
              onClick={() => setType(t)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                type === t
                  ? 'border-brand-400 bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'
              }`}
            >
              {TYPE_META[t].label}
            </button>
          ))}
        </div>
        {onDone && (
          <button type="button" onClick={onDone} className="text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
            Cancel
          </button>
        )}
      </div>

      {type === 'kudos' && (
        <select aria-label="Shout-out recipient" value={toId} onChange={(e) => setToId(e.target.value)} className={field}>
          <option value="">Who&apos;s it for?</option>
          {hub.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      )}

      {needsTitle && (
        <input aria-label="Post title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={type === 'question' ? 'Question title…' : 'Resource title…'} className={field} />
      )}

      <textarea aria-label="Post content" value={body} onChange={(e) => setBody(e.target.value)} rows={3}
        placeholder={type === 'question' ? 'Describe what you are stuck on…' : type === 'kudos' ? 'Give a shout-out…' : type === 'standup' ? 'What did you ship? What is blocking you?' : "Share what's up…"}
        className={`${field} resize-none`} />

      <details><summary className="cursor-pointer text-xs font-medium text-muted-foreground">Add tags or a link (optional)</summary><div className="mt-3 grid sm:grid-cols-2 gap-2">
        <div className="flex items-center gap-1.5 border border-slate-300 rounded-lg px-2.5">
          <Hash className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <input aria-label="Post tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="tags, comma separated" className="w-full py-2 text-sm focus:outline-none" />
        </div>
        <div className="flex items-center gap-1.5 border border-slate-300 rounded-lg px-2.5">
          <Link2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <input aria-label="Post link" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="link (optional)" className="w-full py-2 text-sm focus:outline-none" />
        </div>
      </div></details>

      {showAttach && (
        <FileUploader files={files} onFilesAdded={(fs) => setFiles((prev) => [...prev, ...fs])} onFileRemoved={(i) => setFiles((prev) => prev.filter((_, idx) => idx !== i))} maxFiles={4} />
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {hub.people.length > 0 && <MentionPicker people={hub.people} value={mentions} onChange={setMentions} />}
        <button type="button" onClick={() => setShowAttach((s) => !s)} className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-sm ${showAttach || files.length ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
          <Paperclip className="w-4 h-4" />Attach{files.length ? ` (${files.length})` : ''}
        </button>
        <button onClick={submit} disabled={posting} className="ml-auto inline-flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">
          {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}Post
        </button>
      </div>
    </div>
  );
}

/* ── Space switcher ─────────────────────────────────────────────────────── */
const SPACE_ICON: Record<string, typeof Users> = { clan: Users, cohort: MessagesSquare, program: BookOpen, global: Sunrise };

/**
 * The spaces list.
 *
 * It used to be one flat column in whatever order the server built it, so a
 * fellowship that ended two years ago sat between the clan somebody works in
 * every day and the lounge, looking exactly the same. Finished programmes are
 * still worth having — that is the point of issue 6 — but they are history,
 * so they go below a divider that says so, and they come collapsed.
 */
function SpaceSwitcher({ hub }: { hub: ReturnType<typeof useCommunityHub> }) {
  const [showFinished, setShowFinished] = useState(false);
  /**
   * Narrowing the list by programme.
   *
   * A mentee is in two or three spaces and never needs this. An admin is now
   * shown every space they administer — forty-eight clans on this workspace —
   * and a sidebar of forty-eight names is not a sidebar. It appears only once
   * the list is long enough to be worth cutting down.
   */
  const { programs, programOf } = useProgramClans();
  const [programId, setProgramId] = useState('');
  const inProgram = (s: CommunitySpace) => {
    if (!programId) return true;
    if (s.type === 'program') return s.id === programId;
    if (s.type === 'clan') return programOf(s.id) === programId;
    // The Lounge and cohort spaces belong to no single programme, so a
    // programme filter should not pretend to have an opinion about them.
    return false;
  };
  /*
   * Finding one space among sixty. The list scrolls inside a fixed height
   * (the page no longer grows by a screen per twenty clans) and a search box
   * narrows it by name or programme; a search also opens the finished ones,
   * so a match is never hidden behind a collapsed section.
   */
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const matches = (s: CommunitySpace) => !q || `${s.name} ${s.subtitle || ''}`.toLowerCase().includes(q);
  const scoped = hub.spaces.filter(inProgram).filter(matches);
  const live = scoped.filter((s) => !s.workClosed);
  const finished = scoped.filter((s) => s.workClosed);
  const showFilter = programs.length > 1 && hub.spaces.length > 6;
  const showSearch = hub.spaces.length > 6;
  const finishedOpen = showFinished || Boolean(q);

  const row = (s: CommunitySpace) => {
    const Icon = SPACE_ICON[s.type] || Users;
    const active = s.key === hub.activeKey;
    return (
      <button key={s.key} onClick={() => hub.setActiveKey(s.key)}
        className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left transition-colors ${active ? 'bg-brand-50 text-brand-700' : 'hover:bg-slate-50 text-slate-700'}`}>
        <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-brand-600' : 'text-slate-400'}`} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium truncate">{s.name}</span>
          <span className="block text-[11px] text-slate-400 truncate">{s.subtitle}</span>
        </span>
        {s.isModerator && <Shield className="w-3.5 h-3.5 text-slate-300 shrink-0" />}
      </button>
    );
  };

  return (
    <div className="bg-card rounded-2xl border border-slate-200 p-3 xl:sticky xl:top-4">
      <p className="px-2 pt-1 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Spaces
        {showFilter && <span className="ml-1.5 font-normal normal-case tracking-normal text-slate-300">{scoped.length} of {hub.spaces.length}</span>}
      </p>
      {showFilter && (
        <div className="mb-2 px-0.5">
          <SelectMenu
            value={programId}
            onChange={setProgramId}
            ariaLabel="Filter spaces by program"
            options={[{ value: '', label: 'All programs' }, ...programs.map((p) => ({ value: p.id, label: p.label }))]}
          />
        </div>
      )}
      {showSearch && (
        <div className="relative mb-2 px-0.5">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a space…"
            aria-label="Find a space"
            className="w-full rounded-xl border border-border bg-card py-2 pl-8 pr-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      )}
      <div className="max-h-80 overflow-y-auto overscroll-contain pr-1 xl:max-h-[calc(100vh-15rem)]">
      <div className="space-y-1">{live.map(row)}</div>
      {scoped.length === 0 && (
        <p className="px-2.5 py-3 text-xs text-slate-400">{q ? `No space matches “${query.trim()}”.` : 'No spaces in this program.'}</p>
      )}

      {finished.length > 0 && (
        <div className="mt-2 border-t border-border pt-2">
          <button
            onClick={() => setShowFinished((v) => !v)}
            aria-expanded={finishedOpen}
            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-left text-slate-500 hover:bg-slate-50"
          >
            {finishedOpen ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
            <span className="text-xs font-semibold uppercase tracking-wide">Finished</span>
            <span className="ml-auto text-[11px] tabular-nums text-slate-400">{finished.length}</span>
          </button>
          {finishedOpen && (
            <div className="mt-1 space-y-1">
              {finished.map(row)}
              <p className="px-2.5 pt-1 pb-0.5 text-[11px] leading-relaxed text-slate-400">
                The programme is closed, the conversation is not — you can still post here.
              </p>
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
}

/* ── Space rail ──────────────────────────────────────────────────────────── */

/**
 * Everything that is true of the SPACE rather than of any one post.
 *
 * It used to be four separate cards in a column of their own, which only
 * became a column at 2xl — 1536px. Below that the grid dropped to two and the
 * four cards fell underneath the feed, so the common case was a long stack of
 * nearly-empty boxes reading "Posts 1 / Open questions 0 / Shout-outs 0 /
 * Cheers 0", then one contributor, then a members toggle. A lot of screen for
 * almost no information.
 *
 * One component now, rendered in the rail on a wide screen and folded into a
 * single disclosure below the feed on a narrow one, so it is never four boxes
 * of zeroes.
 */
function SpaceRail({ hub, showMembers, onToggleMembers }: {
  hub: ReturnType<typeof useCommunityHub>;
  showMembers: boolean;
  onToggleMembers: () => void;
}) {
  const stats = hub.stats;
  return (
    <div className="space-y-4">
      {hub.shoutouts.length > 0 && (
        <section className="rounded-2xl border border-border bg-card p-4">
          <h3 className="mb-2.5 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <Heart className="h-4 w-4 text-pink-500" aria-hidden />Motivation for you
          </h3>
          <div className="space-y-2">
            {hub.shoutouts.map((s) => (
              <div key={s.id} className="rounded-xl border border-pink-100 bg-pink-50/70 p-3 dark:border-pink-500/20 dark:bg-pink-500/10">
                <p className="text-sm text-slate-700 dark:text-slate-200">{s.body}</p>
                <p className="mt-1 text-xs text-slate-400">from {s.author.name}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Four numbers as a grid, not as four rows of a table. */}
      {stats && (
        <section className="rounded-2xl border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">This space</h3>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Posts', value: stats.posts },
              { label: 'Open questions', value: stats.openQuestions, warn: stats.openQuestions > 0 },
              { label: 'Shout-outs given', value: stats.given },
              { label: 'Cheers received', value: stats.cheersReceived },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-border/70 px-3 py-2.5">
                <p className={`text-lg font-semibold tabular-nums ${s.warn ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-slate-100'}`}>{s.value}</p>
                <p className="text-[11px] leading-tight text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <Trophy className="h-4 w-4 text-amber-500" aria-hidden />Top contributors
          </h3>
          <div className="flex gap-0.5 rounded-lg border border-border p-0.5 text-xs">
            {(['week', 'all'] as const).map((period) => (
              <button key={period} onClick={() => hub.setLbPeriod(period)} aria-pressed={hub.lbPeriod === period}
                className={`rounded-md px-2 py-0.5 ${hub.lbPeriod === period ? 'bg-brand-600 text-white' : 'text-muted-foreground hover:text-foreground'}`}>
                {period === 'week' ? 'Week' : 'All'}
              </button>
            ))}
          </div>
        </div>
        {hub.leaderboard.length === 0 ? (
          <p className="text-sm text-muted-foreground">No contributions yet. Give kudos or answer a question to get on the board.</p>
        ) : (
          <ol className="space-y-1">
            {hub.leaderboard.map((r) => (
              <li key={r.userId} className={`flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 ${r.mine ? 'bg-brand-50 dark:bg-brand-500/15' : ''}`}>
                <span className={`w-5 shrink-0 text-center text-xs font-semibold tabular-nums ${r.rank <= 3 ? 'text-amber-500' : 'text-slate-400'}`}>{r.rank}</span>
                <Avatar name={r.name} src={r.avatarUrl} initials={r.avatar} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-slate-800 dark:text-slate-200">{r.name}{r.mine && <span className="text-brand-500"> · you</span>}</p>
                  <p className="text-[11px] text-slate-400">{r.tier}</p>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">{r.points}</span>
              </li>
            ))}
          </ol>
        )}
        {hub.myRank && !hub.leaderboard.some((r) => r.mine) && (
          <p className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">
            You: <span className="font-medium text-slate-700 dark:text-slate-300">{hub.myRank.tier}</span> · {hub.myRank.points} pts{hub.myRank.rank ? ` · #${hub.myRank.rank}` : ''}
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-4">
        <button onClick={onToggleMembers} aria-expanded={showMembers} className="flex w-full items-center justify-between">
          <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <Users className="h-4 w-4 text-brand-600" aria-hidden />Members ({hub.memberTotal})
          </h3>
          <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${showMembers ? 'rotate-180' : ''}`} aria-hidden />
        </button>
        {showMembers && (
          <div className="mt-3 space-y-3">
            {/* Searched on the server: a programme space holds more people
                than are ever downloaded, so filtering here would only ever
                search the page already on screen. */}
            <input
              aria-label="Search members"
              value={hub.memberQuery}
              onChange={(e) => hub.searchMembers(e.target.value)}
              placeholder="Search members…"
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <ul className="space-y-2">
              {hub.members.map((m) => (
                <li key={m.id} className="flex items-center gap-2.5">
                  <Avatar name={m.name} initials={m.avatar} src={m.avatarUrl} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate text-sm text-slate-800 dark:text-slate-200">{m.name}</p>
                    <p className="text-[11px] capitalize text-slate-400">{m.role.replace('_', ' ')}</p>
                  </div>
                </li>
              ))}
            </ul>
            {hub.members.length === 0 && (
              <p className="text-sm text-muted-foreground">{hub.memberQuery ? 'Nobody matches that name.' : 'No members listed.'}</p>
            )}
            {hub.hasMoreMembers && (
              <button onClick={hub.showMoreMembers} className="w-full rounded-xl border border-border px-3 py-2 text-sm font-medium text-brand-700 hover:bg-muted">
                Show more ({hub.memberTotal - hub.members.length} more)
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

/* ── Hub ─────────────────────────────────────────────────────────────────── */

/** How the feed is ordered. All three sort what is already loaded. */
const SORTS = [
  { key: 'latest', label: 'Latest activity' },
  { key: 'reactions', label: 'Most reactions' },
  { key: 'unanswered', label: 'Unanswered first' },
] as const;
type SortKey = (typeof SORTS)[number]['key'];

/**
 * The community, for whoever is looking at it.
 *
 * One component for all three portals. What differs between a mentee, a
 * mentor and an admin is never the layout — it is which SPACES they are in,
 * and that is decided on the server from their clan memberships and
 * enrolments. An admin moderates everywhere they can see; a lead mentor
 * moderates their clan; a mentee moderates nothing. Rendering three versions
 * of this screen would mean three places for them to drift apart.
 */
export default function CommunityHub() {
  const hub = useCommunityHub();
  const [showMembers, setShowMembers] = useState(false);
  const [composing, setComposing] = useState(false);
  const [sort, setSort] = useState<SortKey>('latest');
  /** Questions nobody has answered — the only backlog this screen has. */
  const [unsolvedOnly, setUnsolvedOnly] = useState(false);
  const canModerate = Boolean(hub.active?.isModerator && !hub.active?.readOnly);

  const reactionTotal = (p: CommunityPost) =>
    Object.values(p.reactions || {}).reduce((sum, n) => sum + (n || 0), 0);

  /**
   * Pinned first, always. After that the chosen order, applied to what the
   * server already sent — the feed is one page, so this is a reorder rather
   * than a different query, and it says "Latest activity" rather than
   * promising a ranking it cannot compute.
   */
  const feed = useMemo(() => {
    const rows = unsolvedOnly
      ? hub.feed.filter((p) => p.type === 'question' && !p.resolved)
      : hub.feed;
    const ordered = [...rows];
    if (sort === 'reactions') ordered.sort((a, b) => reactionTotal(b) - reactionTotal(a));
    else if (sort === 'unanswered') ordered.sort((a, b) => Number(a.commentCount > 0) - Number(b.commentCount > 0));
    return ordered.sort((a, b) => Number(b.pinned) - Number(a.pinned));
  }, [hub.feed, sort, unsolvedOnly]);

  if (hub.loadingSpaces) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-brand-600" /></div>;
  }

  const space = hub.active;
  const openQuestions = hub.stats?.openQuestions ?? 0;

  return (
    <div className="space-y-4">
      {/*
          The space, named. The old header said "Community" over every space
          alike, so the one piece of context that changes as you move around —
          which clan you are reading — was only visible as a highlight in a
          sidebar that disappears on a narrow screen.
      */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/10">
            <Users className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl">
                {space?.name ?? 'Community'}
              </h1>
              {space?.subtitle && (
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">{space.subtitle}</span>
              )}
              {space?.workClosed && (
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">Programme finished</span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Collaborate with your clan, get unstuck, and cheer each other on.
            </p>
          </div>
        </div>
        {!space?.readOnly && (
          <button
            type="button"
            onClick={() => setComposing(true)}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" aria-hidden />Create post
          </button>
        )}
      </header>

      {/*
          Three columns from xl rather than 2xl. The rail used to need a
          1536px window to exist at all, which is wider than most laptops —
          so for nearly everybody it fell under the feed.
      */}
      <div className="grid gap-5 xl:grid-cols-[232px_minmax(0,1fr)_300px]">
        <div className="min-w-0 xl:order-1"><SpaceSwitcher hub={hub} /></div>

        <div className="order-2 min-w-0 space-y-4">
          {/* Search, order and the unsolved backlog on one line. */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex min-w-[200px] flex-1 items-center gap-1.5 rounded-xl border border-border bg-card px-2.5">
              <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
              <input value={hub.query} onChange={(e) => hub.setQuery(e.target.value)} aria-label="Search community posts"
                placeholder={`Search ${space?.name ?? ''}…`} className="w-full bg-transparent py-2 text-sm focus:outline-none" />
            </div>
            <select
              aria-label="Sort posts"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="rounded-xl border border-border bg-card px-3 py-2 text-sm"
            >
              {SORTS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
            <button
              type="button"
              aria-pressed={unsolvedOnly}
              onClick={() => setUnsolvedOnly((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                unsolvedOnly
                  ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300'
                  : 'border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              <HelpCircle className="h-4 w-4" aria-hidden />
              Unanswered{openQuestions ? ` (${openQuestions})` : ''}
            </button>
          </div>

          {/* Scrolls sideways on a phone instead of wrapping to three rows. */}
          <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-0.5">
            {FILTER_TYPES.map((t) => (
              <button key={t ?? 'all'} aria-pressed={hub.typeFilter === t} onClick={() => hub.setTypeFilter(t)}
                className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  hub.typeFilter === t
                    ? 'border-brand-400 bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300'
                    : 'border-border text-muted-foreground hover:text-foreground'
                }`}>
                {t ? TYPE_META[t].label : 'All'}
              </button>
            ))}
            {hub.tagFilter && (
              <button onClick={() => hub.setTagFilter(null)} className="inline-flex shrink-0 items-center gap-1 rounded-full border border-brand-300 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
                <Hash className="h-3 w-3" aria-hidden />{hub.tagFilter} ✕
              </button>
            )}
          </div>

          {space?.readOnly ? (
            <p className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
              This space has been archived by an administrator.
            </p>
          ) : composing ? (
            <div className="rounded-2xl border border-border bg-card p-4">
              <Composer hub={hub} onDone={() => setComposing(false)} />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setComposing(true)}
              className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-left text-sm text-muted-foreground transition-colors hover:border-brand-300 hover:bg-brand-50/40"
            >
              <MessagesSquare className="h-5 w-5 shrink-0 text-brand-600" aria-hidden />
              Share a win, ask a question, or help your clan
              <span className="ml-auto shrink-0 text-xs font-medium text-brand-700">Post</span>
            </button>
          )}

          {hub.loadingFeed ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-brand-600" /></div>
          ) : hub.error ? (
            <div className="rounded-2xl border border-border bg-card py-12 text-center">
              <p className="mb-3 text-muted-foreground">{hub.error}</p>
              <button onClick={hub.refetch} className="text-sm font-medium text-brand-600 hover:text-brand-700">Try again</button>
            </div>
          ) : feed.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card py-12 text-center">
              <Users className="mx-auto mb-3 h-10 w-10 text-slate-300" aria-hidden />
              <p className="text-muted-foreground">
                {unsolvedOnly ? 'No unanswered questions here — the clan is keeping up.'
                  : hub.query || hub.typeFilter || hub.tagFilter ? 'Nothing matches these filters.'
                    : `Nothing here yet — be the first to post in ${space?.name ?? 'this space'}.`}
              </p>
            </div>
          ) : (
            feed.map((p: CommunityPost) => <PostCard key={p.id} post={p} canModerate={canModerate} hub={hub} />)
          )}
        </div>

        {/* Sticky on a wide screen so it stays with you down a long feed. */}
        <aside className="order-3 hidden min-w-0 xl:block">
          <div className="sticky top-4">
            <SpaceRail hub={hub} showMembers={showMembers} onToggleMembers={() => setShowMembers((v) => !v)} />
          </div>
        </aside>

        {/* …and one disclosure below the feed when there is no room for it. */}
        <details className="order-4 rounded-2xl border border-border bg-card xl:hidden">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
            About this space{hub.memberTotal ? ` · ${hub.memberTotal} members` : ''}
          </summary>
          <div className="border-t border-border p-3">
            <SpaceRail hub={hub} showMembers={showMembers} onToggleMembers={() => setShowMembers((v) => !v)} />
          </div>
        </details>
      </div>
    </div>
  );
}
