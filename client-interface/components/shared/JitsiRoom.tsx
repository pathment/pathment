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
// Toolbar sets. Guests (mentees) get a locked-down bar. The host (mentor /
// co-mentor / admin) additionally gets invite, room security + mute-everyone.
// Only the host can invite — mentees never share a join link.
const GUEST_TOOLBAR = [
  'microphone', 'camera', 'desktop', 'fullscreen', 'hangup', 'chat', 'raisehand',
  'reactions', 'tileview', 'videoquality', 'filmstrip', 'select-background', 'settings', 'participants-pane',
];
const HOST_TOOLBAR = [...GUEST_TOOLBAR, 'invite', 'security', 'mute-everyone', 'mute-video-everyone'];

export function JitsiRoom({
  domain, room, displayName, avatarUrl, role = 'guest', privateChat = false, polls = false, onJoined, onLeft, onReadyToClose, onParticipantJoined, onParticipantLeft, onDominantSpeaker, onSelfDominantChange, onError,
}: {
  domain: string;
  room: string;
  displayName?: string | null;
  /** Pathment profile picture, so people show their real face in the call. */
  avatarUrl?: string | null;
  /** 'host' = mentor/co-mentor (moderation toolbar); 'guest' = mentee (locked down). */
  role?: 'host' | 'guest';
  /** Allow 1:1 private chat between participants. OFF by default; the host enables it. */
  privateChat?: boolean;
  /** Enable in-call polls (create + vote). OFF by default; the host toggles it. */
  polls?: boolean;
  onJoined?: () => void;
  onLeft?: () => void;
  /** Fires when the user hangs up in the Jitsi toolbar (red button, "end for me"
   *  or "end for all") — use it to run the same teardown as an explicit end. */
  onReadyToClose?: () => void;
  /** Fires for everyone already in the room when we join, AND for later joiners. */
  onParticipantJoined?: (p: JitsiParticipant) => void;
  onParticipantLeft?: (p: JitsiParticipant) => void;
  onDominantSpeaker?: (participantId: string) => void;
  /** Fires true when the LOCAL user becomes the dominant speaker, false when not.
   *  Lets a mentee self-report their own talk time without name matching. */
  onSelfDominantChange?: (speaking: boolean) => void;
  onError?: (message: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<any>(null);
  const localIdRef = useRef<string | null>(null);

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
            // Force calls through the bridge (no P2P). Dominant-speaker detection —
            // which drives review talk-time/contribution — is a bridge feature and
            // is silent in a 2-person P2P call.
            p2p: { enabled: false },
            disableDeepLinking: true,
            startWithAudioMuted: false,
            // ── Voice quality: stop the echo / noise the mentor reported. ──
            // Keep the full audio-processing chain ON (these flags DISABLE when
            // true, so false = enabled): acoustic echo cancellation, noise
            // suppression, auto gain, high-pass filter. Without AEC a speaker
            // (no headphones) feeds its own output back → the "reflected voice".
            disableAP: false,
            disableAEC: false,
            disableNS: false,
            disableAGC: false,
            disableHPF: false,
            // Extra background-noise removal (typing, fans). Users can still
            // toggle it from the Jitsi mic menu.
            enableNoisyMicDetection: true,
            // Mono, voice-tuned bitrate — clearer speech, fewer artifacts than
            // the music-grade stereo default.
            audioQuality: { stereo: false, opusMaxAverageBitrate: 24000 },
            // Belt-and-braces: also request EC/NS/AGC at the browser getUserMedia
            // layer so Chrome applies them even if a device profile skipped them.
            constraints: {
              audio: {
                echoCancellation: { ideal: true },
                noiseSuppression: { ideal: true },
                autoGainControl: { ideal: true },
              },
            },
            // NOTE: do NOT set disableThirdPartyRequests — it also blocks loading
            // external avatar images (our Cloudinary profile photos), leaving only
            // initials. Promos are already suppressed via interfaceConfig below.
            enableWelcomePage: false,
            enableClosePage: false,
            // ── Pathment access/moderation policy ──
            // Only the host (mentor / co-mentor / admin) can invite; mentees can't
            // share a join link. `disableInviteFunctions` is TRUE to disable, so
            // guests = true (off), host = false (invite available).
            disableInviteFunctions: role !== 'host',
            // The remote-participant (three-dot) menu: guests can't kick, and no one
            // hands out moderator from the UI. 1:1 private chat is OFF by default —
            // the host turns it on via `privateChat`.
            remoteVideoMenu: {
              disableKick: role !== 'host',
              disableGrantModerator: true,
              disablePrivateChat: !privateChat,
            },
            // Screen share should take the stage (like Meet) instead of a small
            // tile — start in stage view; we also force it on share (listener below).
            startInTileView: false,
            // Reactions must broadcast to everyone (they weren't, because the
            // custom toolbar had dropped the 'reactions' button — re-added above).
            // Keep the feature explicitly on and un-moderated.
            disableReactions: false,
            disableReactionsModeration: true,
            // In-call polls — OFF unless the host enabled them for this session.
            disablePolls: !polls,
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
            // Role-scoped toolbar: mentees can't invite / lock the room / mute all.
            // 'polls' appears only when the host enabled polls for the session.
            TOOLBAR_BUTTONS: [...(role === 'host' ? HOST_TOOLBAR : GUEST_TOOLBAR), ...(polls ? ['polls'] : [])],
            // Don't auto-drop into the grid; keep the active speaker / shared screen
            // on the main stage.
            DEFAULT_LOCAL_DISPLAY_NAME: 'You',
          },
        });
        apiRef.current = api;
        // Seed the roster with whoever is ALREADY in the room — `participantJoined`
        // only fires for people who arrive after us, so without this a mentee who
        // joined before the host opened the panel would never be identifiable
        // (and so could never be credited for speaking).
        api.addListener('videoConferenceJoined', (e: { id?: string }) => {
          if (e?.id) localIdRef.current = e.id; // our own participant id (for self-dominant)
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
        if (onDominantSpeaker || onSelfDominantChange) api.addListener('dominantSpeakerChanged', (e: { id: string }) => {
          // Self-report path (robust, no name matching): tell the local user when
          // THEY are / aren't the dominant speaker.
          onSelfDominantChange?.(e.id === localIdRef.current);
          // Resolve the speaker's CURRENT name right now (participantJoined may have
          // fired before the name was set) so their talk time can be attributed.
          try {
            const info = (api.getParticipantsInfo?.() || []).find((p: { participantId?: string }) => p.participantId === e.id);
            const name = (info as { displayName?: string; formattedDisplayName?: string } | undefined);
            const resolved = name?.displayName || name?.formattedDisplayName;
            if (resolved) onParticipantJoined?.({ id: e.id, displayName: resolved });
          } catch { /* best-effort */ }
          onDominantSpeaker?.(e.id);
        });
        // Screen share → put it on the main stage (like Google Meet), not a tile.
        // The event payload shape varies across Jitsi builds, so read both.
        api.addListener('contentSharingParticipantsChanged', (e: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
          const ids: string[] = e?.data?.sharingParticipantIds || e?.sharingParticipantIds || (Array.isArray(e) ? e : []);
          if (ids && ids.length) {
            try { api.executeCommand('setTileView', false); } catch { /* older build */ }
            try { api.setLargeVideoParticipant?.(ids[ids.length - 1]); } catch { /* optional */ }
          }
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
  }, [domain, room, role, privateChat, polls]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={containerRef} className="w-full h-full min-h-[420px] rounded-xl overflow-hidden bg-slate-900" />;
}
