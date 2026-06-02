import { useState } from 'react';
import { Megaphone, Mail, MessageSquare, Send, Check } from 'lucide-react';
import { Page, PageHeader } from '@/components/Page';
import { Card, Badge, Button, cx } from '@/lib/ui';
import { Modal, Field, TextInput, TextArea, SelectInput } from '@/components/overlays';
import { useStore } from '@/store/AppStore';
import { PROGRAMS } from '@/data/mock';

/* Super-admin broadcasts updates to mentors - across all programs or a specific
   one, delivered in-app and/or by email. */
export function ReleaseNotes() {
  const { releaseNotes, publishReleaseNote } = useStore();
  const [open, setOpen] = useState(false);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [program, setProgram] = useState(''); // '' = all
  const [inApp, setInApp] = useState(true);
  const [email, setEmail] = useState(true);

  const reset = () => {
    setTitle('');
    setBody('');
    setProgram('');
    setInApp(true);
    setEmail(true);
  };

  const publish = () => {
    const channels: ('in_app' | 'email')[] = [];
    if (inApp) channels.push('in_app');
    if (email) channels.push('email');
    publishReleaseNote({ title: title.trim(), body: body.trim(), program: program || undefined, channels });
    reset();
    setOpen(false);
  };

  return (
    <Page>
      <PageHeader
        title="Release notes"
        subtitle="Broadcast updates to mentors - across all programs or just one"
        actions={
          <Button onClick={() => setOpen(true)}>
            <Megaphone className="h-4 w-4" /> New release note
          </Button>
        }
      />

      {releaseNotes.length === 0 ? (
        <Card className="px-5 py-12 text-center text-sm text-ink-mute">
          No release notes yet. Send your first update to the mentors.
        </Card>
      ) : (
        <div className="space-y-3">
          {releaseNotes.map((n) => (
            <Card key={n.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-ink">{n.title}</span>
                    <Badge tone={n.program ? 'brand' : 'neutral'}>{n.program ?? 'All programs'}</Badge>
                  </div>
                  <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-ink-soft">{n.body}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">{n.at}</span>
                  <div className="flex gap-1">
                    {n.channels.includes('in_app') && (
                      <Badge tone="violet">
                        <MessageSquare className="h-3 w-3" /> In-app
                      </Badge>
                    )}
                    {n.channels.includes('email') && (
                      <Badge tone="sky">
                        <Mail className="h-3 w-3" /> Email
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-3 border-t border-hairline pt-2 text-[11px] text-ink-faint">
                Sent by {n.by}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* compose */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New release note"
        subtitle="Goes to mentors in the selected program"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={publish} disabled={!title.trim() || !body.trim() || (!inApp && !email)}>
              <Send className="h-4 w-4" /> Release
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field label="Title">
            <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. New: log 1:1 availability" autoFocus />
          </Field>
          <Field label="Message">
            <TextArea rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="What do mentors need to know or do?" />
          </Field>
          <Field label="Audience">
            <SelectInput value={program} onChange={(e) => setProgram(e.target.value)}>
              <option value="">All programs</option>
              {PROGRAMS.map((p) => (
                <option key={p.id} value={p.program ?? p.name}>
                  {p.name}
                  {p.program ? ` · ${p.program}` : ''}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Deliver via">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setInApp((v) => !v)}
                className={cx(
                  'rounded-r inline-flex items-center gap-2 border px-3 py-2 text-sm transition-colors',
                  inApp ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-hairline text-ink-mute hover:border-ink',
                )}
              >
                <MessageSquare className="h-4 w-4" /> In-app message {inApp && <Check className="h-3.5 w-3.5" />}
              </button>
              <button
                onClick={() => setEmail((v) => !v)}
                className={cx(
                  'rounded-r inline-flex items-center gap-2 border px-3 py-2 text-sm transition-colors',
                  email ? 'border-sky-300 bg-sky-50 text-sky-700' : 'border-hairline text-ink-mute hover:border-ink',
                )}
              >
                <Mail className="h-4 w-4" /> Email {email && <Check className="h-3.5 w-3.5" />}
              </button>
            </div>
            <span className="mt-1 block text-[11px] text-ink-faint">
              Choose email only, in-app only, or both.
            </span>
          </Field>
        </div>
      </Modal>
    </Page>
  );
}
