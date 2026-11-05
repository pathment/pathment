import { Video } from 'lucide-react';
import type { DiscussionMeeting } from '@/lib/services/group-discussions-api';
import { formatMeeting } from '@/lib/utils/datetime';

/** A group's meeting in one line, for the group rows: live, or when it is. Nothing once it is over. */
export function MeetingChip({ meeting }: { meeting?: DiscussionMeeting | null }) {
  if (!meeting || (meeting.state !== 'live' && meeting.state !== 'scheduled')) return null;
  const live = meeting.state === 'live';
  return (
    <span className={`inline-flex items-center gap-1 ${live ? 'font-semibold text-red-600' : ''}`}>
      <Video className="h-3.5 w-3.5" aria-hidden />
      {live ? 'Meeting live' : `Meeting ${formatMeeting(meeting.startsAt)}`}
    </span>
  );
}
