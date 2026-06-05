'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Users, Loader2, PartyPopper, Trophy, HelpCircle, MessagesSquare, BookOpen, Smile, Sunrise,
  Heart, ThumbsUp, Lightbulb, Send, Search, MessageCircle, Pin, CheckCircle2, MoreHorizontal,
  Trash2, Flag, Link2, Hash, ChevronDown, ChevronRight, Shield, CornerDownRight,
  AtSign, Paperclip, X, Check,
} from 'lucide-react';
import { useCommunityHub, type CommunityPost, type CommunityComment, type CommunityPerson } from '@/lib/hooks/community/useCommunityHub';
import { communityApi, type PostType, type ReactionType } from '@/lib/services/community-api';
import FileUploader from '@/components/shared/FileUploader';

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
            <div className="absolute left-0 mt-1 w-60 bg-card border border-slate-200 rounded-xl shadow-lg z-20 p-2">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people…" className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-brand-500" />
              <div className="max-h-44 overflow-y-auto space-y-0.5">
                {filtered.length === 0 && <p className="text-xs text-slate-400 px-1 py-2">No one to mention.</p>}
                {filtered.map((p) => (
                  <button key={p.id} type="button" onClick={() => toggle(p.id)} className={`w-full text-left px-2 py-1.5 rounded-lg text-sm flex items-center justify-between ${value.includes(p.id) ? 'bg-brand-50 text-brand-700' : 'hover:bg-slate-50 text-slate-700'}`}>
                    {p.name}{value.includes(p.id) && <Check className="w-3.5 h-3.5" />}
                  </button>
                ))}
              </div>
            </div>
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

const Avatar = ({ text }: { text: string }) => (
  <div className="w-9 h-9 bg-brand-100 rounded-full flex items-center justify-center shrink-0">
    <span className="text-brand-700 text-xs font-medium">{text}</span>
  </div>
);

/* ── Comment thread ─────────────────────────────────────────────────────── */
function Thread({ post, canModerate, people, onChanged }: { post: CommunityPost; canModerate: boolean; people: CommunityPerson[]; onChanged: () => void }) {
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

  const canAccept = post.type === 'question' && (post.mine || canModerate);

  return (
    <div className="mt-3 border-t border-slate-100 pt-3 space-y-3">
      {loading ? (
        <div className="flex justify-center py-3"><Loader2 className="w-4 h-4 animate-spin text-slate-400" /></div>
      ) : (
        comments.map((c) => (
          <div key={c.id} className={`flex gap-2.5 ${c.parentId ? 'ml-7' : ''}`}>
            {c.parentId && <CornerDownRight className="w-3.5 h-3.5 text-slate-300 mt-2.5 shrink-0" />}
            <Avatar text={c.author.avatar} />
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
                {!c.parentId && <button onClick={() => setReplyTo(replyTo === c.id ? null : c.id)} className="hover:text-brand-600">Reply</button>}
                {canAccept && !c.accepted && <button onClick={() => accept(c.id)} className="hover:text-emerald-600">Accept answer</button>}
                {(c.mine || canModerate) && <button onClick={() => remove(c.id)} className="hover:text-red-600">Delete</button>}
              </div>
            </div>
          </div>
        ))
      )}

      <div className="space-y-2">
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
      </div>
    </div>
  );
}

/* ── Post card ──────────────────────────────────────────────────────────── */
function PostCard({ post, canModerate, hub }: { post: CommunityPost; canModerate: boolean; hub: ReturnType<typeof useCommunityHub> }) {
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const meta = TYPE_META[post.type] ?? TYPE_META.discussion;

  return (
    <div className={`bg-card rounded-2xl border p-5 ${post.pinned ? 'border-brand-200 ring-1 ring-brand-100' : 'border-slate-200'}`}>
      {post.pinned && <div className="flex items-center gap-1 text-xs font-medium text-brand-600 mb-2"><Pin className="w-3.5 h-3.5" />Pinned</div>}
      <div className="flex items-center gap-2.5">
        <Avatar text={post.author.avatar} />
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
          <button onClick={() => setMenu((m) => !m)} className="p-1 text-slate-400 hover:bg-slate-100 rounded-lg"><MoreHorizontal className="w-4 h-4" /></button>
          {menu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
              <div className="absolute right-0 mt-1 w-40 bg-card border border-slate-200 rounded-xl shadow-lg py-1 z-20 text-sm">
                {canModerate && (
                  <button onClick={() => { hub.pin(post.id, !post.pinned); setMenu(false); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-slate-700 hover:bg-slate-50">
                    <Pin className="w-3.5 h-3.5" />{post.pinned ? 'Unpin' : 'Pin'}
                  </button>
                )}
                {(post.mine || canModerate) && (
                  <button onClick={() => { hub.deletePost(post.id); setMenu(false); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-red-600 hover:bg-red-50">
                    <Trash2 className="w-3.5 h-3.5" />Delete
                  </button>
                )}
                <button onClick={() => { hub.report('post', post.id); setMenu(false); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-slate-700 hover:bg-slate-50">
                  <Flag className="w-3.5 h-3.5" />Report
                </button>
              </div>
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
      <p className={`mt-2 text-slate-700 ${post.type === 'meme' ? 'text-base' : 'text-sm'} whitespace-pre-wrap`}>{post.body}</p>

      {post.linkUrl && (
        <a href={post.linkUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-sm text-brand-600 hover:underline break-all">
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

      <div className="flex items-center flex-wrap gap-2 mt-3">
        {REACTIONS.map((r) => {
          const on = post.myReactions.includes(r.key);
          const count = post.reactions[r.key] || 0;
          return (
            <button key={r.key} onClick={() => hub.react(post.id, r.key)}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${on ? r.on : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
              <r.icon className="w-3.5 h-3.5" />{count > 0 && count}
            </button>
          );
        })}
        <button onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border border-slate-200 text-slate-600 hover:border-slate-300 ml-auto">
          <MessageCircle className="w-3.5 h-3.5" />{post.commentCount > 0 ? post.commentCount : ''} {open ? 'Hide' : 'Reply'}
        </button>
      </div>

      {open && <Thread post={post} canModerate={canModerate} people={hub.people} onChanged={hub.refetch} />}
    </div>
  );
}

/* ── Composer ───────────────────────────────────────────────────────────── */
function Composer({ hub }: { hub: ReturnType<typeof useCommunityHub> }) {
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
    if (okPost) { setTitle(''); setBody(''); setToId(''); setTags(''); setLinkUrl(''); setMentions([]); setFiles([]); setShowAttach(false); }
  };

  const field = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';

  return (
    <div className="bg-card rounded-2xl border border-slate-200 p-5 space-y-3">
      <div className="flex flex-wrap gap-2">
        {COMPOSER_TYPES.map((t) => {
          const m = TYPE_META[t];
          return (
            <button key={t} onClick={() => setType(t)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${type === t ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
              <m.icon className="w-4 h-4" />{m.label}
            </button>
          );
        })}
      </div>

      {type === 'kudos' && (
        <select value={toId} onChange={(e) => setToId(e.target.value)} className={field}>
          <option value="">Who&apos;s it for?</option>
          {hub.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      )}

      {needsTitle && (
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={type === 'question' ? 'Question title…' : 'Resource title…'} className={field} />
      )}

      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3}
        placeholder={type === 'question' ? 'Describe what you are stuck on…' : type === 'kudos' ? 'Give a shout-out…' : type === 'standup' ? 'What did you ship? What is blocking you?' : "Share what's up…"}
        className={`${field} resize-none`} />

      <div className="grid sm:grid-cols-2 gap-2">
        <div className="flex items-center gap-1.5 border border-slate-300 rounded-lg px-2.5">
          <Hash className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="tags, comma separated" className="w-full py-2 text-sm focus:outline-none" />
        </div>
        <div className="flex items-center gap-1.5 border border-slate-300 rounded-lg px-2.5">
          <Link2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="link (optional)" className="w-full py-2 text-sm focus:outline-none" />
        </div>
      </div>

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

function SpaceSwitcher({ hub }: { hub: ReturnType<typeof useCommunityHub> }) {
  return (
    <div className="bg-card rounded-2xl border border-slate-200 p-3">
      <p className="px-2 pt-1 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Spaces</p>
      <div className="space-y-1">
        {hub.spaces.map((s) => {
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
        })}
      </div>
    </div>
  );
}

/* ── Hub ─────────────────────────────────────────────────────────────────── */
export default function CommunityHub() {
  const hub = useCommunityHub();
  const [showMembers, setShowMembers] = useState(false);
  const canModerate = Boolean(hub.active?.isModerator);

  if (hub.loadingSpaces) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-brand-600" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-slate-900 mb-1">Community</h1>
        <p className="text-slate-600">Collaborate with your clan, get unstuck, and cheer each other on.</p>
      </div>

      <div className="grid lg:grid-cols-[260px_1fr_280px] gap-6">
        {/* Left — spaces */}
        <div className="space-y-4 order-1"><SpaceSwitcher hub={hub} /></div>

        {/* Center — composer + feed */}
        <div className="space-y-4 order-3 lg:order-2">
          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 bg-card border border-slate-200 rounded-lg px-2.5 flex-1 min-w-[180px]">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input value={hub.query} onChange={(e) => hub.setQuery(e.target.value)} placeholder={`Search ${hub.active?.name ?? ''}…`} className="w-full py-2 text-sm focus:outline-none" />
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {FILTER_TYPES.map((t) => (
              <button key={t ?? 'all'} onClick={() => hub.setTypeFilter(t)}
                className={`px-3 py-1 rounded-full text-xs font-medium border ${hub.typeFilter === t ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                {t ? TYPE_META[t].label : 'All'}
              </button>
            ))}
            {hub.tagFilter && (
              <button onClick={() => hub.setTagFilter(null)} className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border border-brand-300 bg-brand-50 text-brand-700">
                <Hash className="w-3 h-3" />{hub.tagFilter} ✕
              </button>
            )}
          </div>

          <Composer hub={hub} />

          {hub.loadingFeed ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-brand-600" /></div>
          ) : hub.error ? (
            <div className="bg-card rounded-2xl border border-slate-200 py-12 text-center">
              <p className="text-slate-600 mb-3">{hub.error}</p>
              <button onClick={hub.refetch} className="text-brand-600 hover:text-brand-700 text-sm font-medium">Try again</button>
            </div>
          ) : hub.feed.length === 0 ? (
            <div className="bg-card rounded-2xl border border-slate-200 py-12 text-center">
              <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-600">Nothing here yet — be the first to post in {hub.active?.name}.</p>
            </div>
          ) : (
            hub.feed.map((p) => <PostCard key={p.id} post={p} canModerate={canModerate} hub={hub} />)
          )}
        </div>

        {/* Right — context */}
        <div className="space-y-4 order-2 lg:order-3">
          {hub.shoutouts.length > 0 && (
            <div className="bg-card rounded-2xl border border-slate-200 p-5">
              <h3 className="font-semibold text-slate-900 mb-3">Motivation for you</h3>
              <div className="space-y-2">
                {hub.shoutouts.map((s) => (
                  <div key={s.id} className="p-3 rounded-xl bg-pink-50 border border-pink-100">
                    <p className="text-sm text-slate-700">{s.body}</p>
                    <p className="text-xs text-slate-400 mt-1">from {s.author.name}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {hub.stats && (
            <div className="bg-card rounded-2xl border border-slate-200 p-5">
              <h3 className="font-semibold text-slate-900 mb-3">This space</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Posts</span><span className="font-semibold text-slate-900">{hub.stats.posts}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Open questions</span><span className="font-semibold text-slate-900">{hub.stats.openQuestions}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Shout-outs given</span><span className="font-semibold text-slate-900">{hub.stats.given}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Cheers received</span><span className="font-semibold text-slate-900">{hub.stats.cheersReceived}</span></div>
              </div>
            </div>
          )}

          {/* Top contributors — recognition right where it's earned */}
          <div className="bg-card rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-slate-900 flex items-center gap-1.5"><Trophy className="w-4 h-4 text-amber-500" />Top contributors</h3>
              <div className="flex gap-1 text-xs">
                {(['week', 'all'] as const).map((p) => (
                  <button key={p} onClick={() => hub.setLbPeriod(p)}
                    className={`px-2 py-0.5 rounded-md ${hub.lbPeriod === p ? 'bg-brand-50 text-brand-700 font-medium' : 'text-slate-500 hover:bg-slate-50'}`}>
                    {p === 'week' ? 'This week' : 'All time'}
                  </button>
                ))}
              </div>
            </div>
            {hub.leaderboard.length === 0 ? (
              <p className="text-sm text-slate-500">No contributions yet — give kudos or answer a question to get on the board.</p>
            ) : (
              <div className="space-y-1">
                {hub.leaderboard.map((r) => (
                  <div key={r.userId} className={`flex items-center gap-2.5 px-1.5 py-1.5 rounded-lg ${r.mine ? 'bg-brand-50 dark:bg-brand-500/15' : ''}`}>
                    <span className={`w-5 text-center text-xs font-semibold tabular-nums shrink-0 ${r.rank <= 3 ? 'text-amber-500' : 'text-slate-400'}`}>{r.rank}</span>
                    <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center shrink-0"><span className="text-brand-700 text-[11px] font-medium">{r.avatar}</span></div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-800 truncate">{r.name}{r.mine && <span className="text-brand-500"> · you</span>}</p>
                      <p className="text-[11px] text-slate-400">{r.tier}</p>
                    </div>
                    <span className="text-sm font-semibold text-slate-900 tabular-nums shrink-0">{r.points}</span>
                  </div>
                ))}
              </div>
            )}
            {hub.myRank && !hub.leaderboard.some((r) => r.mine) && (
              <p className="mt-2 pt-2 border-t border-slate-100 text-xs text-slate-500">
                You: <span className="font-medium text-slate-700">{hub.myRank.tier}</span> · {hub.myRank.points} pts{hub.myRank.rank ? ` · #${hub.myRank.rank}` : ''} — climb by giving kudos &amp; answering questions.
              </p>
            )}
          </div>

          <div className="bg-card rounded-2xl border border-slate-200 p-5">
            <button onClick={() => setShowMembers((s) => !s)} className="w-full flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">Members ({hub.members.length})</h3>
              {showMembers ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
            </button>
            {showMembers && (
              <div className="mt-3 space-y-2">
                {hub.members.map((m) => (
                  <div key={m.id} className="flex items-center gap-2.5">
                    <Avatar text={m.avatar} />
                    <div className="min-w-0">
                      <p className="text-sm text-slate-800 truncate">{m.name}</p>
                      <p className="text-[11px] text-slate-400 capitalize">{m.role.replace('_', ' ')}</p>
                    </div>
                  </div>
                ))}
                {hub.members.length === 0 && <p className="text-sm text-slate-400">No members listed.</p>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
