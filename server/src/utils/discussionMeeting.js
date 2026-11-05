/**
 * Where a group discussion's meeting stands. The meeting is a Clan Review
 * session of kind 'discussion' (migration 147); this reads its columns.
 *
 *   scheduled  set for later; joinable from JOIN_LEAD_MINUTES before it starts
 *   live       a mentor has the room open
 *   ended      a mentor closed it (a mentor can open it again)
 *   missed     its window passed and nobody opened it
 *
 * Kept out of the services so the group service, the meeting service and the
 * reminder worker read it the same way without requiring each other.
 */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/** The Join banner and the room open this long before the start. */
const JOIN_LEAD_MINUTES = 2;
/** The reminder goes out this long before the start. */
const REMINDER_LEAD_MINUTES = 10;
/** A meeting with no end time stays joinable this long after it was due to start. */
const OPEN_HOURS_WITHOUT_END = 6;

/** @param session a CohortReviewSession of kind 'discussion', or null */
function meetingView(session, now = new Date()) {
  if (!session || !session.scheduledAt) return null;
  const startsAt = new Date(session.scheduledAt);
  const endsAt = session.scheduledEndAt ? new Date(session.scheduledEndAt) : null;
  const live = !!session.meetingStartedAt && !session.meetingEndedAt;
  const ended = !!session.meetingEndedAt;
  const closesAt = endsAt || new Date(startsAt.getTime() + OPEN_HOURS_WITHOUT_END * HOUR);
  const joinOpensAt = new Date(startsAt.getTime() - JOIN_LEAD_MINUTES * MINUTE);

  let state = 'scheduled';
  if (live) state = 'live';
  else if (ended) state = 'ended';
  else if (now > closesAt) state = 'missed';

  return {
    state,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt ? endsAt.toISOString() : null,
    startedAt: session.meetingStartedAt ? new Date(session.meetingStartedAt).toISOString() : null,
    endedAt: session.meetingEndedAt ? new Date(session.meetingEndedAt).toISOString() : null,
    joinOpensAt: joinOpensAt.toISOString(),
    // A mentee can join while it is live, or from two minutes before the start.
    joinable: live || (state === 'scheduled' && now >= joinOpensAt),
  };
}

module.exports = {
  meetingView,
  JOIN_LEAD_MINUTES,
  REMINDER_LEAD_MINUTES,
  OPEN_HOURS_WITHOUT_END,
  MINUTE,
  HOUR,
};
