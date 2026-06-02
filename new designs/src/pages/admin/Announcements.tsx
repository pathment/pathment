import { useMemo, useState } from 'react';
import { Pin, Send, ThumbsUp, CheckCircle2, Megaphone } from 'lucide-react';
import { Page, PageHeader } from '@/components/Page';
import { Card, Badge, Button, Avatar, SectionLabel, cx } from '@/lib/ui';
import { Field, TextInput, TextArea, SelectInput } from '@/components/overlays';
import { useStore } from '@/store/AppStore';

/* ----------------------------------------------------------------
   Org announcements - the single channel that replaces scattered
   WhatsApp threads. One source of truth, in-app, searchable, pinned.
----------------------------------------------------------------- */

type Reactions = { acknowledged: number; helpful: number };

interface Announcement {
  id: number;
  author: string;
  avatar: string;
  role: string;
  audience: string; // 'All programs' or a program name
  body: string;
  at: string; // relative time, already formatted
  pinned: boolean;
  reactions: Reactions;
}

const ALL = 'All programs';

const SEED: Announcement[] = [
  {
    id: 1001,
    author: 'Sarah Chen',
    avatar: 'SC',
    role: 'Senior Mentor',
    audience: ALL,
    body: 'We are moving all program updates here. WhatsApp threads will be archived at the end of this week. Check this channel for anything that used to land in the group chats.',
    at: '2h ago',
    pinned: true,
    reactions: { acknowledged: 24, helpful: 9 },
  },
  {
    id: 1002,
    author: 'Imran Malik',
    avatar: 'IM',
    role: 'Program Lead',
    audience: 'Full-Stack Web Development',
    body: 'Week 6 review submissions are now open. Please push your code before Thursday so mentors have time to give feedback ahead of the weekend grind.',
    at: '5h ago',
    pinned: false,
    reactions: { acknowledged: 18, helpful: 6 },
  },
  {
    id: 1003,
    author: 'Sarah Chen',
    avatar: 'SC',
    role: 'Senior Mentor',
    audience: ALL,
    body: 'Reminder: office hours move to 4pm starting next week. The booking link in your dashboard already reflects the new slots.',
    at: '1d ago',
    pinned: false,
    reactions: { acknowledged: 31, helpful: 12 },
  },
  {
    id: 1004,
    author: 'Nadia Rahman',
    avatar: 'NR',
    role: 'Mentor',
    audience: 'Data Science',
    body: 'The dataset for the capstone has been refreshed. Re-download it from the resources tab before you start the modelling task.',
    at: '2d ago',
    pinned: false,
    reactions: { acknowledged: 14, helpful: 8 },
  },
];

function audienceTone(audience: string): 'brand' | 'neutral' {
  return audience === ALL ? 'neutral' : 'brand';
}

export function Announcements() {
  const { programs, mentor } = useStore();
  const [feed, setFeed] = useState<Announcement[]>(SEED);
  const [filter, setFilter] = useState<string>(ALL);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<string>(ALL);
  const [pin, setPin] = useState(false);
  const [nextId, setNextId] = useState(2000);

  const audiences = useMemo(
    () => [ALL, ...programs.map((p) => p.program ?? p.name)],
    [programs],
  );

  const sorted = useMemo(() => {
    const visible = filter === ALL ? feed : feed.filter((a) => a.audience === filter);
    return [...visible].sort((a, b) => Number(b.pinned) - Number(a.pinned));
  }, [feed, filter]);

  const post = () => {
    const headline = title.trim();
    const message = body.trim();
    if (!headline && !message) return;
    const entry: Announcement = {
      id: nextId,
      author: mentor.name,
      avatar: mentor.avatar,
      role: mentor.role,
      audience,
      body: headline ? `${headline}\n${message}` : message,
      at: 'just now',
      pinned: pin,
      reactions: { acknowledged: 0, helpful: 0 },
    };
    setFeed((f) => [entry, ...f]);
    setNextId((n) => n + 1);
    setTitle('');
    setBody('');
    setAudience(ALL);
    setPin(false);
  };

  const react = (id: number, key: keyof Reactions) => {
    setFeed((f) =>
      f.map((a) =>
        a.id === id
          ? { ...a, reactions: { ...a.reactions, [key]: a.reactions[key] + 1 } }
          : a,
      ),
    );
  };

  return (
    <Page>
      <PageHeader
        title="Announcements"
        subtitle="The single channel for program updates, replacing scattered WhatsApp threads"
      />

      <Card className="mb-4 border-brand-200 bg-brand-50/40 px-4 py-3">
        <div className="flex items-start gap-2.5 text-sm text-ink-soft">
          <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
          <p className="leading-relaxed">
            Everything that used to live in group chats now posts here. One source of
            truth, in-app, pinned when it matters. No threads to lose, no messages to miss.
          </p>
        </div>
      </Card>

      {/* composer */}
      <Card className="mb-6 p-5">
        <SectionLabel>Post an announcement</SectionLabel>
        <div className="space-y-4">
          <Field label="Title">
            <TextInput
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Office hours move to 4pm"
            />
          </Field>
          <Field label="Message">
            <TextArea
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="What does everyone need to know?"
            />
          </Field>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="w-full sm:max-w-xs">
              <Field label="Audience">
                <SelectInput value={audience} onChange={(e) => setAudience(e.target.value)}>
                  {audiences.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </SelectInput>
              </Field>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPin((v) => !v)}
                className={cx(
                  'rounded-r inline-flex items-center gap-1.5 border px-3 py-2 text-sm transition-colors',
                  pin
                    ? 'border-brand-300 bg-brand-50 text-brand-700'
                    : 'border-hairline text-ink-mute hover:border-ink',
                )}
              >
                <Pin className="h-3.5 w-3.5" /> {pin ? 'Pinned' : 'Pin'}
              </button>
              <Button onClick={post} disabled={!title.trim() && !body.trim()}>
                <Send className="h-4 w-4" /> Post announcement
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* filter chips */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {audiences.map((a) => {
          const active = filter === a;
          return (
            <button
              key={a}
              onClick={() => setFilter(a)}
              className={cx(
                'rounded-r border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.04em] transition-colors',
                active
                  ? 'border-ink bg-ink text-white'
                  : 'border-hairline text-ink-mute hover:border-ink hover:text-ink',
              )}
            >
              {a}
            </button>
          );
        })}
      </div>

      {/* feed */}
      {sorted.length === 0 ? (
        <Card className="px-5 py-12 text-center text-sm text-ink-mute">
          Nothing posted to this audience yet.
        </Card>
      ) : (
        <div className="space-y-3">
          {sorted.map((a) => (
            <Card
              key={a.id}
              className={cx('p-5', a.pinned && 'border-l-2 border-l-brand-500')}
            >
              <div className="flex items-start gap-3">
                <Avatar initials={a.avatar} name={a.author} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-semibold text-ink">{a.author}</span>
                    <span className="text-xs text-ink-faint">{a.role}</span>
                    <span className="text-ink-faint">·</span>
                    <span className="text-xs text-ink-faint">{a.at}</span>
                    {a.pinned && (
                      <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.08em] text-brand-600">
                        <Pin className="h-3 w-3" /> Pinned
                      </span>
                    )}
                  </div>
                  <div className="mt-1">
                    <Badge tone={audienceTone(a.audience)}>{a.audience}</Badge>
                  </div>
                  <p className="mt-2.5 max-w-prose whitespace-pre-line text-sm leading-relaxed text-ink-soft">
                    {a.body}
                  </p>

                  {/* reactions */}
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-hairline pt-3">
                    <button
                      onClick={() => react(a.id, 'acknowledged')}
                      className="rounded-r inline-flex items-center gap-1.5 border border-hairline px-2.5 py-1 text-xs text-ink-mute transition-colors hover:border-ink hover:text-ink"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> Acknowledged
                      <span className="font-mono font-medium text-ink tnum">
                        {a.reactions.acknowledged}
                      </span>
                    </button>
                    <button
                      onClick={() => react(a.id, 'helpful')}
                      className="rounded-r inline-flex items-center gap-1.5 border border-hairline px-2.5 py-1 text-xs text-ink-mute transition-colors hover:border-ink hover:text-ink"
                    >
                      <ThumbsUp className="h-3.5 w-3.5" /> Helpful
                      <span className="font-mono font-medium text-ink tnum">
                        {a.reactions.helpful}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </Page>
  );
}
