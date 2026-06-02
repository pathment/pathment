import { useState } from 'react';
import { CalendarRange, MessageSquare, Clock, Check } from 'lucide-react';
import {
  Card,
  Badge,
  Button,
  Avatar,
  SectionLabel,
  SENTIMENT_META,
} from '@/lib/ui';
import { Page, PageHeader } from '@/components/Page';
import { useStore } from '@/store/AppStore';

export function Meetings() {
  const { currentMenteeId, getMentee, mentor, getMeetings, availabilitySlots, bookAvailabilitySlot, requestMeeting } = useStore();
  const me = getMentee(currentMenteeId)!;

  const notes = me.notes;
  const upcoming = getMeetings(me.id);
  const openSlots = availabilitySlots.filter((s) => !s.taken);
  const [booking, setBooking] = useState(false);

  return (
    <Page>
      <PageHeader
        title="My mentor"
        subtitle="Your guide, upcoming 1:1s, and agreed next steps"
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Mentor card */}
        <div className="lg:col-span-2">
          <Card>
            <div className="flex flex-wrap items-start gap-4">
              <Avatar name={mentor.name} initials={mentor.avatar} size="xl" />
              <div className="min-w-0 flex-1">
                <div className="text-lg font-semibold text-ink">{mentor.name}</div>
                <div className="mt-0.5 text-sm text-ink-mute">{mentor.role}</div>
                <div className="mt-1 text-xs text-ink-faint">{mentor.program}</div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => requestMeeting(me.id)}>
                    <MessageSquare className="h-3.5 w-3.5" />
                    Message
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setBooking((b) => !b)}
                    disabled={openSlots.length === 0}
                  >
                    <CalendarRange className="h-3.5 w-3.5" />
                    Book a 1:1
                  </Button>
                </div>

                {/* booking — pick from the exact times the mentor published */}
                {openSlots.length === 0 ? (
                  <div className="mt-3">
                    <p className="text-xs text-ink-faint">
                      {mentor.name.split(' ')[0]} hasn&apos;t opened any 1:1 times yet.
                    </p>
                    <Button variant="soft" size="sm" className="mt-2" onClick={() => requestMeeting(me.id)}>
                      <CalendarRange className="h-3.5 w-3.5" /> Request a 1:1
                    </Button>
                  </div>
                ) : (
                  booking && (
                    <div className="mt-4 rounded-r border border-hairline p-3">
                      <div className="eyebrow mb-2">Pick a time {mentor.name.split(' ')[0]} is free</div>
                      <div className="flex flex-wrap gap-1.5">
                        {openSlots.map((s) => (
                          <button
                            key={s.id}
                            onClick={() => {
                              bookAvailabilitySlot(s.id, me.id);
                              setBooking(false);
                            }}
                            className="rounded-r border border-hairline px-3 py-1.5 text-xs text-ink-soft transition-colors hover:border-ink"
                          >
                            {s.day} {s.time}
                            <span className="ml-1 text-ink-faint">· {s.durationMins} min</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>
          </Card>
        </div>

        {/* Upcoming meetings */}
        <div className="lg:col-span-1">
          <SectionLabel>Upcoming</SectionLabel>
          {upcoming.length === 0 ? (
            <Card>
              <p className="text-sm text-ink-mute">No meetings booked yet.</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-faint">
                {mentor.name.split(' ')[0]} will schedule a time, or you can ask for one.
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              {upcoming.map((mt) => (
                <Card key={mt.id}>
                  <div className="flex items-start gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center border border-hairline text-ink-mute">
                      <Clock className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-semibold text-ink">
                          {mt.date} &middot; {mt.time}
                        </div>
                        <Badge tone="brand">{mt.kind}</Badge>
                      </div>
                      <div className="mt-0.5 text-xs text-ink-mute">
                        {mt.durationMins} min with {mentor.name.split(' ')[0]}
                      </div>
                    </div>
                  </div>
                  {mt.agenda && (
                    <p className="mt-3 border-t border-hairline pt-3 text-xs leading-relaxed text-ink-mute">
                      {mt.agenda}
                    </p>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Past 1:1s & agreed next steps */}
      <div className="mt-6">
        <SectionLabel>Past 1:1s &amp; agreed next steps</SectionLabel>

        {notes.length === 0 ? (
          <Card className="flex flex-col items-center gap-2 py-12 text-center">
            <span className="grid h-10 w-10 place-items-center border border-hairline text-ink-mute">
              <CalendarRange className="h-5 w-5" />
            </span>
            <div className="text-sm font-medium text-ink">No 1:1s logged yet.</div>
            <p className="max-w-sm text-xs leading-relaxed text-ink-mute">
              Once you and {mentor.name.split(' ')[0]} meet, a summary and the next steps you agree
              on will show up here.
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            {notes.map((note) => {
              const sentiment = SENTIMENT_META[note.sentiment];
              return (
                <Card key={note.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-ink">{note.date}</div>
                    <Badge tone={sentiment.tone}>{sentiment.label}</Badge>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-ink-soft">{note.summary}</p>

                  {note.nextSteps && note.nextSteps.length > 0 && (
                    <div className="mt-4">
                      <div className="eyebrow mb-2">Agreed next steps</div>
                      <ul className="space-y-1.5">
                        {note.nextSteps.map((step, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-ink">
                            <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center border border-emerald-200 text-emerald-600">
                              <Check className="h-2.5 w-2.5" />
                            </span>
                            <span>{step}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {note.issues && note.issues.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {note.issues.map((issue, i) => (
                        <Badge key={i} tone="amber">
                          {issue}
                        </Badge>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </Page>
  );
}
