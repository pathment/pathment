/**
 * The rules of a proctored assessment (an interview or a quiz), in one place.
 *
 * Who needs what:
 *   - camera  when the mentor asked for proctoring, or any question is answered
 *             on video (you cannot record a video answer without one);
 *   - screen  when the mentor asked for proctoring. "Proctored" means the whole
 *             picture: the face on the camera AND what is on the screen;
 *   - video   when any question is answered on video.
 *
 * A client says what it can do when it starts an attempt. Anything that cannot
 * share a screen or record video (the phone app, an old cached web bundle) is
 * turned away before the clock starts, with a message that says where to take
 * it instead, rather than letting it limp through an attempt it can't run.
 *
 * Pure: no database, so the runners, the reviews and the tests read one truth.
 */

const VIDEO_KIND = 'video';

/** Seconds a single video answer may run. The cap keeps a file inside the upload limit. */
const RECORDING = { min: 15, max: 300, fallback: 120 };

/** How long after submitting a background upload may still land on its answer. */
const LATE_UPLOAD_GRACE_MS = 15 * 60 * 1000;

const CAPABILITIES = ['video', 'screen'];

/** `proctored`: the mentor's "full proctoring" switch (interviews call it cameraRequired). */
function requirementsFor({ proctored, questions = [] }) {
  const video = questions.some((q) => q && q.kind === VIDEO_KIND);
  return { camera: Boolean(proctored) || video, screen: Boolean(proctored), video };
}

/** The capabilities a client declared, cleaned to the ones we know. */
function parseCapabilities(raw) {
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : [];
  return new Set(list.map((c) => String(c).trim().toLowerCase()).filter((c) => CAPABILITIES.includes(c)));
}

/**
 * What this client is missing for these requirements, or null when it can run
 * the interview. Camera is not checked here: every client we ship has one, and
 * a missing camera is caught live by the runner.
 */
function missingCapability(requirements, capabilities) {
  if (requirements.screen && !capabilities.has('screen')) return 'screen';
  if (requirements.video && !capabilities.has('video')) return 'video';
  return null;
}

function unsupportedClientMessage(missing, noun = 'interview') {
  const why = missing === 'screen'
    ? `This ${noun} is proctored with screen sharing`
    : `This ${noun} has questions you answer on video`;
  return `${why}, which this app can't do. Open it on a laptop or desktop in Chrome, Edge or Firefox to take it.`;
}

/** A video question's recording cap, clamped to what an upload can carry. */
function maxRecordingSeconds(config) {
  const n = Number.parseInt(config && config.maxRecordingSeconds, 10);
  if (!Number.isFinite(n)) return RECORDING.fallback;
  return Math.min(RECORDING.max, Math.max(RECORDING.min, n));
}

/**
 * Where one answer's video lives. The session and question are in the path, so
 * a signed upload can only ever land on the answer it was signed for, and the
 * server can tell by the id alone whether a finished upload is theirs.
 */
function videoPublicIdPrefix(area, sessionId, questionId) {
  return `pathment/${area}/videos/${sessionId}/${questionId}-`;
}

/**
 * The audio track of a Cloudinary video as an mp3, for transcription. Cloudinary
 * converts on delivery when the extension changes, which keeps a several-minute
 * video small enough for Whisper. Anything not on Cloudinary is returned as is.
 */
function audioTrackUrl(url) {
  if (!url || !/res\.cloudinary\.com\/[^/]+\/video\/upload\//.test(url)) return url;
  return url.replace(/\.[a-z0-9]+(\?.*)?$/i, '.mp3$1');
}

module.exports = {
  VIDEO_KIND,
  RECORDING,
  LATE_UPLOAD_GRACE_MS,
  requirementsFor,
  parseCapabilities,
  missingCapability,
  unsupportedClientMessage,
  maxRecordingSeconds,
  videoPublicIdPrefix,
  audioTrackUrl,
};
