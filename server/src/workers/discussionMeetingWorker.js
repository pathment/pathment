/**
 * discussionMeetingWorker — group discussion meeting reminders, every minute.
 *
 * The notification scheduler runs hourly, which is fine for a 24h reminder and
 * useless for a 10 minute one, so the meeting reminder gets its own short loop.
 * Each tick is two indexed queries per workspace (see migration 147) and the
 * reminder claim is a conditional update, so running several servers is safe.
 */
const POLL_MS = Number(process.env.DISCUSSION_MEETING_WORKER_POLL_MS) || 60 * 1000;

let timer = null;
let running = false;

async function tick() {
  if (running) return; // never overlap ticks
  running = true;
  try {
    const service = require('../services/discussionMeetingService');
    await require('../utils/workspaceExecution').forEachWorkspace(() => service.tick());
  } catch (err) {
    console.error('[discussion-meeting-worker] tick error:', err?.message);
  } finally {
    running = false;
  }
}

function start() {
  if (timer) return;
  timer = setInterval(tick, POLL_MS);
  if (timer.unref) timer.unref();
  console.log(`✓ Discussion meeting worker started (poll ${POLL_MS}ms)`);
}

function stop() {
  if (timer) { clearInterval(timer); timer = null; }
}

module.exports = { start, stop, tick };
