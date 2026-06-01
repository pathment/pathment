import { useState, useEffect } from 'react';
import { Send, Mail, MessageSquare, CheckCircle2, Sparkles } from 'lucide-react';
import { Drawer, Field, TextArea } from './overlays';
import { Avatar, Badge, Button, cx } from '@/lib/ui';
import { useStore } from '@/store/AppStore';
import type { Mentee, MessageChannel } from '@/lib/types';

/* Send a custom message to any mentee (e.g. someone drifting off-track).
   Start from a template, tweak the wording, optionally also send by email. */
export function MessageDrawer({
  open,
  onClose,
  mentee,
  taskTitle,
}: {
  open: boolean;
  onClose: () => void;
  mentee: Mentee | null;
  taskTitle?: string;
}) {
  const { messageTemplates, sendMessage, mentor } = useStore();
  const [body, setBody] = useState('');
  const [email, setEmail] = useState(false);
  const [tplId, setTplId] = useState<string | undefined>();
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (open) {
      setBody('');
      setEmail(false);
      setTplId(undefined);
      setDone(false);
    }
  }, [open, mentee?.id]);

  if (!mentee) return null;

  const fill = (t: string) =>
    t
      .replaceAll('{name}', mentee.name.split(' ')[0])
      .replaceAll('{mentor}', mentor.name)
      .replaceAll('{task}', taskTitle ?? 'your task');

  const pickTemplate = (id: string) => {
    const t = messageTemplates.find((x) => x.id === id);
    if (t) {
      setBody(fill(t.body));
      setTplId(id);
    }
  };

  const send = () => {
    const channels: MessageChannel[] = email ? ['in_app', 'email'] : ['in_app'];
    sendMessage(mentee.id, body, channels, tplId);
    setDone(true);
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="max-w-lg"
      title={`Message ${mentee.name}`}
      subtitle={taskTitle ? `About “${taskTitle}”` : 'Send a custom message'}
      footer={
        !done ? (
          <div className="flex items-center justify-between">
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-ink-soft">
              <input
                type="checkbox"
                checked={email}
                onChange={(e) => setEmail(e.target.checked)}
                className="h-4 w-4 accent-brand-500"
              />
              <Mail className="h-3.5 w-3.5" /> Also send by email
            </label>
            <Button onClick={send} disabled={!body.trim()}>
              <Send className="h-4 w-4" /> Send
            </Button>
          </div>
        ) : undefined
      }
    >
      {done ? (
        <div className="grid place-items-center py-16 text-center">
          <div className="grid h-12 w-12 place-items-center border border-emerald-200 text-emerald-600">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <p className="mt-3 text-sm font-medium text-ink">Message sent.</p>
          <p className="mt-1 text-xs text-ink-mute">
            {mentee.name.split(' ')[0]} got it in-app{email ? ' and by email' : ''}.
          </p>
          <Button className="mt-4" onClick={onClose}>
            Done
          </Button>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center gap-3 rounded-r border border-hairline bg-neutral-50/60 p-3">
            <Avatar initials={mentee.avatar} name={mentee.name} size="sm" />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-ink">{mentee.name}</div>
              <div className="truncate text-xs text-ink-mute">{mentee.email}</div>
            </div>
            {mentee.risk !== 'low' && (
              <Badge tone={mentee.risk === 'high' ? 'rose' : 'amber'} className="ml-auto">
                {mentee.risk === 'high' ? 'At risk' : 'Watch'}
              </Badge>
            )}
          </div>

          {/* one-click templates */}
          <div>
            <div className="mb-2 flex items-center gap-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-ink-faint">
              <Sparkles className="h-3 w-3" /> Start from a template
            </div>
            <div className="flex flex-wrap gap-1.5">
              {messageTemplates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => pickTemplate(t.id)}
                  className={cx(
                    'rounded-r border px-2.5 py-1 text-xs transition-colors',
                    tplId === t.id ? 'border-ink bg-ink text-white' : 'border-hairline text-ink-soft hover:border-ink',
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <Field label="Message" hint="Tweak the wording — it's your voice that lands.">
            <TextArea
              rows={8}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={`Write to ${mentee.name.split(' ')[0]}…`}
            />
          </Field>

          <div className="flex items-center gap-1.5 text-[11px] text-ink-faint">
            <MessageSquare className="h-3.5 w-3.5" />
            Delivered to their Pathment inbox{email ? ' and email' : ''}.
          </div>
        </div>
      )}
    </Drawer>
  );
}
