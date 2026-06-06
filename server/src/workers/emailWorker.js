/**
 * emailWorker — DB-backed email queue processor.
 *
 * Polls `email_queue` for due rows and delivers them via emailService. This is
 * deliberately NOT Redis/Bull: at our volume (hundreds–thousands/day) a Postgres
 * poll costs ~nothing and stays well inside the Upstash 500k-commands/month
 * budget, while still giving retries, a dead-letter queue, idempotency and
 * suppression. Runs in-process on the same droplet as the API; the atomic
 * `FOR UPDATE SKIP LOCKED` claim means it's safe even if you later run several.
 */
const emailService = require('../services/emailService');

const POLL_MS = Number(process.env.EMAIL_WORKER_POLL_MS) || 15000; // 15s
const BATCH = Number(process.env.EMAIL_WORKER_BATCH) || 20;        // ≈ Resend rate ceiling per tick

let timer = null;
let running = false;

async function tick() {
  if (running) return; // never overlap ticks
  running = true;
  try {
    let res = await emailService.processBatch(BATCH);
    // Drain bursts within a tick: if we filled the batch, there's likely more.
    let guard = 0;
    while (res.claimed >= BATCH && guard++ < 10) {
      res = await emailService.processBatch(BATCH);
    }
  } catch (err) {
    console.error('[email-worker] tick error:', err?.message);
  } finally {
    running = false;
  }
}

function start() {
  if (timer) return;
  timer = setInterval(tick, POLL_MS);
  if (timer.unref) timer.unref();
  console.log(`✓ Email worker started (poll ${POLL_MS}ms, batch ${BATCH})`);
}

function stop() {
  if (timer) { clearInterval(timer); timer = null; }
}

module.exports = { start, stop, tick };
