'use client';

import { useEffect, useRef } from 'react';

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window { JitsiMeetExternalAPI?: any }
}

// Cache the external_api.js loader per domain so multiple mounts don't re-inject.
const loaders: Record<string, Promise<void> | undefined> = {};
function loadJitsi(domain: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.JitsiMeetExternalAPI) return Promise.resolve();
  if (loaders[domain]) return loaders[domain];
  loaders[domain] = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://${domain}/external_api.js`;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { delete loaders[domain]; reject(new Error('Could not load the video service')); };
    document.body.appendChild(s);
  });
  return loaders[domain];
}

export interface JitsiParticipant { id: string; displayName?: string }

/**
 * Embeds a Jitsi room. Provider-flexible via `domain` (meet.jit.si by default,
 * or a self-hosted / JaaS host later). Surfaces the events the review needs:
 * self join/leave (for attendance), roster changes, and dominant speaker (for
 * the contribution signal). All wiring is disposed on unmount.
 */
export function JitsiRoom({
  domain, room, displayName, avatarUrl, onJoined, onLeft, onReadyToClose, onParticipantJoined, onParticipantLeft, onDominantSpeaker, onError,
}: {
  domain: string;
  room: string;
  displayName?: string | null;
  /** Pathment profile picture, so people show their real face in the call. */
  avatarUrl?: string | null;
  onJoined?: () => void;
  onLeft?: () => void;
  /** Fires when the user hangs up in the Jitsi toolbar (red button, "end for me"
   *  or "end for all") — use it to run the same teardown as an explicit end. */
  onReadyToClose?: () => void;
  /** Fires for everyone already in the room when we join, AND for later joiners. */
  onParticipantJoined?: (p: JitsiParticipant) => void;
  onParticipantLeft?: (p: JitsiParticipant) => void;
  onDominantSpeaker?: (participantId: string) => void;
  onError?: (message: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<any>(null);

  useEffect(() => {
    let disposed = false;
    loadJitsi(domain)
      .then(() => {
        if (disposed || !containerRef.current || !window.JitsiMeetExternalAPI) return;
        const api = new window.JitsiMeetExternalAPI(domain, {
          roomName: room,
          parentNode: containerRef.current,
          userInfo: displayName ? { displayName } : undefined,
          configOverwrite: {
            // Both keys: `prejoinPageEnabled` is the legacy flag, `prejoinConfig`
            // is what current Jitsi (2.0.10000+) reads — set both so the host and
            // mentees drop straight into the room, no "Join meeting" gate.
            prejoinPageEnabled: false,
            prejoinConfig: { enabled: false },
            disableDeepLinking: true,
            startWithAudioMuted: false,
            // Cut the provider's promos/analytics as far as it allows.
            disableThirdPartyRequests: true,
            enableWelcomePage: false,
            enableClosePage: false,
          },
          interfaceConfigOverwrite: {
            MOBILE_APP_PROMO: false,
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            SHOW_BRAND_WATERMARK: false,
            SHOW_PROMOTIONAL_CLOSE_PAGE: false,
            HIDE_DEEP_LINKING_LOGO: true,
            DISPLAY_WELCOME_PAGE_CONTENT: false,
            DISPLAY_WELCOME_FOOTER: false,
          },
        });
        apiRef.current = api;
        // Seed the roster with whoever is ALREADY in the room — `participantJoined`
        // only fires for people who arrive after us, so without this a mentee who
        // joined before the host opened the panel would never be identifiable
        // (and so could never be credited for speaking).
        api.addListener('videoConferenceJoined', () => {
          try {
            const existing = api.getParticipantsInfo?.() || [];
            for (const p of existing) {
              if (p?.participantId) onParticipantJoined?.({ id: p.participantId, displayName: p.displayName || p.formattedDisplayName });
            }
          } catch { /* roster seeding is best-effort */ }
          // Show the Pathment profile picture instead of Jitsi's initials.
          if (avatarUrl) { try { api.executeCommand('avatarUrl', avatarUrl); } catch { /* optional */ } }
          onJoined?.();
        });
        if (onLeft) api.addListener('videoConferenceLeft', () => onLeft());
        // `readyToClose` = the user hung up (red button / "end for all"). Wire it
        // so hanging up runs the same flow as the panel's own End button.
        if (onReadyToClose) api.addListener('readyToClose', () => onReadyToClose());
        if (onParticipantJoined) api.addListener('participantJoined', (p: JitsiParticipant) => onParticipantJoined(p));
        if (onParticipantLeft) api.addListener('participantLeft', (p: JitsiParticipant) => onParticipantLeft(p));
        // Names often aren't on `participantJoined` (Jitsi sends them a beat later).
        // Capture `displayNameChanged` too, so speaker→roster matching works.
        api.addListener('displayNameChanged', (e: { id: string; displayname?: string; displayName?: string }) => {
          const name = e.displayName || e.displayname;
          if (e.id && name) onParticipantJoined?.({ id: e.id, displayName: name });
        });
        if (onDominantSpeaker) api.addListener('dominantSpeakerChanged', (e: { id: string }) => {
          // Resolve the speaker's CURRENT name right now (participantJoined may have
          // fired before the name was set) so their talk time can be attributed.
          try {
            const info = (api.getParticipantsInfo?.() || []).find((p: { participantId?: string }) => p.participantId === e.id);
            const name = (info as { displayName?: string; formattedDisplayName?: string } | undefined);
            const resolved = name?.displayName || name?.formattedDisplayName;
            if (resolved) onParticipantJoined?.({ id: e.id, displayName: resolved });
          } catch { /* best-effort */ }
          onDominantSpeaker(e.id);
        });
      })
      .catch((e) => onError?.(e?.message || 'Could not start the video'));

    return () => {
      disposed = true;
      try { apiRef.current?.dispose(); } catch { /* already gone */ }
      apiRef.current = null;
    };
    // Re-mount only when the room/domain changes — callbacks are read fresh via refs
    // in practice, but re-creating on room change is the intended lifecycle.
  }, [domain, room]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={containerRef} className="w-full h-full min-h-[420px] rounded-xl overflow-hidden bg-slate-900" />;
}
