'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Globe, Loader2 } from 'lucide-react';
import { Drawer } from '@/components/shared/Drawer';
import { toLocalInput, viewerZone } from '@/components/shared/discussions/meeting/meetingFormat';
import { groupDiscussionsApi, type DiscussionMeeting } from '@/lib/services/group-discussions-api';

const FIELD = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';
const LABEL = 'mb-1 block text-sm font-medium text-slate-700';

/**
 * Create or move a group's meeting. The start is required and the end is
 * optional. The inputs are in the mentor's own timezone and go to the server
 * as instants, so a mentee elsewhere sees the same moment on their own clock.
 */
export function ScheduleMeetingDrawer({ groupId, groupName, meeting, onClose, onSaved }: {
  groupId: string;
  groupName: string;
  meeting?: DiscussionMeeting | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  // A meeting that already happened is set up again from blank.
  const reuse = meeting && (meeting.state === 'scheduled' || meeting.state === 'missed');
  const [startsAt, setStartsAt] = useState(reuse ? toLocalInput(meeting.startsAt) : '');
  const [endsAt, setEndsAt] = useState(reuse ? toLocalInput(meeting.endsAt) : '');
  const [saving, setSaving] = useState(false);

  const start = startsAt ? new Date(startsAt) : null;
  const end = endsAt ? new Date(endsAt) : null;
  const error = !start ? null
    : start.getTime() < Date.now() - 60_000 ? 'The start must be in the future.'
      : end && end <= start ? 'The end must be after the start.'
        : null;

  const save = async () => {
    if (!start || error) return;
    setSaving(true);
    try {
      await groupDiscussionsApi.scheduleMeeting(groupId, {
        startsAt: start.toISOString(),
        endsAt: end ? end.toISOString() : null,
      });
      toast.success(reuse ? 'Meeting moved — everyone was told' : 'Meeting scheduled — invites sent');
      onSaved();
      onClose();
    } catch (err) {
      toast.error((err as { message?: string })?.message || 'Could not schedule the meeting');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title={reuse ? 'Move the meeting' : 'Create meeting'}
      subtitle={groupName}
      footer={(
        <button
          type="button"
          onClick={save}
          disabled={saving || !start || !!error}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {reuse ? 'Save new time' : 'Create meeting'}
        </button>
      )}
    >
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="meeting-start" className={LABEL}>Starts <span className="text-red-500">*</span></label>
            <input id="meeting-start" type="datetime-local" required autoFocus value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={FIELD} />
          </div>
          <div>
            <label htmlFor="meeting-end" className={LABEL}>Ends <span className="font-normal text-muted-foreground">(optional)</span></label>
            <input id="meeting-end" type="datetime-local" value={endsAt} min={startsAt || undefined} onChange={(e) => setEndsAt(e.target.value)} className={FIELD} />
          </div>
        </div>
        {error ? (
          <p className="-mt-2 text-xs text-red-600" role="alert">{error}</p>
        ) : (
          <p className="-mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Globe className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Times are in your timezone ({viewerZone()}). Everyone sees them in their own.
          </p>
        )}

        <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-slate-600 dark:text-slate-300">
          <p className="mb-2 font-medium text-slate-900">What happens next</p>
          <ul className="list-disc space-y-1 pl-5 text-xs">
            <li>The group&apos;s mentees and the clan&apos;s mentors get an invite with the time and a calendar file.</li>
            <li>10 minutes before, a reminder: in Pathment for whoever is online, by email for whoever is not.</li>
            <li>2 minutes before, a Join banner appears for the mentees and a Start banner for you.</li>
            <li>A mentee who joins has their group discussion task submitted for them.</li>
          </ul>
        </div>
      </div>
    </Drawer>
  );
}
