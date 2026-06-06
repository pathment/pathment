/**
 * Timezone-aware date/time formatting. The golden rule app-wide: a moment in
 * time is stored as a UTC instant; we render it in the VIEWER's timezone with an
 * explicit zone label so nothing is ever ambiguous across regions.
 *
 * The viewer's timezone defaults to the browser's, which is almost always what
 * the user wants. A stored preference can override it.
 */

let overrideZone: string | null = null;

/** Override the viewer timezone (e.g. from the user's saved setting). */
export function setViewerTimeZone(tz: string | null | undefined) {
  overrideZone = tz && tz !== 'UTC' ? tz : null;
}

/** The browser's IANA timezone, e.g. 'Asia/Karachi'. */
export function getBrowserTimeZone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }
  catch { return 'UTC'; }
}

/** The timezone we render in for this viewer (override → browser). */
export function getViewerTimeZone(): string {
  return overrideZone || getBrowserTimeZone();
}

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "Jun 10, 2026" in the viewer's zone. */
export function formatDate(value: string | number | Date | null | undefined, opts: Intl.DateTimeFormatOptions = {}): string {
  const d = toDate(value);
  if (!d) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: getViewerTimeZone(), ...opts });
}

/** "2:00 PM PKT" — time + short zone label, in the viewer's zone. */
export function formatTime(value: string | number | Date | null | undefined, opts: Intl.DateTimeFormatOptions = {}): string {
  const d = toDate(value);
  if (!d) return '—';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short', timeZone: getViewerTimeZone(), ...opts });
}

/** "Jun 10, 2026, 2:00 PM PKT" — full instant, viewer's zone, with label. */
export function formatDateTime(value: string | number | Date | null | undefined, opts: Intl.DateTimeFormatOptions = {}): string {
  const d = toDate(value);
  if (!d) return '—';
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
    timeZone: getViewerTimeZone(), ...opts,
  });
}

/**
 * A meeting/slot label: prefer the true instant (`startsAt`) rendered in the
 * viewer's zone with a label; fall back to the legacy day/time strings (which
 * have no zone) when an older record has no instant.
 */
export function formatMeeting(
  startsAt: string | number | Date | null | undefined,
  fallbackDay?: string | null,
  fallbackTime?: string | null,
): string {
  const d = toDate(startsAt);
  if (d) {
    const day = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: getViewerTimeZone() });
    return `${day} · ${formatTime(d)}`;
  }
  // Legacy record with no instant — show what we have (zone unknown).
  return [fallbackDay, fallbackTime].filter(Boolean).join(' · ') || '—';
}

/** Short zone label for the viewer, e.g. "PKT" / "GMT+5". */
export function viewerZoneLabel(): string {
  try {
    const parts = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short', timeZone: getViewerTimeZone() }).formatToParts(new Date());
    return parts.find((p) => p.type === 'timeZoneName')?.value || getViewerTimeZone();
  } catch { return getViewerTimeZone(); }
}
