const logger = require('../utils/logger');

/**
 * Processes queued sync batches (sync_runs), one at a time per process.
 *
 * A batch is claimed with FOR UPDATE SKIP LOCKED, so several dynos can share
 * the queue without two taking the same batch. It runs inside its own
 * workspace. A batch left "running" by a crash or a restart is queued again
 * after 15 minutes, up to three attempts, then marked failed.
 *
 * Polls every 5 seconds, and `kick()` starts at once when a batch is queued.
 *
 * Scheduled pulls (pull connectors) run on their own loop on the same timer,
 * so a slow source never holds up the batches waiting to be processed.
 */
const POLL_MS = 5000;
const STALE_MINUTES = 15;
const MAX_ATTEMPTS = 3;

let timer;
let running = false;
let again = false;
let pulling = false;

async function claim() {
  const { sequelize } = require('../db');
  const [rows] = await sequelize.query(`
    UPDATE sync_runs SET status = 'running', started_at = NOW(), attempts = attempts + 1, updated_at = NOW()
    WHERE id = (
      SELECT id FROM sync_runs WHERE status = 'queued'
      ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
    )
    RETURNING id, organization_id`);
  return rows[0] || null;
}

async function recoverStale() {
  const { sequelize } = require('../db');
  await sequelize.query(`
    UPDATE sync_runs SET
      status = CASE WHEN attempts >= ${MAX_ATTEMPTS} THEN 'failed' ELSE 'queued' END,
      error_message = CASE WHEN attempts >= ${MAX_ATTEMPTS} THEN 'Stopped before finishing, three times.' ELSE error_message END,
      finished_at = CASE WHEN attempts >= ${MAX_ATTEMPTS} THEN NOW() ELSE finished_at END,
      updated_at = NOW()
    WHERE status = 'running' AND started_at < NOW() - INTERVAL '${STALE_MINUTES} minutes'`);
}

async function tick() {
  if (running) { again = true; return; }
  running = true;
  try {
    await recoverStale();
    const { runWithRequestContext } = require('../utils/auditContext');
    const syncService = require('../integrations/syncService');
    // Drain the queue, one batch after another.
    for (let job = await claim(); job; job = await claim()) {
      // eslint-disable-next-line no-await-in-loop
      await runWithRequestContext({ organizationId: job.organization_id, workspaceJob: true }, () => syncService.process(job.id));
    }
  } catch (error) {
    logger.error('Sync worker pass failed', { message: error.message });
  } finally {
    running = false;
    if (again) { again = false; setImmediate(tick); }
  }
}

/** Pull the connections whose schedule is due, one after another. */
async function pullTick() {
  if (pulling) return;
  pulling = true;
  try {
    const { runWithRequestContext } = require('../utils/auditContext');
    const pulls = require('../integrations/pullService');
    for (let job = await pulls.claimDue(); job; job = await pulls.claimDue()) {
      // eslint-disable-next-line no-await-in-loop
      await runWithRequestContext({ organizationId: job.organization_id, workspaceJob: true }, () => pulls.runScheduled(job));
    }
  } catch (error) {
    logger.error('Scheduled pull pass failed', { message: error.message });
  } finally {
    pulling = false;
  }
}

function start() {
  if (timer) return;
  timer = setInterval(() => { void tick(); void pullTick(); }, POLL_MS);
  timer.unref();
  setTimeout(tick, 3000).unref();
}

/** A batch was just queued: look now rather than at the next poll. */
function kick() {
  if (process.env.NODE_ENV === 'test' && !process.env.SYNC_WORKER_IN_TESTS) return;
  void tick();
}

module.exports = { start, kick, tick, pullTick };
