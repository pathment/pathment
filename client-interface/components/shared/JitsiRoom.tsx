'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

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

/** Channel used to make sure ONE browser tab at a time is in a given room. */
const TAB_CHANNEL = 'pathment-call';

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
  domain, room, displayName, avatarUrl, role = 'guest', privateChat = false, polls = false, startWithVideoMuted = false, onJoined, onLeft, onReadyToClose, onParticipantJoined, onParticipantLeft, onDominantSpeaker, onSelfDominantChange, onError,
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
  /** Join with the local camera off (mentee pre-join choice). */
  startWithVideoMuted?: boolean;
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

  // Callbacks live in a ref so they are NOT effect dependencies. Two reasons:
  // (1) the iframe must not be torn down and rebuilt just because the parent
  // re-rendered, and (2) the listeners always see the LATEST callback — the old
  // code captured whatever closure existed at mount, so e.g. the mentor's
  // "end & score" handler could still point at a previous session id.
  const cbRef = useRef({ onJoined, onLeft, onReadyToClose, onParticipantJoined, onParticipantLeft, onDominantSpeaker, onSelfDominantChange, onError });
  // The most recent identity, read at join time (a late-arriving name shouldn't
  // need a remount to take effect).
  const identityRef = useRef({ displayName, avatarUrl });
  useEffect(() => {
    cbRef.current = { onJoined, onLeft, onReadyToClose, onParticipantJoined, onParticipantLeft, onDominantSpeaker, onSelfDominantChange, onError };
    identityRef.current = { displayName, avatarUrl };
  });

  // Another tab of this browser joined the same room, so this one stepped out —
  // otherwise the person appears TWICE in the call (once per tab).
  const [superseded, setSuperseded] = useState(false);
  // Bumped by "Rejoin here" to re-run the effect and re-claim the room.
  const [joinNonce, setJoinNonce] = useState(0);
  const rejoin = useCallback(() => { setSuperseded(false); setJoinNonce((n) => n + 1); }, []);
  // Stable for the life of this component, so rebuilding the room (a polls
  // toggle, "Reload video") is never mistaken for a second tab claiming it.
  // (useId is no good here: it is derived from tree position, so two tabs would
  // produce the SAME id and neither would recognise the other.)
  const [tabId] = useState(() => (typeof window === 'undefined' ? '' : window.crypto.randomUUID()));

  useEffect(() => {
    if (superseded) return;
    let disposed = false;
    // While THIS room instance is being torn down (prop change, unmount) Jitsi
    // still fires `readyToClose` / `videoConferenceLeft`. Those must not reach the
    // parent: for the mentor, `onReadyToClose` ends the meeting for everyone, so
    // a simple "Polls" toggle would have ended the whole review. Deliberately a
    // per-run local (not a ref) so a previous, still-closing room can never
    // un-suppress itself when the next one starts.
    let tearingDown = false;
    // Our own node inside the container. We create it (rather than handing Jitsi
    // React's div) so that on teardown we can move the iframe OUT of the React
    // tree and let it finish leaving the conference before it is destroyed.
    const host = document.createElement('div');
    host.style.width = '100%';
    host.style.height = '100%';
    containerRef.current?.appendChild(host);

    /**
     * Leave the conference properly, THEN dispose. Just calling dispose() rips
     * the iframe out of the DOM before Jitsi can send its "I'm leaving" presence,
     * so the server keeps the participant around until it times out — which is
     * why people showed up twice after a reload, a reconnect, or any prop change
     * that rebuilt the room (the ghost still held the moderator badge).
     */
    const teardown = () => {
      const api = apiRef.current;
      apiRef.current = null;
      tearingDown = true;
      if (!api) { host.remove(); return; }

      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        try { api.dispose(); } catch { /* already gone */ }
        host.remove();
      };
      // `hangup` ends with `readyToClose` — dispose a beat later so the leave is
      // fully flushed, with the timeout below as the backstop if it never fires.
      try { api.addListener('readyToClose', () => setTimeout(finish, 250)); } catch { /* older build */ }
      try {
        api.executeCommand('hangup');
      } catch {
        finish();
        return;
      }
      // Park the iframe off-screen, outside the container React is about to
      // remove, so the leave actually reaches the server.
      try {
        host.style.cssText = 'position:fixed;left:-99999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
        document.body.appendChild(host);
      } catch { /* container already detached — dispose below still runs */ }
      setTimeout(finish, 2_000);
    };

    // Closing / reloading the tab: hang up so the server drops us immediately
    // instead of leaving a ghost participant behind for the next connection.
    const onPageHide = () => { try { apiRef.current?.executeCommand('hangup'); } catch { /* best-effort */ } };
    window.addEventListener('pagehide', onPageHide);

    // One tab per room. When another tab of this browser claims the room, this
    // instance leaves rather than joining twice under the same name.
    let channel: BroadcastChannel | null = null;
    // (tabId is stable per mounted component — see the useState above.)
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        channel = new BroadcastChannel(TAB_CHANNEL);
        channel.onmessage = (ev: MessageEvent) => {
          const data = ev.data as { type?: string; room?: string; tabId?: string } | null;
          if (data?.type === 'claim' && data.room === room && data.tabId !== tabId) setSuperseded(true);
        };
        channel.postMessage({ type: 'claim', room, tabId });
      } catch { /* no cross-tab guard available; a duplicate is still recoverable */ }
    }

    // The toolbar the user gets. Passed BOTH as config.toolbarButtons (what
    // current Jitsi reads) and as interfaceConfig.TOOLBAR_BUTTONS (older builds)
    // — if only the deprecated one is sent, a newer deployment silently ignores
    // it and mentees get the full toolbar, invite button and all.
    const toolbar = [...(role === 'host' ? HOST_TOOLBAR : GUEST_TOOLBAR), ...(polls ? ['polls'] : [])];

    loadJitsi(domain)
      .then(() => {
        if (disposed || !window.JitsiMeetExternalAPI) return;
        const api = new window.JitsiMeetExternalAPI(domain, {
          roomName: room,
          parentNode: host,
          userInfo: identityRef.current.displayName ? { displayName: identityRef.current.displayName } : undefined,
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
            startWithVideoMuted,
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
            // Modern equivalents of the interfaceConfig keys below. Recent Jitsi
            // reads these and ignores interfaceConfig, so both are set.
            toolbarButtons: toolbar,
            defaultLocalDisplayName: 'You',
            // Someone who reaches the room WITHOUT an identity (straight from the
            // room URL rather than through Pathment) reads as "Guest" instead of
            // Jitsi's stock "Fellow Jitster".
            defaultRemoteDisplayName: 'Guest',
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
            TOOLBAR_BUTTONS: toolbar,
            DEFAULT_LOCAL_DISPLAY_NAME: 'You',
            DEFAULT_REMOTE_DISPLAY_NAME: 'Guest',
          },
        });
        apiRef.current = api;
        // Seed the roster with whoever is ALREADY in the room — `participantJoined`
        // only fires for people who arrive after us, so without this a mentee who
        // joined before the host opened the panel would never be identifiable
        // (and so could never be credited for speaking).
        api.addListener('videoConferenceJoined', (e: { id?: string }) => {
          if (tearingDown) return;
          if (e?.id) localIdRef.current = e.id; // our own participant id (for self-dominant)
          // Re-assert our identity. `userInfo` sets the name at construction, but
          // it does not always survive (a stored name on the Jitsi origin, a
          // reconnect) and everyone else then sees "Fellow Jitster". Sending the
          // command after joining also re-broadcasts the name to the room.
          const { displayName: name, avatarUrl: avatar } = identityRef.current;
          if (name) { try { api.executeCommand('displayName', name); } catch { /* optional */ } }
          try {
            const existing = api.getParticipantsInfo?.() || [];
            for (const p of existing) {
              if (p?.participantId) cbRef.current.onParticipantJoined?.({ id: p.participantId, displayName: p.displayName || p.formattedDisplayName });
            }
          } catch { /* roster seeding is best-effort */ }
          // Show the Pathment profile picture instead of Jitsi's initials.
          if (avatar) { try { api.executeCommand('avatarUrl', avatar); } catch { /* optional */ } }
          cbRef.current.onJoined?.();
        });
        api.addListener('videoConferenceLeft', () => { if (!tearingDown) cbRef.current.onLeft?.(); });
        // `readyToClose` = the user hung up (red button / "end for all"). Wire it
        // so hanging up runs the same flow as the panel's own End button — but
        // never during our own teardown (see tearingDown).
        api.addListener('readyToClose', () => { if (!tearingDown) cbRef.current.onReadyToClose?.(); });
        api.addListener('participantJoined', (p: JitsiParticipant) => cbRef.current.onParticipantJoined?.(p));
        api.addListener('participantLeft', (p: JitsiParticipant) => cbRef.current.onParticipantLeft?.(p));
        // Names often aren't on `participantJoined` (Jitsi sends them a beat later).
        // Capture `displayNameChanged` too, so speaker→roster matching works.
        api.addListener('displayNameChanged', (e: { id: string; displayname?: string; displayName?: string }) => {
          const name = e.displayName || e.displayname;
          if (e.id && name) cbRef.current.onParticipantJoined?.({ id: e.id, displayName: name });
        });
        api.addListener('dominantSpeakerChanged', (e: { id: string }) => {
          // Self-report path (robust, no name matching): tell the local user when
          // THEY are / aren't the dominant speaker.
          cbRef.current.onSelfDominantChange?.(e.id === localIdRef.current);
          // Resolve the speaker's CURRENT name right now (participantJoined may have
          // fired before the name was set) so their talk time can be attributed.
          try {
            const info = (api.getParticipantsInfo?.() || []).find((p: { participantId?: string }) => p.participantId === e.id);
            const name = (info as { displayName?: string; formattedDisplayName?: string } | undefined);
            const resolved = name?.displayName || name?.formattedDisplayName;
            if (resolved) cbRef.current.onParticipantJoined?.({ id: e.id, displayName: resolved });
          } catch { /* best-effort */ }
          cbRef.current.onDominantSpeaker?.(e.id);
        });
        // Screen share → put it on the main stage (like Google Meet), not a tile.
        // The event payload shape varies across Jitsi builds, so read both.
        api.addListener('contentSharingParticipantsChanged', (e: any) => {
          const ids: string[] = e?.data?.sharingParticipantIds || e?.sharingParticipantIds || (Array.isArray(e) ? e : []);
          if (ids && ids.length) {
            try { api.executeCommand('setTileView', false); } catch { /* older build */ }
            try { api.setLargeVideoParticipant?.(ids[ids.length - 1]); } catch { /* optional */ }
          }
        });
      })
      .catch((e) => cbRef.current.onError?.(e?.message || 'Could not start the video'));

    return () => {
      disposed = true;
      window.removeEventListener('pagehide', onPageHide);
      try { channel?.close(); } catch { /* already closed */ }
      teardown();
    };
    // Only room identity + the config knobs Jitsi can't change after construction
    // rebuild the call. Callbacks and identity are read through refs.
  }, [domain, room, role, privateChat, polls, startWithVideoMuted, superseded, joinNonce, tabId]);

  if (superseded) {
    return (
      <div className="w-full h-full rounded-xl bg-slate-900 flex flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-sm text-slate-200">You opened this call in another tab.</p>
        <p className="text-xs text-slate-400">Only one tab can be in the call, otherwise you appear twice to everyone else.</p>
        <button onClick={rejoin} className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20">
          Rejoin here
        </button>
      </div>
    );
  }

  // Sizing is the container's business — this fills whatever it is given. (It
  // used to force min-h-[420px], which blows out the floating call window.)
  return <div ref={containerRef} className="w-full h-full rounded-xl overflow-hidden bg-slate-900" />;
}
