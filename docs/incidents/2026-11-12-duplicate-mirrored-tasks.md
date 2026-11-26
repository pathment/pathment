# 2026-11-12 — Mentees saw the same task twice in a standing clan

**Commit:** `96794889` *fix(tasks): stop duplicate tasks in standing clans and repair existing ones*
**Area:** tasks, standing clans
**Impact:** mentees saw duplicate work in their standing clan. Existing rows needed a
repair migration.

## What happened

When work is mirrored into a standing clan, the copy points back at its source through
`continued_from_task_id`. A piece of work is therefore a **chain**: cohort original →
standing copy → copy of that copy.

The mirror deduplicated on the **direct source row only**. The second time a mentee's
work was mirrored, the original *and* its earlier copy both came across. A mentee
returning to a clan got their own task copied back in.

## Cause

Dedupe was written for a pair when the data is a chain. Checking "is this exact source
already here?" is not the same question as "is any link of this chain already here?".

## Fix

`server/src/services/standingWorkMirror.js`:

- Take **one source per chain** — its newest live link.
- Skip a chain if **any** link is already in the target clan.
- Skip a step the target clan already has assigned, per occurrence for recurring work.

Migration `150_dedupe_mirrored_tasks.js`: for each
`(clan, mentee, step, occurrence)` with more than one live row and at least one mirrored
copy, keep the furthest-along row and cancel the rest. Previous state is saved to
`assigned_task_dedupe_backup`; `--rollback` restores it exactly. Idempotent, with
`--dry-run`.

## Guards

- `server/tests/clans/mirror-no-duplicates.test.js`
- `server/tests/migrations/150-dedupe-mirrored-tasks.test.js` — apply, re-run, rollback.

## Lesson

When rows carry a self-referential lineage column, the identity question is almost
always about the **chain**, not the row. Write the dedupe against the chain root or the
newest link, and say which in a comment.

## Related

[features/roadmaps-and-tasks.md](../features/roadmaps-and-tasks.md),
[decisions/0004](../decisions/0004-hand-run-idempotent-migrations.md)
