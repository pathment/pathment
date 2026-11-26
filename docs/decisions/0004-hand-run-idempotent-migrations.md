# 0004 — Numbered, idempotent migrations, run by hand

**Status:** accepted, in production.

## Decision

Schema changes ship as numbered scripts in `server/scripts/migrations/`. Each one is
idempotent, supports `--rollback`, and is recorded in a `schema_migrations` table.
They are **run by hand**, before the code that needs them — not from a release phase
and not from CI.

## Evidence in this repository

- `server/scripts/migrate.js` — header documents `--status`, `--include-drops`,
  `--baseline`; destructive `*drop*` migrations are skipped unless asked for.
- `server/scripts/migrations/157_pricing_v2.js` is the current highest number and shows
  the house style: a prose header, an explicit `Run:` and `Rollback:` line, "safe to run
  twice".
- A release phase was added (`d27f9bcb`, 2026-11-04, *"run database migrations before
  release"*) and removed the same day (`19432bbb`, *"run migrations manually"*).
- `server/heroku.yml` has a `build` block only — no `release` block.
- `server/RELEASE.md` makes the preflight explicit: diff `server/src/models/` against
  `server/scripts/migrations/` between `main` and `staging`, and write the missing
  migration before promoting.
- Boot-time `sequelize.sync()` is commented out in `server/src/index.js`, and
  `syncDatabase.js` refuses to run when `DYNO` is set.

## What it buys

- A failed migration cannot half-deploy: nothing runs until a person runs it.
- Re-running is safe, so a partial production replay recovers instead of compounding
  (`7bb9d740`, *"make pending production replay safe"*).
- Rollback is a script that exists, not a plan written after the incident. Migrations
  that repair data keep a backup table (`151_revoke_signup_leaked_memberships.js`,
  `150_dedupe_mirrored_tasks.js`).

## What it costs

- A human step between "code deployed" and "schema ready". Forgetting it is how staging
  came to sit two migrations behind its own models — `RELEASE.md` says so in as many
  words.
- Additive nullable columns only. A migration that the old code cannot tolerate has a
  broken window by construction.

## Rules when you write one

1. Bump from the current highest number. Never edit a shipped migration.
2. Idempotent: creating what exists is a no-op.
3. Implement `--rollback`. If the migration changes data, back it up to a table first.
4. Say what it does in the header, including the `Run:` and `Rollback:` lines.
5. Add a test under `server/tests/migrations/` for anything that moves data.

## Related

[../ARCHITECTURE.md §9](../ARCHITECTURE.md), `server/RELEASE.md`,
[incidents/2026-11-12-duplicate-mirrored-tasks.md](../incidents/2026-11-12-duplicate-mirrored-tasks.md)
