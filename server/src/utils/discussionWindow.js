const { nextOccurrences, activeOccurrence } = require('./reviewRecurrence');

/**
 * Whether a discussion group is open right now.
 *
 *   open      mentees can post
 *   upcoming  not started yet, or between two weekly occurrences
 *   ended     frozen for good: the mentees' chat is read-only
 *
 * A group with no times set is simply open. The mentor can always post, so
 * this only ever limits mentees.
 */
function discussionWindow(group, now = new Date()) {
  if (group.repeat === 'weekly') {
    const current = activeOccurrence(group, now, 0);
    if (current) return { state: 'open', opensAt: current.start, closesAt: current.end };
    const [next] = nextOccurrences(group, now, 1);
    if (next) return { state: 'upcoming', opensAt: next.start, closesAt: next.end };
    return { state: 'ended', opensAt: null, closesAt: null };
  }

  const startsAt = group.startsAt ? new Date(group.startsAt) : null;
  const endsAt = group.endsAt ? new Date(group.endsAt) : null;
  if (endsAt && now >= endsAt) return { state: 'ended', opensAt: startsAt, closesAt: endsAt };
  if (startsAt && now < startsAt) return { state: 'upcoming', opensAt: startsAt, closesAt: endsAt };
  return { state: 'open', opensAt: startsAt, closesAt: endsAt };
}

module.exports = { discussionWindow };
