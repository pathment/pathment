const logger = require('../utils/logger');

/**
 * Sends due webhook deliveries (webhook_deliveries).
 *
 * Each pass leases up to 20 due deliveries — their next_attempt_at moves two
 * minutes out, so another dyno won't take them and a crash just means they
 * are tried again after the lease — then sends them, a few at a time, each in
 * its own workspace. Polls every 5 seconds; `kick()` starts a pass at once
 * when something is queued.
 */
const POLL_MS = 5000;
const CONCURRENCY = 5;

let timer;
let running = false;
let again = false;

async function tick() {
  if (running) { again = true; return; }
  running = true;
  try {
    const { models } = require('../db');
    const { runWithRequestContext } = require('../utils/auditContext');
    const service = require('../webhooks/webhookService');
    for (let batch = await service.claimDue(20); batch.length; batch = await service.claimDue(20)) {
      for (let i = 0; i < batch.length; i += CONCURRENCY) {
        // eslint-disable-next-line no-await-in-loop
        await Promise.all(batch.slice(i, i + CONCURRENCY).map((job) =>
          runWithRequestContext({ organizationId: job.organization_id, workspaceJob: true }, async () => {
            const delivery = await models.WebhookDelivery.findByPk(job.id);
            if (delivery) await service.attempt(delivery);
          }).catch((e) => logger.error('Webhook delivery failed to run', { id: job.id, message: e.message }))));
      }
    }
  } catch (error) {
    logger.error('Webhook worker pass failed', { message: error.message });
  } finally {
    running = false;
    if (again) { again = false; setImmediate(tick); }
  }
}

function start() {
  if (timer) return;
  timer = setInterval(tick, POLL_MS);
  timer.unref();
  setTimeout(tick, 4000).unref();
}

/** Something was just queued: send now rather than at the next poll. */
function kick() {
  if (process.env.NODE_ENV === 'test' && !process.env.WEBHOOK_WORKER_IN_TESTS) return;
  void tick();
}

module.exports = { start, kick, tick };
