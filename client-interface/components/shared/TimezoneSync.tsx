'use client';

/**
 * TimezoneSync
 *
 * Zero-UI. Once per session, backfills the user's saved timezone from their
 * browser (server only fills it if unset), so scheduling + deadlines can be
 * anchored to the user's real zone. Display always uses the browser zone via
 * lib/utils/datetime, so this is purely about teaching the server the zone.
 * Include once inside each authenticated role layout.
 */
import { useEffect } from 'react';
import { apiClient } from '@/lib/services/api-client';
import { getBrowserTimeZone } from '@/lib/utils/datetime';

export function TimezoneSync() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem('tz-synced')) return; // once per session
    const tz = getBrowserTimeZone();
    if (!tz || tz === 'UTC') return;
    apiClient.post('/profile/detect-timezone', { timezone: tz })
      .then(() => sessionStorage.setItem('tz-synced', '1'))
      .catch(() => { /* non-critical; retry next session */ });
  }, []);
  return null;
}
