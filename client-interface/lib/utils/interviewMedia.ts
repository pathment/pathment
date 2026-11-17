/**
 * Zero-cost browser media helpers for the interview runner:
 *  - speak()            interviewer voice via the free Web Speech Synthesis API.
 *  - createRecognizer() live speech-to-text via webkitSpeechRecognition (free, no
 *                       server round-trip). Groq Whisper is the paid upgrade later.
 *  - VoiceRecorder      wraps MediaRecorder to capture the raw audio blob (kept
 *                       permanently) alongside the live transcript.
 * All are feature-detected so an unsupported browser degrades gracefully.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export const speechSupported = () =>
  typeof window !== 'undefined' && 'speechSynthesis' in window;

export const recognitionSupported = () =>
  typeof window !== 'undefined' &&
  ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window);

export const recorderSupported = () =>
  typeof window !== 'undefined' && typeof (window as any).MediaRecorder !== 'undefined' &&
  !!navigator.mediaDevices?.getUserMedia;

/** Speak a prompt aloud. Resolves when finished (or immediately if unsupported).
 *  `pitch` (0–2) and `rate` (0.5–2) always apply; `voiceName` is best-effort —
 *  the mentor's chosen voice may not exist on the candidate's device, so we match
 *  by name then fall back to a natural English voice. */
export function speak(
  text: string,
  opts: { rate?: number; pitch?: number; voiceName?: string | null; onStart?: () => void; onEnd?: () => void } = {},
): void {
  if (!speechSupported() || !text) { opts.onStart?.(); opts.onEnd?.(); return; }
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = opts.rate ?? 1;
    u.pitch = opts.pitch ?? 1;
    const voices = window.speechSynthesis.getVoices();
    const chosen = opts.voiceName ? voices.find((v) => v.name === opts.voiceName) : null;
    const preferred = chosen
      || voices.find((v) => /en(-|_)?(US|GB)/i.test(v.lang) && /natural|google|samantha|daniel/i.test(v.name))
      || voices.find((v) => /^en/i.test(v.lang));
    if (preferred) u.voice = preferred;
    if (opts.onStart) u.onstart = opts.onStart;
    if (opts.onEnd) { u.onend = opts.onEnd; u.onerror = opts.onEnd; }
    window.speechSynthesis.speak(u);
    // Fallback: some browsers fire onstart late/never — signal start optimistically.
    opts.onStart?.();
  } catch {
    opts.onStart?.();
    opts.onEnd?.();
  }
}

/** List available TTS voices (for the mentor's picker). May be empty until the
 *  browser loads them — the caller should also listen to `voiceschanged`. */
export function listVoices(): { name: string; lang: string }[] {
  if (!speechSupported()) return [];
  try { return window.speechSynthesis.getVoices().map((v) => ({ name: v.name, lang: v.lang })); }
  catch { return []; }
}

export function stopSpeaking(): void {
  if (speechSupported()) {
    try { window.speechSynthesis.cancel(); } catch { /* noop */ }
  }
}

/**
 * A live transcriber. Calls onTranscript with the accumulated final text as the
 * candidate speaks. Returns a controller; call stop() when the answer is done.
 *
 * Chrome's speech recognition quietly ENDS the session on pauses, silence or an
 * internal timeout (even with continuous=true), which drops words mid-flow. We
 * keep a `running` intent and auto-restart on `onend`, accumulating final text
 * across restarts, so a long answer transcribes continuously. (The recorded
 * audio is the ground truth regardless — this only improves the live transcript.)
 */
export function createRecognizer(onTranscript: (fullText: string) => void) {
  if (!recognitionSupported()) return null;
  const Ctor = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
  const rec = new Ctor();
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  rec.lang = 'en-US';
  let finalText = '';
  let running = false;   // whether we WANT it capturing
  let restartTimer: ReturnType<typeof setTimeout> | null = null;

  rec.onresult = (event: any) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const t = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalText += t + ' ';
      else interim += t;
    }
    onTranscript((finalText + interim).trim());
  };

  rec.onerror = (e: any) => {
    // Permission errors are terminal; 'no-speech'/'network'/'aborted' are transient
    // and handled by the onend → restart path below.
    if (e?.error === 'not-allowed' || e?.error === 'service-not-allowed') running = false;
  };

  rec.onend = () => {
    // Restart if the candidate is still recording — keeps capturing after Chrome
    // ends the session on a pause. A tiny delay avoids a tight restart loop.
    if (!running) return;
    if (restartTimer) clearTimeout(restartTimer);
    restartTimer = setTimeout(() => { try { rec.start(); } catch { /* will retry on next end */ } }, 250);
  };

  return {
    start: () => { finalText = ''; running = true; try { rec.start(); } catch { /* already started */ } },
    stop: () => {
      running = false;
      if (restartTimer) { clearTimeout(restartTimer); restartTimer = null; }
      try { rec.stop(); } catch { /* noop */ }
    },
    getFinal: () => finalText.trim(),
  };
}

/** Records mic audio to a single webm blob. */
export class VoiceRecorder {
  private stream: MediaStream | null = null;
  private recorder: any = null;
  private chunks: BlobPart[] = [];

  async start(): Promise<boolean> {
    if (!recorderSupported()) return false;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.chunks = [];
      this.recorder = new (window as any).MediaRecorder(this.stream, { mimeType: 'audio/webm' });
      this.recorder.ondataavailable = (e: any) => { if (e.data?.size > 0) this.chunks.push(e.data); };
      this.recorder.start();
      return true;
    } catch {
      this.cleanup();
      return false;
    }
  }

  /** The live mic stream (for a level meter / waveform) while recording. */
  getStream(): MediaStream | null {
    return this.stream;
  }

  stop(): Promise<Blob | null> {
    return new Promise((resolve) => {
      if (!this.recorder) { resolve(null); return; }
      this.recorder.onstop = () => {
        const blob = this.chunks.length ? new Blob(this.chunks, { type: 'audio/webm' }) : null;
        this.cleanup();
        resolve(blob);
      };
      try { this.recorder.stop(); } catch { this.cleanup(); resolve(null); }
    });
  }

  private cleanup() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.recorder = null;
  }
}

/** mm:ss for a seconds count. */
export const fmtClock = (secs: number): string => {
  const s = Math.max(0, Math.floor(secs));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// ── Video answers and screen proctoring ─────────────────────────────────────

/** Can this browser share the whole screen? (No phone browser can.) */
export const screenShareSupported = () =>
  typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia;

/** The best container this browser records video into, or null if it can't. */
export function pickVideoMime(): string | null {
  if (typeof window === 'undefined' || typeof (window as any).MediaRecorder === 'undefined') return null;
  const MR = (window as any).MediaRecorder;
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4;codecs=avc1,mp4a', // Safari
    'video/mp4',
  ];
  for (const c of candidates) {
    try { if (MR.isTypeSupported?.(c)) return c; } catch { /* keep looking */ }
  }
  return null;
}

export const videoRecordingSupported = () => recorderSupported() && pickVideoMime() !== null;

/**
 * Bitrates for a video answer: enough to read a face and a whiteboard, small
 * enough that the longest allowed answer (5 min) stays near 20MB.
 */
const VIDEO_BITS = 450_000;
const AUDIO_BITS = 64_000;
/** Largest video we will try to send; the server's fallback path takes 25MB. */
export const MAX_VIDEO_BYTES = 24 * 1024 * 1024;

/**
 * Records one video answer from the camera already in use plus a fresh mic.
 *
 * The camera is shared with proctoring (its preview feeds the snapshots), so
 * the recorder works on a CLONE of that track: stopping the recording stops
 * the clone, never the proctoring camera. If the camera dies mid-answer (turned
 * off, unplugged) the clone ends too; `onInterrupted` fires and whatever was
 * recorded so far is kept, so the candidate can send it or record again.
 */
export class VideoAnswerRecorder {
  private stream: MediaStream | null = null;
  private recorder: any = null;
  private chunks: BlobPart[] = [];
  private mime = 'video/webm';
  private stopping: Promise<Blob | null> | null = null;
  startedAt = 0;

  constructor(private readonly onInterrupted?: (reason: 'camera' | 'mic' | 'error') => void) {}

  /** Start recording. Returns null on success, or what went wrong. */
  async start(cameraTrack: MediaStreamTrack | null): Promise<null | 'unsupported' | 'camera' | 'mic'> {
    const mime = pickVideoMime();
    if (!mime || !recorderSupported()) return 'unsupported';
    this.mime = mime;

    let video: MediaStreamTrack | null = null;
    if (cameraTrack && cameraTrack.readyState === 'live') {
      video = cameraTrack.clone();
    } else {
      try {
        video = (await navigator.mediaDevices.getUserMedia({ video: true })).getVideoTracks()[0] || null;
      } catch { return 'camera'; }
    }
    if (!video) return 'camera';
    // Keep the file small; a camera that can't honour this just records as is.
    video.applyConstraints?.({ width: { ideal: 854 }, height: { ideal: 480 }, frameRate: { max: 24 } }).catch(() => { });

    let audio: MediaStreamTrack | null = null;
    try {
      audio = (await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })).getAudioTracks()[0] || null;
    } catch { video.stop(); return 'mic'; }
    if (!audio) { video.stop(); return 'mic'; }

    this.stream = new MediaStream([video, audio]);
    this.chunks = [];
    try {
      this.recorder = new (window as any).MediaRecorder(this.stream, {
        mimeType: mime, videoBitsPerSecond: VIDEO_BITS, audioBitsPerSecond: AUDIO_BITS,
      });
    } catch {
      this.cleanup();
      return 'unsupported';
    }
    this.recorder.ondataavailable = (e: any) => { if (e.data?.size > 0) this.chunks.push(e.data); };
    this.recorder.onerror = () => this.onInterrupted?.('error');
    video.addEventListener('ended', () => this.onInterrupted?.('camera'));
    audio.addEventListener('ended', () => this.onInterrupted?.('mic'));
    // A chunk a second, so an interruption still leaves everything up to it.
    this.recorder.start(1000);
    this.startedAt = Date.now();
    this.stopping = null;
    return null;
  }

  get recording(): boolean { return !!this.recorder && this.recorder.state === 'recording'; }

  /** The live stream, for the on-screen preview while recording. */
  getStream(): MediaStream | null { return this.stream; }

  /** Stop and hand back the recording (safe to call twice; both get the same blob). */
  stop(): Promise<Blob | null> {
    if (this.stopping) return this.stopping;
    this.stopping = new Promise((resolve) => {
      const rec = this.recorder;
      const finish = () => {
        const type = this.mime.split(';')[0];
        const blob = this.chunks.length ? new Blob(this.chunks, { type }) : null;
        this.cleanup();
        resolve(blob);
      };
      if (!rec || rec.state === 'inactive') { finish(); return; }
      rec.onstop = finish;
      try { rec.stop(); } catch { finish(); }
    });
    return this.stopping;
  }

  private cleanup() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.recorder = null;
  }
}

/**
 * One still from a playing <video> as a JPEG, scaled to at most `maxWidth`.
 * Null when there is no frame to take (not playing yet, or a dead track).
 */
export function grabFrame(video: HTMLVideoElement | null, maxWidth = 1280, quality = 0.6): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (!video || video.readyState < 2 || !video.videoWidth) { resolve(null); return; }
    const track = (video.srcObject as MediaStream | null)?.getVideoTracks?.()[0];
    if (!track || track.readyState !== 'live' || track.muted) { resolve(null); return; }
    const scale = Math.min(1, maxWidth / video.videoWidth);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) { resolve(null); return; }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
  });
}

/** A delay somewhere in [min, max] ms, so snapshot times can't be predicted. */
export const randomDelay = (min: number, max: number) => min + Math.random() * Math.max(0, max - min);
