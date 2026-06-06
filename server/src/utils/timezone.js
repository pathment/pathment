/**
 * Timezone helpers — dependency-free, DST-correct via the Intl API (Node ships
 * full ICU). The golden rule across the app: a moment in time is ALWAYS stored
 * as a UTC instant; wall-clock + zone is only an input/display concern.
 */

/**
 * Offset (ms) of `timeZone` at the given UTC instant: localTime - utcTime.
 * Positive east of UTC (e.g. +5h for Asia/Karachi). Handles DST because it is
 * evaluated at the specific instant.
 */
function offsetMsAt(utcMs, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = dtf.formatToParts(new Date(utcMs));
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  // 'hour' can come back as '24' at midnight in some ICU versions — normalise.
  const hour = map.hour === '24' ? 0 : Number(map.hour);
  const asIfUtc = Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day), hour, Number(map.minute), Number(map.second));
  return asIfUtc - utcMs;
}

/** Normalise '2:00 PM' | '14:00' | '2 PM' → { hour, minute } in 24h. */
function parseWallClock(timeStr) {
  if (!timeStr) return null;
  const s = String(timeStr).trim();
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*([AaPp][Mm])?$/);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  const ampm = m[3] ? m[3].toLowerCase() : null;
  if (ampm === 'pm' && hour < 12) hour += 12;
  if (ampm === 'am' && hour === 12) hour = 0;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

/**
 * Convert a wall-clock date+time *in a given timezone* to the absolute UTC
 * instant. e.g. ('2026-06-10', '2:00 PM', 'America/New_York') → the Date that is
 * 2pm Eastern that day. Returns null on bad input.
 */
function zonedWallClockToUtc(dateStr, timeStr, timeZone) {
  if (!dateStr) return null;
  const wc = parseWallClock(timeStr) || { hour: 0, minute: 0 };
  const [y, mo, d] = String(dateStr).split('-').map(Number);
  if (!y || !mo || !d) return null;
  const tz = timeZone || 'UTC';
  // Treat the wall-clock as if it were UTC, then subtract the zone's offset at
  // that approximate instant to land on the true UTC instant. Re-check once to
  // be safe around DST boundaries.
  const guess = Date.UTC(y, mo - 1, d, wc.hour, wc.minute, 0);
  let utcMs = guess - offsetMsAt(guess, tz);
  utcMs = guess - offsetMsAt(utcMs, tz);
  return new Date(utcMs);
}

/**
 * End-of-day (23:59:59) on `dateStr` *in the given timezone*, as a UTC instant.
 * Use for calendar-style deadlines so "due June 10" is the mentee's whole
 * June 10, not UTC midnight (which is the previous evening in the Americas).
 */
function endOfDayInZone(dateStr, timeZone) {
  return zonedWallClockToUtc(dateStr, '23:59', timeZone);
}

module.exports = { offsetMsAt, parseWallClock, zonedWallClockToUtc, endOfDayInZone };
