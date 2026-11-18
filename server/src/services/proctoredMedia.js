/**
 * The recordings and proctor log behind a proctored attempt — shared by
 * interviews and quizzes, so both store, check and show them the same way.
 *
 *   - the proctor log is appended in the database, never read-modify-written;
 *   - a video answer goes from the browser straight to Cloudinary on a signed
 *     upload that can only land on its own answer, or through us as a fallback;
 *   - a recording may still arrive briefly after submit, never after grading;
 *   - the log is split for review into snapshots (camera / screen) and flags.
 */
const { sequelize } = require('../db');
const { ValidationError } = require('../utils/errors/errorTypes');
const { uploadToCloudinary } = require('../utils/cloudinaryUpload');
const rules = require('./proctoringRules');

// Only these tables carry a proctor log; the name is never taken from a request.
const LOG_TABLES = new Set(['interview_sessions', 'quiz_sessions', 'assessment_submissions']);

/**
 * Add events to the end of a session's proctor log in one statement.
 *
 * Camera shots, screen shots and the event flush arrive at the same time; a
 * read-then-write of the whole array let one of them overwrite the others.
 * `||` on jsonb appends in the database, where concurrent writers queue.
 */
async function appendProctorEvents(table, sessionId, events) {
  if (!LOG_TABLES.has(table)) throw new Error(`No proctor log on ${table}`);
  if (!events.length) return;
  await sequelize.query(
    `UPDATE ${table} SET proctor_log = COALESCE(proctor_log, '[]'::jsonb) || CAST(:events AS jsonb), updated_at = NOW() WHERE id = :id`,
    { replacements: { events: JSON.stringify(events), id: sessionId } },
  );
}

/**
 * Events a client sent, made safe to store: a cap on how many, known shapes
 * only, and never a `snapshot` — those are written by the server alone, after
 * it stored the picture, so a client can't put a URL of its choosing in front
 * of a mentor.
 */
function cleanClientEvents(events) {
  if (!Array.isArray(events)) return [];
  return events
    .slice(0, 500)
    .filter((e) => e && typeof e.type === 'string' && e.type !== 'snapshot')
    .map((e) => ({
      type: e.type.slice(0, 60),
      at: e.at || new Date().toISOString(),
      meta: e.meta && typeof e.meta === 'object' && !Array.isArray(e.meta) ? e.meta : {},
    }));
}

/** Store one proctor snapshot image and log it. `source`: 'camera' | 'screen'. */
async function storeSnapshot(table, sessionId, file, { questionId = null, source = 'camera', folder }) {
  if (!file || !file.buffer) throw new ValidationError('No snapshot received');
  if (!String(file.mimetype || '').startsWith('image/')) throw new ValidationError('A snapshot must be an image');
  const result = await uploadToCloudinary(file.buffer, folder, 'image');
  const meta = { url: result.secure_url, publicId: result.public_id, source: source === 'screen' ? 'screen' : 'camera' };
  if (questionId) meta.questionId = String(questionId);
  await appendProctorEvents(table, sessionId, [{ type: 'snapshot', at: new Date().toISOString(), meta }]);
  return { url: result.secure_url };
}

/**
 * Permission for the browser to upload one video straight to Cloudinary, fixed
 * to `publicId`. `{ direct: false }` when Cloudinary isn't set up for it, and
 * the client sends the file through us instead.
 */
function signDirectVideo(publicId) {
  const cloudinary = require('../config/cloudinary');
  const { cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret } = cloudinary.config();
  if (!cloudName || !apiKey || !apiSecret) return { direct: false };
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = cloudinary.utils.api_sign_request({ public_id: publicId, timestamp }, apiSecret);
  return {
    direct: true,
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`,
    fields: { api_key: apiKey, timestamp: String(timestamp), public_id: publicId, signature },
    publicId,
  };
}

/**
 * Where a video answer ended up: the file uploaded through us, or a direct
 * upload we signed — which is only trusted when its id is one we could have
 * signed for this answer (`prefix`) and Cloudinary confirms it is there.
 */
async function resolveVideo({ file = null, publicId = null, prefix, folder }) {
  if (file && file.buffer) {
    try {
      const result = await uploadToCloudinary(file.buffer, folder, 'video');
      return { url: result.secure_url, publicId: result.public_id };
    } catch (err) {
      console.error('[proctored] video upload to Cloudinary failed:', { message: err?.message, httpCode: err?.http_code, bytes: file.buffer?.length });
      throw new ValidationError('Video upload failed. Please check your connection and try again.');
    }
  }
  if (!publicId) throw new ValidationError('No video received');
  const id = String(publicId);
  if (!id.startsWith(prefix)) throw new ValidationError('That video does not belong to this answer');
  const cloudinary = require('../config/cloudinary');
  try {
    const resource = await cloudinary.api.resource(id, { resource_type: 'video' });
    return { url: resource.secure_url, publicId: resource.public_id };
  } catch (err) {
    console.error('[proctored] video lookup failed:', { publicId: id, message: err?.message || err?.error?.message });
    throw new ValidationError('We could not find that video. Please record it again.');
  }
}

/** Remove a recording that has been replaced. Best-effort; never blocks the answer. */
function removeRecording(publicId) {
  if (!publicId) return;
  const { deleteFromCloudinary } = require('../utils/cloudinaryUpload');
  deleteFromCloudinary(publicId, 'video').catch((err) => console.error('[proctored] old recording delete failed:', err?.message));
}

/**
 * May a recording still land on this session? While it is open, yes; once
 * submitted, only within the grace window, and never once the task is complete
 * (that would change an answer after it was graded).
 */
function recordingStillAccepted(session, taskStatus) {
  if (session.status === 'in_progress') return true;
  const age = Date.now() - new Date(session.submittedAt || 0).getTime();
  return age >= 0 && age <= rules.LATE_UPLOAD_GRACE_MS && !!taskStatus && taskStatus !== 'completed';
}

/**
 * The proctor log as a reviewer reads it: snapshots (with where they came from
 * and the question on screen) and every other event as a flag, with counts.
 * A snapshot without a question id is placed under the question whose answer
 * started most recently before it (older attempts didn't record one).
 */
function splitProctorLog(log = [], answers = []) {
  const starts = answers
    .filter((a) => a.startedAt)
    .map((a) => ({ questionId: a.questionId, t: new Date(a.startedAt).getTime() }))
    .sort((x, y) => x.t - y.t);
  const bucket = (at) => {
    const t = new Date(at).getTime();
    let qid = null;
    for (const s of starts) { if (s.t <= t) qid = s.questionId; else break; }
    return qid;
  };
  const snapshots = log.filter((e) => e.type === 'snapshot').map((e) => ({
    url: e.meta?.url,
    at: e.at,
    questionId: e.meta?.questionId || bucket(e.at),
    source: e.meta?.source === 'screen' ? 'screen' : 'camera',
  }));
  const flags = log.filter((e) => e.type !== 'snapshot');
  const flagCounts = flags.reduce((m, e) => { m[e.type] = (m[e.type] || 0) + 1; return m; }, {});
  return { snapshots, flags, flagCounts };
}

/** Delete every snapshot image in a log; returns the log without them. */
async function deleteSnapshotImages(log = []) {
  const { deleteFromCloudinary } = require('../utils/cloudinaryUpload');
  const snapshots = log.filter((e) => e.type === 'snapshot');
  await Promise.all(snapshots.map(async (e) => {
    const pid = e.meta?.publicId;
    if (pid) { try { await deleteFromCloudinary(pid, 'image'); } catch (err) { console.error('[proctored] snapshot delete failed:', err?.message); } }
  }));
  return { kept: log.filter((e) => e.type !== 'snapshot'), deleted: snapshots.length };
}

module.exports = {
  appendProctorEvents,
  cleanClientEvents,
  storeSnapshot,
  signDirectVideo,
  resolveVideo,
  removeRecording,
  recordingStillAccepted,
  splitProctorLog,
  deleteSnapshotImages,
};
