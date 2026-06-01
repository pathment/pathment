import { useState, useEffect } from 'react';
import { CalendarRange, CheckCircle2, Clock } from 'lucide-react';
import { Drawer, Field, TextInput, TextArea, Segmented } from './overlays';
import { Avatar, Button, cx } from '@/lib/ui';
import { useStore } from '@/store/AppStore';
import type { Mentee, MeetingKind } from '@/lib/types';

const KINDS: { value: MeetingKind; label: string }[] = [
  { value: '1:1', label: '1:1' },
  { value: 'pairing', label: 'Pairing' },
  { value: 'review', label: 'Review' },
  { value: 'standup', label: 'Standup' },
];

const DURATIONS = [15, 30, 45, 60];

/* Quick date presets so booking is a couple of clicks, not a calendar wrestle. */
const DATE_PRESETS = ['Today', 'Tomorrow', 'This Thu', 'Next Mon'];
const TIME_PRESETS = ['9:00 AM', '11:00 AM', '2:00 PM', '4:00 PM'];

export function ScheduleDrawer({
  open,
  onClose,
  mentee,
}: {
  open: boolean;
  onClose: () => void;
  mentee: Mentee | null;
}) {
  const { scheduleMeeting } = useStore();
  const [kind, setKind] = useState<MeetingKind>('1:1');
  const [date, setDate] = useState('This Thu');
  const [time, setTime] = useState('2:00 PM');
  const [dur, setDur] = useState(30);
  const [agenda, setAgenda] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (open) {
      setKind('1:1');
      setDate('This Thu');
      setTime('2:00 PM');
      setDur(30);
      setAgenda('');
      setDone(false);
    }
  }, [open, mentee?.id]);

  if (!mentee) return null;

  const book = () => {
    scheduleMeeting(mentee.id, { kind, date, time, durationMins: dur, agenda: agenda.trim() || undefined });
    setDone(true);
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="max-w-lg"
      title={`Schedule with ${mentee.name}`}
      subtitle="Book a time — they'll get a notification"
      footer={
        !done ? (
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] text-ink-faint">
              {kind} · {date} · {time} · {dur}m
            </span>
            <Button onClick={book} disabled={!date || !time}>
              <CalendarRange className="h-4 w-4" /> Schedule
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
          <p className="mt-3 text-sm font-medium text-ink">Booked.</p>
          <p className="mt-1 text-xs text-ink-mute">
            {kind} with {mentee.name.split(' ')[0]} on {date} at {time}.
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
              <div className="truncate text-xs text-ink-mute">{mentee.level} · {mentee.program}</div>
            </div>
          </div>

          <Field label="Type">
            <div>
              <Segmented value={kind} onChange={setKind} options={KINDS} />
            </div>
          </Field>

          <Field label="Date">
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {DATE_PRESETS.map((d) => (
                  <button
                    key={d}
                    onClick={() => setDate(d)}
                    className={cx(
                      'rounded-r border px-2.5 py-1 text-xs transition-colors',
                      date === d ? 'border-ink bg-ink text-white' : 'border-hairline text-ink-soft hover:border-ink',
                    )}
                  >
                    {d}
                  </button>
                ))}
              </div>
              <TextInput value={date} onChange={(e) => setDate(e.target.value)} placeholder="or type a date" className="text-sm" />
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Time">
              <div className="flex flex-wrap gap-1.5">
                {TIME_PRESETS.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTime(t)}
                    className={cx(
                      'rounded-r border px-2 py-1 text-xs transition-colors',
                      time === t ? 'border-ink bg-ink text-white' : 'border-hairline text-ink-soft hover:border-ink',
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Duration">
              <div className="flex gap-1.5">
                {DURATIONS.map((d) => (
                  <button
                    key={d}
                    onClick={() => setDur(d)}
                    className={cx(
                      'rounded-r inline-flex items-center gap-1 border px-2 py-1 font-mono text-xs transition-colors',
                      dur === d ? 'border-ink bg-ink text-white' : 'border-hairline text-ink-soft hover:border-ink',
                    )}
                  >
                    <Clock className="h-3 w-3" />
                    {d}m
                  </button>
                ))}
              </div>
            </Field>
          </div>

          <Field label="Agenda (optional)">
            <TextArea
              rows={3}
              value={agenda}
              onChange={(e) => setAgenda(e.target.value)}
              placeholder="What do you want to cover?"
            />
          </Field>
        </div>
      )}
    </Drawer>
  );
}
