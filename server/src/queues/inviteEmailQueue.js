const Queue = require('bull');

/**
 * Parse UPSTASH_REDIS_URL into Bull-compatible redis connection options.
 * Falls back to localhost when the env var is absent (local dev).
 */
function redisOptions() {
  const url = process.env.UPSTASH_REDIS_URL;
  if (!url) {
    return { host: '127.0.0.1', port: 6379 };
  }

  const { hostname, port, password, protocol } = new URL(url);
  return {
    host: hostname,
    port: Number(port) || 6379,
    password: password ? decodeURIComponent(password) : undefined,
    tls: protocol === 'rediss:' ? {} : undefined,
  };
}

// Bull opens 3 Redis connections and runs two background timers:
//   stalledInterval — scans active jobs for stalls (default: 5 s)
//   guardInterval   — checks the delayed queue          (default: 5 s)
// On Upstash free tier (10 k commands/day) those defaults burn ~4 ops/5 s
// continuously, even with zero jobs. We stretch both to 10 minutes.
// Immediate jobs are still processed the instant they arrive because
// the worker uses BRPOPLPUSH — not polling — to pick up waiting jobs.
const FIVE_MINUTES = 5 * 60 * 1000;

const inviteEmailQueue = new Queue('pathment:invite-emails', {
  redis: redisOptions(),
  settings: {
    stalledInterval: FIVE_MINUTES,
    guardInterval: FIVE_MINUTES,
    maxStalledCount: 1,
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 10000 },
    // Delete jobs from Redis as soon as they finish — no keys left behind.
    removeOnComplete: true,
    removeOnFail: true,
  },
});

module.exports = inviteEmailQueue;
