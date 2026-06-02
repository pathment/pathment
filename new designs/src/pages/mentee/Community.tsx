import { useMemo, useState } from 'react';
import { Send, Sparkles, Trophy, MessageCircle, Smile, Heart, ThumbsUp } from 'lucide-react';
import { Page, PageHeader } from '@/components/Page';
import { Card, Badge, Button, Avatar, SectionLabel, cx } from '@/lib/ui';
import { SelectInput, TextArea, Segmented } from '@/components/overlays';
import { useStore } from '@/store/AppStore';

type PostType = 'kudos' | 'win' | 'question' | 'meme';

const TYPE_META: Record<PostType, { label: string; tone: 'brand' | 'emerald' | 'amber' | 'violet' }> = {
  kudos: { label: 'Kudos', tone: 'brand' },
  win: { label: 'Win', tone: 'emerald' },
  question: { label: 'Question', tone: 'amber' },
  meme: { label: 'Meme', tone: 'violet' },
};

interface Post {
  id: number;
  authorId: number;
  toId?: number;
  type: PostType;
  body: string;
  at: string;
  cheers: number;
  helpful: number;
}

export function Community() {
  const { mentees, currentMenteeId, getMentee } = useStore();
  const me = getMentee(currentMenteeId);
  const peers = useMemo(() => mentees.filter((m) => m.id !== currentMenteeId), [mentees, currentMenteeId]);

  const seed = useMemo<Post[]>(() => {
    const p = (authorId: number, type: PostType, body: string, at: string, cheers: number, helpful: number, toId?: number): Post => ({
      id: authorId * 10 + cheers,
      authorId,
      toId,
      type,
      body,
      at,
      cheers,
      helpful,
    });
    const ids = mentees.map((m) => m.id);
    const a = ids[1] ?? ids[0];
    const b = ids[2] ?? ids[0];
    const c = ids[3] ?? ids[0];
    return [
      p(a, 'kudos', `Huge shout-out to ${getMentee(currentMenteeId)?.name?.split(' ')[0] ?? 'a teammate'} for unblocking my auth flow late last night. Real one.`, '1h ago', 12, 4, currentMenteeId),
      p(b, 'win', 'Shipped my first deployed API today. Roadmap step 3 cleared. On to auth.', '3h ago', 18, 2),
      p(c, 'meme', 'When the roadmap auto-assigns your next task at 9:00 AM sharp and you have not finished your coffee.', '5h ago', 27, 1),
      p(a, 'question', 'Anyone have a clean pattern for promise chaining vs async/await? Keeps tripping me up.', '6h ago', 3, 9),
      p(b, 'kudos', 'Lunch engineering talk hit different today. Falling in love with the craft, slowly but surely.', '1d ago', 14, 3),
      p(c, 'meme', 'Weekend grind: 10 hours of focus, then family time. Balance is a feature, not a bug.', '1d ago', 21, 2),
    ];
  }, [mentees, currentMenteeId, getMentee]);

  const [posts, setPosts] = useState<Post[]>(seed);
  const [given, setGiven] = useState(0);

  // composer
  const [toId, setToId] = useState<string>('');
  const [type, setType] = useState<PostType>('kudos');
  const [body, setBody] = useState('');

  const post = () => {
    if (!body.trim()) return;
    setPosts((prev) => [
      {
        id: Date.now(),
        authorId: currentMenteeId,
        toId: toId ? Number(toId) : undefined,
        type,
        body: body.trim(),
        at: 'just now',
        cheers: 0,
        helpful: 0,
      },
      ...prev,
    ]);
    if (type === 'kudos') setGiven((g) => g + 1);
    setBody('');
    setToId('');
  };

  const react = (id: number, key: 'cheers' | 'helpful') =>
    setPosts((prev) => prev.map((p) => (p.id === id ? { ...p, [key]: p[key] + 1 } : p)));

  const forMe = posts.filter((p) => p.toId === currentMenteeId && p.authorId !== currentMenteeId);

  return (
    <Page>
      <PageHeader
        title="Community"
        subtitle="Cheer each other on, share wins, ask questions. Your cohort, in one place."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          {/* composer */}
          <Card className="p-5">
            <SectionLabel>Post to your cohort</SectionLabel>
            <div className="mb-3">
              <Segmented
                value={type}
                onChange={setType}
                options={[
                  { value: 'kudos', label: 'Kudos' },
                  { value: 'win', label: 'Win' },
                  { value: 'question', label: 'Question' },
                  { value: 'meme', label: 'Meme' },
                ]}
              />
            </div>
            {type === 'kudos' && (
              <div className="mb-3">
                <SelectInput value={toId} onChange={(e) => setToId(e.target.value)}>
                  <option value="">Who is this for?</option>
                  {peers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </SelectInput>
              </div>
            )}
            <TextArea
              rows={2}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={
                type === 'kudos'
                  ? 'Say thanks or hype someone up.'
                  : type === 'win'
                    ? 'Share what you shipped or learned.'
                    : type === 'question'
                      ? 'Ask your cohort for a hand.'
                      : 'Keep it light and kind.'
              }
            />
            <div className="mt-3 flex justify-end">
              <Button onClick={post} disabled={!body.trim()}>
                <Send className="h-4 w-4" /> Post
              </Button>
            </div>
          </Card>

          {/* feed */}
          <div className="space-y-3">
            {posts.map((p) => {
              const author = getMentee(p.authorId);
              const to = p.toId ? getMentee(p.toId) : undefined;
              const meta = TYPE_META[p.type];
              return (
                <Card key={p.id} className="p-4">
                  <div className="flex items-center gap-3">
                    <Avatar initials={author?.avatar ?? '?'} name={author?.name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-ink">{author?.name ?? 'Mentee'}</span>
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                        {to && (
                          <span className="text-xs text-ink-mute">
                            to <span className="font-medium text-ink-soft">{to.name.split(' ')[0]}</span>
                          </span>
                        )}
                        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-faint">{p.at}</span>
                      </div>
                    </div>
                  </div>
                  <p
                    className={cx(
                      'mt-2 text-sm leading-relaxed text-ink-soft',
                      p.type === 'meme' && 'rounded-r border border-hairline bg-neutral-50/60 px-3 py-3 text-ink',
                    )}
                  >
                    {p.body}
                  </p>
                  <div className="mt-3 flex items-center gap-3">
                    <button
                      onClick={() => react(p.id, 'cheers')}
                      className="rounded-r inline-flex items-center gap-1.5 border border-hairline px-2.5 py-1 text-xs text-ink-mute transition-colors hover:border-ink hover:text-ink"
                    >
                      <Heart className="h-3.5 w-3.5" /> Cheer <span className="tnum text-ink-faint">{p.cheers}</span>
                    </button>
                    <button
                      onClick={() => react(p.id, 'helpful')}
                      className="rounded-r inline-flex items-center gap-1.5 border border-hairline px-2.5 py-1 text-xs text-ink-mute transition-colors hover:border-ink hover:text-ink"
                    >
                      <ThumbsUp className="h-3.5 w-3.5" /> Helpful <span className="tnum text-ink-faint">{p.helpful}</span>
                    </button>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>

        {/* right rail */}
        <div className="space-y-4">
          <Card className="p-5">
            <SectionLabel>Motivation for you</SectionLabel>
            {forMe.length === 0 ? (
              <p className="text-sm text-ink-faint">No shout-outs yet. Give one and it tends to come back around.</p>
            ) : (
              <div className="space-y-2.5">
                {forMe.map((p) => {
                  const author = getMentee(p.authorId);
                  return (
                    <div key={p.id} className="rounded-r border border-hairline p-3">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-3.5 w-3.5 text-[#0066FF]" />
                        <span className="text-xs font-medium text-ink">{author?.name ?? 'A peer'}</span>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-ink-mute">{p.body}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <SectionLabel>Your community</SectionLabel>
            <div className="space-y-3">
              <Stat icon={Trophy} label="Shout-outs given" value={given} />
              <Stat icon={Heart} label="Cheers received" value={forMe.reduce((n, p) => n + p.cheers, 0)} />
              <Stat icon={MessageCircle} label="Posts in your cohort" value={posts.length} />
            </div>
            <div className="mt-4 flex items-start gap-2 rounded-r border border-dashed border-hairline p-3 text-xs text-ink-mute">
              <Smile className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {me ? me.name.split(' ')[0] : 'You'}, a kind word goes a long way. Cheering peers builds your streak.
            </div>
          </Card>
        </div>
      </div>
    </Page>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Trophy; label: string; value: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center border border-hairline text-ink-mute">
        <Icon className="h-4 w-4" />
      </span>
      <span className="flex-1 text-xs text-ink-mute">{label}</span>
      <span className="tnum text-sm font-semibold text-ink">{value}</span>
    </div>
  );
}
