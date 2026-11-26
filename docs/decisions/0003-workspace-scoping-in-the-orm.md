# 0003 — Tenant scoping lives in the ORM layer, behind a rollout gate

**Status:** accepted; multi-workspace traffic is still gated off by default.

## Decision

Workspace (tenant) isolation is enforced by Sequelize hooks installed over every model,
not by remembering to add `where: { organizationId }` in each query. The active
workspace is resolved **before** authentication and carried in an AsyncLocalStorage
request context. A feature flag, `MULTI_TENANT_WORKSPACES_ENABLED`, decides whether
non-default workspaces may be served at all.

## Evidence in this repository

- `server/src/db/organizationScope.js` — installs the scope, adds the predicate to
  queries *and* to nested `include`s, and takes care not to turn an optional
  association into an `INNER JOIN` when it adds a security predicate.
- `server/src/middlewares/organizationContext.js` — resolves the workspace from the
  `x-pathment-workspace` header, then the origin hostname, then the default slug;
  explicitly skips `/api/platform` (operator console spans workspaces) and `/api/v1`
  (the API key decides).
- Identity models without an `organizationId` (`User`, `MentorProfile`,
  `MenteeProfile`) are scoped through a membership subquery instead.
- `skipOrganizationScope: true` is the deliberate, greppable escape hatch.
- Gate behaviour and the remaining gaps: [../TENANT_SOCKET_WORKER_AUDIT.md](../TENANT_SOCKET_WORKER_AUDIT.md),
  [../WORKSPACE_PATH_ROLLOUT.md](../WORKSPACE_PATH_ROLLOUT.md).

## What it buys

- A new model is scoped the moment it has an `organizationId` column — the default is
  safe, and forgetting is what you have to do on purpose.
- When the flag is on, a workspace-owned query with no context **throws**
  (`ForbiddenError: Workspace-owned operations require explicit context`) rather than
  quietly returning another tenant's rows.

## What it costs

- **Raw SQL bypasses the hooks entirely.** Every queue claim, reaper and aggregate
  written in raw SQL needs its own tenant predicate. This is the single largest known
  risk in the system.
- Background workers run outside a request, so they have no ambient context. The audit
  lists the scheduler, certificate worker, RAG workers and email worker as not yet
  tenant-bound.
- The scope is a Sequelize-level guarantee, not a database-level one (no row-level
  security).

## Revisit if

The documented worker gaps are closed and the data is backfilled — at which point the
gate can come off. Postgres row-level security would be the stronger replacement.

## Related

[features/multi-tenancy-workspaces.md](../features/multi-tenancy-workspaces.md),
[incidents/2026-11-15-signup-leaked-default-workspace-admin.md](../incidents/2026-11-15-signup-leaked-default-workspace-admin.md)
