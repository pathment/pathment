/**
 * Minimal iCalendar (.ics) generation for a single review occurrence.
 *
 * We emit ONE VEVENT per occurrence at its exact UTC instant (no RRULE), so the
 * time is always correct in the recipient's calendar with zero DST math — each
 * occurrence's invite/reminder email carries its own event. Same `uid` across a
 * given occurrence's emails so the calendar updates the same entry rather than
 * creating duplicates.
 */
const pad = (n) => String(n).padStart(2, '0');

/** Date -> iCal UTC stamp: YYYYMMDDTHHMMSSZ */
function icsUtc(d) {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}
// Escape per RFC 5545 (commas, semicolons, backslashes, newlines).
const esc = (s) => String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/**
 * @param {object} o
 * @param {string} o.uid             stable id for this occurrence
 * @param {Date}   o.start           UTC start
 * @param {Date}   o.end             UTC end
 * @param {string} o.title
 * @param {string} [o.description]
 * @param {string} [o.url]           join link (also used as LOCATION)
 * @param {string} [o.organizerName]
 * @param {string} [o.organizerEmail]
 * @param {'REQUEST'|'PUBLISH'|'CANCEL'} [o.method='REQUEST']
 * @returns {{ filename:string, content:string, contentType:string }}
 */
function buildEventIcs({ uid, start, end, title, description, url, organizerName, organizerEmail, method = 'REQUEST' } = {}) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Pathment//Cohort Review//EN',
    'CALSCALE:GREGORIAN',
    `METHOD:${method}`,
    'BEGIN:VEVENT',
    `UID:${esc(uid)}`,
    `DTSTAMP:${icsUtc(new Date(start))}`,
    `DTSTART:${icsUtc(new Date(start))}`,
    `DTEND:${icsUtc(new Date(end))}`,
    `SUMMARY:${esc(title || 'Cohort review')}`,
  ];
  if (description) lines.push(`DESCRIPTION:${esc(description)}`);
  if (url) { lines.push(`URL:${esc(url)}`); lines.push(`LOCATION:${esc(url)}`); }
  if (organizerEmail) lines.push(`ORGANIZER;CN=${esc(organizerName || 'Pathment')}:mailto:${esc(organizerEmail)}`);
  lines.push('STATUS:CONFIRMED', 'BEGIN:VALARM', 'TRIGGER:-PT15M', 'ACTION:DISPLAY', `DESCRIPTION:${esc(title || 'Cohort review')}`, 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR');
  return { filename: 'review.ics', content: lines.join('\r\n'), contentType: 'text/calendar; method=' + method };
}

module.exports = { buildEventIcs, icsUtc };
