# 2026-11-15 — Creating a workspace also made you an admin of the default workspace

**Commit:** `3b2407c7` *fix(security): creating a workspace no longer makes you a DevWeekends admin*
**Area:** tenancy, authorization
**Impact:** every workspace owner who signed up publicly also held an **active admin**
membership of the default workspace, and saw it in their workspace list. Two production
owners were affected (a third had already left).

## What happened

Public "create your workspace" sign-up sends no workspace header. By the resolution
order in `organizationContext`, no header plus no matching hostname falls through to the
default tenant. The `User.afterCreate` hook then joins every new account to *the
request's workspace* — with role `admin` when the account is an admin account.

So the owner of a brand-new workspace became an active admin of the default workspace.

## Cause

Two defaults that are each reasonable alone:

- "No workspace stated" resolving to the default workspace, which keeps legacy links and
  the shared app origin working.
- "A new user joins the current workspace", which is correct for invite registration.

Together, a sign-up that *has no workspace yet* was read as a sign-up *into the default
one*.

## Fix

- The `afterCreate` hook now takes `workspaceMembership: false` (the caller creates the
  membership) or an explicit workspace id. Owner sign-up and invite registration both
  pass `false` and create the one membership they mean
  (`server/src/db/index.js`, `server/src/services/authService.js`).
- Migration `151_revoke_signup_leaked_memberships.js` sets the leaked memberships to
  `left`, with a backup table and `--rollback`.

## Guard

`server/tests/auth/signup-workspace-isolation.test.js` — sign-up yields exactly one
owner membership, the workspace list shows only that workspace, and the default
workspace answers 403.

## Lesson

A fallback that makes reads convenient becomes a privilege grant the moment a **write**
uses the same resolution. Ask of any default-tenant fallback: what happens if something
*creates* a row under it?

## Related

[decisions/0003](../decisions/0003-workspace-scoping-in-the-orm.md),
[features/multi-tenancy-workspaces.md](../features/multi-tenancy-workspaces.md)
