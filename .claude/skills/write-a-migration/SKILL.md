---
name: write-a-migration
description: Write a Pathment schema or data migration in server/scripts/migrations/. Use whenever a Sequelize model under server/src/models/ changes (new table, column, type, index, enum value) or production data needs repairing. Covers numbering, idempotency, --rollback, backup tables and the test.
---

# Writing a Pathment migration

Migrations here are **hand-run, numbered, idempotent scripts** — not a framework's
generated files. Nothing applies them automatically: there is no release phase and no CI
step. See `docs/decisions/0004-hand-run-idempotent-migrations.md` for why.

## Before writing

```bash
ls server/scripts/migrations | grep -E '^[0-9]' | sort -n | tail -3   # current highest
cd server && npm run db:migrate -- --status                           # applied vs pending
```

Read the two most recent migrations. Match their shape — they are the style guide.
`157_pricing_v2.js` is a good catalogue example; `150_dedupe_mirrored_tasks.js` is a good
data-repair example.

## Rules

1. **Number from the current highest.** Never reuse, never renumber, never edit a
   migration that has shipped. A correction is a new migration. (A handful of early
   numbers — 001, 119, 120, 121 — are duplicated historically. That is not a precedent;
   take the highest number and add one.)
2. **Idempotent.** Creating what exists is a no-op. Re-running must be safe — a partial
   production replay has to recover, not compound.
3. **`--rollback` must work.** Not a comment describing what you would do.
4. **A data migration backs up first.** Write the previous state to a
   `<thing>_backup` table so `--rollback` restores it exactly. Precedents:
   `assigned_task_dedupe_backup` (150), the backup table in 151.
5. **Offer `--dry-run`** for anything that touches rows, so the change can be previewed.
6. **Additive and nullable** where possible. The old code keeps serving while the
   migration runs, so a non-nullable column or a dropped column has a broken window by
   construction. If you cannot avoid one, say so in the header and in the PR.
7. **Destructive migrations carry `drop` in the filename.** The runner skips them unless
   invoked with `--include-drops`.
8. **Tenant-owned tables need `organization_id`**, plus a backfill for existing rows.
   Raw SQL in a migration is not tenant-scoped — write the predicate yourself.

## Shape

```js
/**
 * Migration: <nnn>_<snake_name>
 *
 * <What this does and why, in prose. Name the service or model that needs it.
 *  State explicitly that it is safe to run twice.>
 *
 * Run:      node server/scripts/migrations/<nnn>_<snake_name>.js
 * Rollback: node server/scripts/migrations/<nnn>_<snake_name>.js --rollback
 */
const sequelize = require('./_db');
```

Connect only through `./_db` — it is SSL-aware and works against the managed database.

## Test it

A migration that moves data needs a test under `server/tests/migrations/` covering
**apply, re-run, and rollback**. Model: `150-dedupe-mirrored-tasks.test.js`.

```bash
cd server && npx jest tests/migrations/<name>.test.js --runInBand
cd server && npm run db:migrate -- --status
```

## Before you call it done

- The model change and the migration are in the **same commit**.
- `npm run db:migrate -- --status` lists it as pending, then applied after you run it
  locally.
- Rollback restores the previous state on your local database.
- The PR says the migration must be run **before** the code that needs it.

## Never from here

Running a migration against staging or production. That is a person following
`server/RELEASE.md`, which includes the preflight that diffs `server/src/models/`
against `server/scripts/migrations/` between `main` and `staging`.
