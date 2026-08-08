/**
 * Occurrence math for recurring reviews.
 *
 * A schedule is a weekday + local wall-clock time in a timezone, weekly or
 * biweekly, from startsOn until an optional endsOn. We compute the exact UTC
 * instant of each occurrence with the existing `zonedWallClockToUtc` helper, so
 * "5pm local" stays 5pm across DST.
 *
 * Date-only math (finding the right weekday, stepping weeks) is done in UTC on
 * the calendar date — a calendar date's weekday is timezone-independent — and
 * only the final (date + time) is converted to a real instant in the zone.
 */
const { zonedWallClockToUtc } = require('./timezone');

const DAY_MS = 86400000;
const pad = (n) => String(n).padStart(2, '0');
const toDateStr = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const parseDateOnly = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };

/** First calendar date >= startsOn that falls on `dayOfWeek` (0=Sun..6=Sat). */
function anchorDate(startsOn, dayOfWeek) {
  const d = parseDateOnly(startsOn);
  let guard = 0;
  while (d.getUTCDay() !== dayOfWeek && guard++ < 7) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

/**
 * The next `count` occurrences at/after `from`.
 * @returns {Array<{ dateStr: string, start: Date, end: Date }>}  (start/end are UTC Dates)
 */
function nextOccurrences(schedule, from = new Date(), count = 4) {
  const { dayOfWeek, timeLocal, timezone, intervalWeeks = 1, durationMinutes = 60, startsOn, endsOn } = schedule;
  if (dayOfWeek == null || !timeLocal || !timezone || !startsOn) return [];
  const stepMs = Math.max(1, intervalWeeks) * 7 * DAY_MS;
  let anchor = anchorDate(startsOn, dayOfWeek);
  const endMs = endsOn ? parseDateOnly(endsOn).getTime() + DAY_MS : Infinity; // inclusive of endsOn's day

  // Fast-forward anchor close to `from` date to avoid converting past years of dates via slow Intl
  if (anchor.getTime() < from.getTime() - stepMs) {
    const skipSteps = Math.floor((from.getTime() - stepMs - anchor.getTime()) / stepMs);
    if (skipSteps > 0) {
      anchor = new Date(anchor.getTime() + skipSteps * stepMs);
    }
  }

  const out = [];
  // Cap the scan so a bad/no-end schedule can't loop forever.
  for (let d = new Date(anchor), i = 0; i < 520 && out.length < count; i++, d = new Date(anchor.getTime() + i * stepMs)) {
    if (d.getTime() >= endMs) break;
    const dateStr = toDateStr(d);
    let start;
    try { start = zonedWallClockToUtc(dateStr, timeLocal, timezone); } catch { continue; }
    if (!(start instanceof Date) || isNaN(start)) continue;
    if (start.getTime() < from.getTime()) continue;
    out.push({ dateStr, start, end: new Date(start.getTime() + durationMinutes * 60000) });
  }
  return out;
}

/**
 * The occurrence that is LIVE right now for a schedule, or null.
 * "Live" = an occurrence has started (start <= now) and its window
 * [start, start + duration + grace] still contains now. This is what makes a
 * scheduled review joinable independently of any single stored `scheduledAt` —
 * so a clan can have several reviews on the same day at different times.
 * @returns {{ dateStr: string, start: Date, end: Date } | null}
 */
function activeOccurrence(schedule, now = new Date(), graceMinutes = 30) {
  const windowMs = ((Number(schedule.durationMinutes) || 60) + graceMinutes) * 60000;
  // Look back one window so an occurrence that started up to `windowMs` ago is caught.
  const from = new Date(now.getTime() - windowMs);
  const occ = nextOccurrences(schedule, from, 2);
  for (const o of occ) {
    if (o.start.getTime() <= now.getTime() && o.start.getTime() + windowMs > now.getTime()) return o;
  }
  return null;
}

module.exports = { nextOccurrences, anchorDate, activeOccurrence };
