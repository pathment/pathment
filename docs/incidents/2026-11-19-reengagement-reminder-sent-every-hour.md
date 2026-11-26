# 2026-11-19 — A win-back reminder re-sent every hour

**Commit:** `2482d07d` *fix(reengage): send each win-back reminder once, not every hour*
**Area:** re-engagement scheduling, workspace scoping
**Impact:** about 25 emails a day to each paused mentee, from late September until the fix.

## What happened

The re-engagement job sends a paused mentee a staged win-back reminder, then advances
the membership to the next stage. The reminder went out, the stage never advanced, and
the next hourly run sent the same reminder again.

## Cause

The job loaded paused memberships **without `organization_id`**. When it then saved the
membership to record the new stage, the tenant scope read the write as a workspace
ownership change and refused it — *after* the email had already been sent. The send
succeeded, the bookkeeping failed, and the loop had no memory.

Two independent decisions met here: the tenant guard from
[decisions/0003](../decisions/0003-workspace-scoping-in-the-orm.md) doing exactly what
it should, and a send that happened before the state change that was meant to stop it.

## Fix

In `server/src/services/mentorshipPauseService.js`:

1. Load `organization_id` with the membership, so the save is a legal in-tenant write.
2. **Advance the stage before sending**, not after.
3. When several stages are overdue, send one reminder for the latest rather than one
   for each.

## Guard

`server/tests/mentee/reengage-once.test.js`.

## Lesson

An outbound side effect that is not idempotent must be ordered **after** the state
change that records it, not before. A failed write then costs a missing email, which is
recoverable, instead of an unbounded repeat, which is not.

## Related

[decisions/0001](../decisions/0001-postgres-is-the-job-queue.md),
[decisions/0003](../decisions/0003-workspace-scoping-in-the-orm.md)
