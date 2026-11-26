# 0001 — PostgreSQL is the job queue; no Redis, no Bull

**Status:** accepted, in production.

## Decision

Every background queue in Pathment is a PostgreSQL table. Workers claim rows with
`SELECT … FOR UPDATE SKIP LOCKED`, so several workers can run with no coordination
service. There is no Redis and no Bull in the dependency tree.

## Evidence in this repository

- `server/package.json` dependencies contain no `redis`, `ioredis`, `bull` or `bullmq`.
- `server/src/services/emailService.js:341` — `claimDue()` documented as
  *"Atomically claim a batch of due rows (FOR UPDATE SKIP LOCKED = multi-worker safe)"*.
- The same claim pattern in `src/workers/syncWorker.js:31`,
  `src/webhooks/webhookService.js:331`, `src/integrations/pullService.js:323`,
  `src/services/dataRetentionService.js:165`, and both RAG workers.
- `server/src/index.js` comment on worker startup: *"Replaces the Redis/Bull invite
  worker — all mail now flows through one Postgres-backed queue, keeping us inside the
  Upstash command budget."*
- Longer write-up: `articles/18-the-database-is-a-fine-queue.md` *(local only — that
  folder is not tracked in git)*.

## What it buys

- **Enqueue is part of the business transaction.** A job row and the write that caused
  it commit together, so they can never disagree.
- One service to run, back up and monitor instead of two.
- No per-command billing ceiling to design around.

## What it costs

- Queue work competes with application queries for the same database connections.
- Polling, not push: a worker's latency floor is its poll interval.
- Claim queries are raw SQL, so they **bypass the ORM tenant scope** — see
  [0003](0003-workspace-scoping-in-the-orm.md) and
  [../TENANT_SOCKET_WORKER_AUDIT.md](../TENANT_SOCKET_WORKER_AUDIT.md).

## Revisit if

Queue throughput starts affecting request latency, or a job type needs sub-second
dispatch that polling cannot give.

## Related

[features/notifications-and-email.md](../features/notifications-and-email.md),
[incidents/2026-11-19-reengagement-reminder-sent-every-hour.md](../incidents/2026-11-19-reengagement-reminder-sent-every-hour.md)
